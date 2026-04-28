import prisma from "../db.server.js";
import { normalizePhone } from "./buyer.server.js";

/**
 * Calculate risk level from order stats.
 * Pure function — no DB access.
 */
export function calculateRiskLevel({ totalOrders, deliveredOrders, rtoOrders, cancelledOrders }) {
  const terminalOrders = deliveredOrders + rtoOrders;
  const rtoRate = terminalOrders > 0 ? rtoOrders / terminalOrders : 0;

  let riskLevel;
  let riskNote;

  if (terminalOrders === 0) {
    riskLevel = "UNKNOWN";
    riskNote = "No delivery data yet — awaiting fulfillment outcomes";
  } else if (rtoRate >= 0.4 && rtoOrders >= 2) {
    riskLevel = "HIGH";
    riskNote = `Buyer has ${Math.round(rtoRate * 100)}% RTO rate across ${totalOrders} orders network-wide`;
  } else if (rtoRate >= 0.2 && rtoOrders >= 1) {
    riskLevel = "MEDIUM";
    riskNote = `Buyer has ${rtoOrders} RTO out of ${totalOrders} orders network-wide`;
  } else if (deliveredOrders >= 3 && rtoRate < 0.1) {
    riskLevel = "LOW";
    riskNote = `Buyer has ${Math.round(rtoRate * 100)}% RTO rate across ${totalOrders} orders network-wide`;
  } else {
    riskLevel = "MEDIUM";
    riskNote = `Buyer has ${rtoOrders} RTO out of ${totalOrders} orders network-wide`;
  }

  return { riskLevel, riskNote };
}

/**
 * Get risk data for a phone number — called at order creation time.
 * Returns { riskLevel, riskNote, totalOrdersGlobal, rtoRateGlobal }
 */
export async function getRiskDataForOrder(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return { riskLevel: "UNKNOWN", riskNote: "New buyer — not enough order history" };
  }

  const buyer = await prisma.globalBuyer.findUnique({
    where: { phone: normalized },
  });

  if (!buyer) {
    return { riskLevel: "UNKNOWN", riskNote: "New buyer — not enough order history" };
  }

  const { riskLevel, riskNote } = calculateRiskLevel({
    totalOrders: buyer.totalOrdersGlobal,
    deliveredOrders: buyer.deliveredOrdersGlobal,
    rtoOrders: buyer.rtoOrdersGlobal,
    cancelledOrders: buyer.cancelledOrdersGlobal,
  });

  return {
    riskLevel,
    riskNote,
    totalOrdersGlobal: buyer.totalOrdersGlobal,
    rtoRateGlobal: buyer.rtoRateGlobal,
  };
}

/**
 * Recalculate risk for a buyer after delivery outcomes change.
 * Updates GlobalBuyer aggregate stats + all ShopBuyerProfile rows.
 */
export async function recalculateBuyerRisk(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return;

  const buyer = await prisma.globalBuyer.findUnique({
    where: { phone: normalized },
  });
  if (!buyer) return;

  // Aggregate delivery outcomes from Preventify orders
  const internalOutcomes = await prisma.order.groupBy({
    by: ["deliveryOutcome"],
    where: {
      phone: normalized,
      deliveryOutcome: { in: ["delivered", "returned", "cancelled"] },
    },
    _count: { id: true },
  });

  // Aggregate delivery outcomes from external sources (Courierify etc.)
  const externalOutcomes = await prisma.externalDeliveryRecord.groupBy({
    by: ["deliveryOutcome"],
    where: {
      phone: normalized,
      deliveryOutcome: { in: ["delivered", "returned", "cancelled"] },
    },
    _count: { id: true },
  });

  // Count ALL external records (terminal + non-terminal) for totalOrdersGlobal
  const externalTotal = await prisma.externalDeliveryRecord.count({
    where: { phone: normalized },
  });

  // Merge internal + external outcome counts
  let deliveredOrders = 0;
  let rtoOrders = 0;
  let cancelledOrders = 0;

  for (const row of internalOutcomes) {
    if (row.deliveryOutcome === "delivered") deliveredOrders += row._count.id;
    if (row.deliveryOutcome === "returned") rtoOrders += row._count.id;
    if (row.deliveryOutcome === "cancelled") cancelledOrders += row._count.id;
  }
  for (const row of externalOutcomes) {
    if (row.deliveryOutcome === "delivered") deliveredOrders += row._count.id;
    if (row.deliveryOutcome === "returned") rtoOrders += row._count.id;
    if (row.deliveryOutcome === "cancelled") cancelledOrders += row._count.id;
  }

  // totalOrders = Preventify orders + all external shipments (Courierify etc.)
  const combinedTotal = buyer.totalOrdersGlobal + externalTotal;

  const terminalOrders = deliveredOrders + rtoOrders;
  const rtoRate = terminalOrders > 0 ? rtoOrders / terminalOrders : 0;

  const { riskLevel } = calculateRiskLevel({
    totalOrders: combinedTotal,
    deliveredOrders,
    rtoOrders,
    cancelledOrders,
  });

  // Update GlobalBuyer with combined stats
  await prisma.globalBuyer.update({
    where: { phone: normalized },
    data: {
      totalOrdersGlobal: combinedTotal,
      deliveredOrdersGlobal: deliveredOrders,
      rtoOrdersGlobal: rtoOrders,
      cancelledOrdersGlobal: cancelledOrders,
      rtoRateGlobal: parseFloat(rtoRate.toFixed(4)),
      riskScoreGlobal: riskLevel,
      lastRiskCalculatedAt: new Date(),
    },
  });

  // Update per-shop profiles
  const shopOrders = await prisma.order.groupBy({
    by: ["shopId", "deliveryOutcome"],
    where: {
      phone: normalized,
      deliveryOutcome: { in: ["delivered", "returned", "cancelled"] },
    },
    _count: { id: true },
  });

  // Aggregate per shop
  const shopStats = {};
  for (const row of shopOrders) {
    if (!shopStats[row.shopId]) {
      shopStats[row.shopId] = { delivered: 0, rto: 0, cancelled: 0 };
    }
    if (row.deliveryOutcome === "delivered") shopStats[row.shopId].delivered = row._count.id;
    if (row.deliveryOutcome === "returned") shopStats[row.shopId].rto = row._count.id;
    if (row.deliveryOutcome === "cancelled") shopStats[row.shopId].cancelled = row._count.id;
  }

  // Update each ShopBuyerProfile
  for (const [shopId, stats] of Object.entries(shopStats)) {
    const shopTerminal = stats.delivered + stats.rto;
    const shopRtoRate = shopTerminal > 0 ? stats.rto / shopTerminal : 0;

    const profile = await prisma.shopBuyerProfile.findFirst({
      where: { shopId, buyerId: buyer.id },
    });
    if (!profile) continue;

    const shopRisk = calculateRiskLevel({
      totalOrders: profile.totalOrders,
      deliveredOrders: stats.delivered,
      rtoOrders: stats.rto,
      cancelledOrders: stats.cancelled,
    });

    await prisma.shopBuyerProfile.update({
      where: { id: profile.id },
      data: {
        completedOrders: stats.delivered,
        rtoOrders: stats.rto,
        rtoRate: parseFloat(shopRtoRate.toFixed(4)),
        riskScore: shopRisk.riskLevel,
      },
    });
  }
}
