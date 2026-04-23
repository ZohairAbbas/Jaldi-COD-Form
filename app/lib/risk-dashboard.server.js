import prisma from "../db.server.js";

/**
 * Get risk dashboard metrics for a shop.
 */
export async function getRiskMetrics(shopId) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Total orders in last 30 days
  const totalOrders = await prisma.order.count({
    where: { shopId, createdAt: { gte: thirtyDaysAgo } },
  });

  // Orders by risk level (last 30 days)
  const riskBreakdown = await prisma.order.groupBy({
    by: ["riskLevel"],
    where: { shopId, createdAt: { gte: thirtyDaysAgo } },
    _count: { id: true },
  });

  // Orders by delivery outcome (all time, for this shop)
  const outcomeBreakdown = await prisma.order.groupBy({
    by: ["deliveryOutcome"],
    where: { shopId, deliveryOutcome: { not: null } },
    _count: { id: true },
  });

  // High-risk orders in last 30 days
  const highRiskCount = riskBreakdown.find(r => r.riskLevel === "HIGH")?._count?.id || 0;
  const mediumRiskCount = riskBreakdown.find(r => r.riskLevel === "MEDIUM")?._count?.id || 0;
  const lowRiskCount = riskBreakdown.find(r => r.riskLevel === "LOW")?._count?.id || 0;
  const unknownRiskCount = riskBreakdown.find(r => r.riskLevel === "UNKNOWN")?._count?.id || 0;
  const noRiskCount = riskBreakdown.find(r => r.riskLevel === null)?._count?.id || 0;

  // Delivery outcomes
  const deliveredCount = outcomeBreakdown.find(r => r.deliveryOutcome === "delivered")?._count?.id || 0;
  const returnedCount = outcomeBreakdown.find(r => r.deliveryOutcome === "returned")?._count?.id || 0;
  const cancelledCount = outcomeBreakdown.find(r => r.deliveryOutcome === "cancelled")?._count?.id || 0;
  const inTransitCount = outcomeBreakdown.find(r => r.deliveryOutcome === "in_transit")?._count?.id || 0;

  const terminalOrders = deliveredCount + returnedCount;
  const rtoRate = terminalOrders > 0 ? returnedCount / terminalOrders : 0;

  return {
    totalOrders,
    highRiskCount,
    mediumRiskCount,
    lowRiskCount,
    unknownRiskCount,
    noRiskCount,
    deliveredCount,
    returnedCount,
    cancelledCount,
    inTransitCount,
    rtoRate: parseFloat((rtoRate * 100).toFixed(1)),
  };
}

/**
 * Get paginated order list with risk/delivery data.
 */
export async function getRiskOrders(shopId, { page = 1, perPage = 20, riskLevel, deliveryOutcome, search }) {
  const where = { shopId };

  if (riskLevel && riskLevel !== "ALL") {
    where.riskLevel = riskLevel;
  }
  if (deliveryOutcome && deliveryOutcome !== "ALL") {
    where.deliveryOutcome = deliveryOutcome;
  }
  if (search) {
    where.OR = [
      { phone: { contains: search } },
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { shopifyOrderNumber: { contains: search, mode: "insensitive" } },
    ];
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: {
        id: true,
        shopifyOrderNumber: true,
        shopifyOrderId: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        total: true,
        riskLevel: true,
        deliveryOutcome: true,
        fulfillmentStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.order.count({ where }),
  ]);

  return {
    orders,
    total,
    page,
    perPage,
    totalPages: Math.ceil(total / perPage),
  };
}

/**
 * Get buyer risk profile by phone number (for buyer detail view).
 */
export async function getBuyerProfile(shopId, phone) {
  const [globalBuyer, shopOrders] = await Promise.all([
    prisma.globalBuyer.findUnique({
      where: { phone },
      select: {
        phone: true,
        firstName: true,
        lastName: true,
        email: true,
        totalOrdersGlobal: true,
        deliveredOrdersGlobal: true,
        rtoOrdersGlobal: true,
        cancelledOrdersGlobal: true,
        rtoRateGlobal: true,
        riskScoreGlobal: true,
        createdAt: true,
        lastVerifiedAt: true,
      },
    }),
    prisma.order.findMany({
      where: { shopId, phone },
      select: {
        id: true,
        shopifyOrderNumber: true,
        total: true,
        riskLevel: true,
        deliveryOutcome: true,
        fulfillmentStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  if (!globalBuyer) return null;

  // Shop-level stats
  const shopDelivered = shopOrders.filter(o => o.deliveryOutcome === "delivered").length;
  const shopReturned = shopOrders.filter(o => o.deliveryOutcome === "returned").length;
  const shopTerminal = shopDelivered + shopReturned;
  const shopRtoRate = shopTerminal > 0 ? shopReturned / shopTerminal : 0;

  return {
    ...globalBuyer,
    shopOrders,
    shopStats: {
      totalOrders: shopOrders.length,
      deliveredOrders: shopDelivered,
      returnedOrders: shopReturned,
      rtoRate: parseFloat((shopRtoRate * 100).toFixed(1)),
    },
  };
}
