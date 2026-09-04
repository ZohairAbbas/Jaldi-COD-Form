import { useState, useRef, useEffect } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getCronHealth } from "../lib/cron-health.server";

// Returns midnight of the current day in the configured timezone, as a UTC Date
function startOfDayInTZ(tz) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  const d = parts.find(p => p.type === "day").value;
  return new Date(`${y}-${m}-${d}T00:00:00`);
}

function startOfMonthInTZ(tz) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit",
  }).formatToParts(now);
  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  return new Date(`${y}-${m}-01T00:00:00`);
}

function startOfWeekInTZ(tz) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  }).formatToParts(now);
  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  const d = parseInt(parts.find(p => p.type === "day").value);
  const weekday = parts.find(p => p.type === "weekday").value;
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayIndex = weekdays.indexOf(weekday);
  const diff = dayIndex === 0 ? -6 : 1 - dayIndex;
  const monday = new Date(`${y}-${m}-${String(d + diff).padStart(2, "0")}T00:00:00`);
  return monday;
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  if (session.shop !== process.env.ADMIN_SHOP) {
    throw new Response("Forbidden", { status: 403 });
  }

  const tz = process.env.ADMIN_TIMEZONE || "UTC";
  const url = new URL(request.url);
  const period = url.searchParams.get("period") || "month";
  const showAll = url.searchParams.get("showAll") === "1";

  let dateFrom;
  let dateTo = null; // null = up to now
  let customFrom = null;
  let customTo = null;

  if (period === "24h") {
    dateFrom = startOfDayInTZ(tz);
  } else if (period === "week") {
    dateFrom = startOfWeekInTZ(tz);
  } else if (period === "month") {
    dateFrom = startOfMonthInTZ(tz);
  } else if (period === "30") {
    dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  } else if (period === "custom") {
    const fromParam = url.searchParams.get("from"); // YYYY-MM-DD
    const toParam = url.searchParams.get("to");     // YYYY-MM-DD
    customFrom = fromParam || null;
    customTo = toParam || null;
    dateFrom = fromParam ? new Date(`${fromParam}T00:00:00`) : new Date("2020-01-01");
    if (toParam) dateTo = new Date(`${toParam}T23:59:59.999`);
  } else {
    dateFrom = new Date("2020-01-01");
  }

  const startOfDay = startOfDayInTZ(tz);
  const firstOfMonth = startOfMonthInTZ(tz);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  // Period date filter — applies upper bound when custom range is selected
  const periodFilter = { gte: dateFrom, ...(dateTo && { lte: dateTo }) };

  // ── Batch 1: Fixed summary stats ─────────────────────────────────────────
  const [ordersToday, ordersThisMonth, totalShops, activeShopIds] = await Promise.all([
    db.order.count({ where: { createdAt: { gte: startOfDay } } }),
    db.order.count({ where: { createdAt: { gte: firstOfMonth } } }),
    db.shop.count(),
    db.order.groupBy({ by: ["shopId"], where: { createdAt: { gte: thirtyDaysAgo } } }),
  ]);

  const revenueThisMonthData = await db.order.findMany({
    where: { createdAt: { gte: firstOfMonth } },
    select: { total: true },
  });
  const revenueThisMonth = revenueThisMonthData.reduce((sum, o) => sum + o.total, 0);
  const activeStores = activeShopIds.length;

  // ── Batch 2: Period-dependent core data + new analytics queries ───────────
  const [
    chartOrders,
    ordersByShop,
    shops,
    // Feature adoption (current state, not period-filtered)
    settingsAll,
    bundlesByShop,
    upsellsByShop,
    downsellsByShop,
    pixelsByShopAndType,
    shippingByShop,
    // Conversion metrics (period-filtered)
    paymentMethodSplit,
    paymentMethodByShop,
    orderStatusDist,
    sessionFunnel,
    otpTotal,
    otpVerified,
    abandonedCartTotal,
    abandonedCartRecovered,
    abandonedCartNonRecoverable,
    lastOrderByShop,
    aovData,
    aovByShop,
    cancelledByShop,
    ordersLast7ByShop,
  ] = await Promise.all([
    // Chart data
    db.order.findMany({ where: { createdAt: periodFilter }, select: { createdAt: true } }),
    // Orders per shop
    db.order.groupBy({
      by: ["shopId"],
      _count: { id: true },
      _sum: { total: true },
      where: { createdAt: periodFilter },
      orderBy: { _count: { id: "desc" } },
    }),
    // All shops
    db.shop.findMany({
      select: { id: true, shopifyDomain: true, name: true, createdAt: true, themeEmbedEnabled: true, themeEmbedCheckedAt: true, subscription: { select: { planName: true, status: true } } },
    }),
    // Settings for all shops
    db.settings.findMany({
      select: {
        shopId: true, enableOTP: true, enableSmartCheckout: true, enableRTL: true,
        language: true, cardDiscountEnabled: true, enableUserBlocking: true,
        enableSpecificProducts: true, enableCartPermalink: true,
      },
    }),
    // Bundles enabled per shop
    db.bundle.groupBy({ by: ["shopId"], where: { enabled: true }, _count: { id: true } }),
    // Upsells enabled per shop with stats
    db.upsell.groupBy({
      by: ["shopId"],
      where: { enabled: true },
      _count: { id: true },
      _sum: { impressions: true, accepts: true, declines: true },
    }),
    // Downsells enabled per shop with stats
    db.downsell.groupBy({
      by: ["shopId"],
      where: { enabled: true },
      _count: { id: true },
      _sum: { impressions: true, accepts: true, declines: true },
    }),
    // Pixels by shop and type
    db.pixel.groupBy({ by: ["shopId", "type"], where: { enabled: true }, _count: { id: true } }),
    // Custom shipping rates per shop
    db.shippingRate.groupBy({ by: ["shopId"], where: { enabled: true, isShopifyImported: false }, _count: { id: true } }),
    // Payment method split (platform-wide, period-filtered)
    db.order.groupBy({
      by: ["paymentMethod"],
      where: { createdAt: periodFilter },
      _count: { id: true },
      _sum: { total: true },
    }),
    // Payment method per shop (period-filtered)
    db.order.groupBy({
      by: ["shopId", "paymentMethod"],
      where: { createdAt: periodFilter },
      _count: { id: true },
    }),
    // Order status distribution (period-filtered)
    db.order.groupBy({
      by: ["status"],
      where: { createdAt: periodFilter },
      _count: { id: true },
    }),
    // Session funnel (period-filtered)
    db.orderSession.groupBy({
      by: ["status"],
      where: { startedAt: periodFilter },
      _count: { id: true },
    }),
    // OTP stats (period-filtered)
    db.oTPSession.count({ where: { createdAt: periodFilter } }),
    db.oTPSession.count({ where: { createdAt: periodFilter, verified: true } }),
    // Abandoned cart recovery (period-filtered)
    db.abandonedCart.count({ where: { abandonedAt: periodFilter } }),
    db.abandonedCart.count({ where: { abandonedAt: periodFilter, recovered: true } }),
    db.abandonedCart.count({ where: { abandonedAt: periodFilter, shopifyDraftOrderId: "SKIPPED_NO_CONTACT" } }),
    // Last order per shop (all-time)
    db.order.groupBy({ by: ["shopId"], _max: { createdAt: true } }),
    // AOV (platform-wide, period-filtered)
    db.order.aggregate({ where: { createdAt: periodFilter }, _avg: { total: true }, _count: { id: true } }),
    // AOV per shop (period-filtered)
    db.order.groupBy({
      by: ["shopId"],
      where: { createdAt: periodFilter },
      _avg: { total: true },
      _count: { id: true },
    }),
    // Cancelled orders per shop (period-filtered)
    db.order.groupBy({
      by: ["shopId"],
      where: { createdAt: periodFilter, status: "cancelled" },
      _count: { id: true },
    }),
    // Orders in last 7 days per shop (for health score)
    db.order.groupBy({ by: ["shopId"], where: { createdAt: { gte: sevenDaysAgo } }, _count: { id: true } }),
  ]);

  // Bundle/upsell order detection via items JSON (only for periods ≤ 30 days)
  const canParseItems = period !== "all";
  let bundleOrdersByShop = {};
  let upsellOrdersByShop = {};
  let upsellRevByShop = {};
  let platformBundleOrders = 0;
  let platformUpsellOrders = 0;
  let platformUpsellRevenue = 0;

  if (canParseItems) {
    const ordersWithItems = await db.order.findMany({
      where: { createdAt: periodFilter },
      select: { shopId: true, items: true, total: true },
    });
    for (const order of ordersWithItems) {
      let items;
      try { items = typeof order.items === "string" ? JSON.parse(order.items) : order.items; }
      catch { items = []; }
      if (!Array.isArray(items)) items = [];

      const hasBundleDiscount = items.some(i => (i.bundleDiscount || 0) > 0);
      const upsellItems = items.filter(i => i.isUpsell);
      const hasUpsell = upsellItems.length > 0;
      const upsellRev = upsellItems.reduce((s, i) => s + ((i.price || 0) * (i.quantity || 1)), 0);

      if (hasBundleDiscount) {
        bundleOrdersByShop[order.shopId] = (bundleOrdersByShop[order.shopId] || 0) + 1;
        platformBundleOrders++;
      }
      if (hasUpsell) {
        upsellOrdersByShop[order.shopId] = (upsellOrdersByShop[order.shopId] || 0) + 1;
        upsellRevByShop[order.shopId] = (upsellRevByShop[order.shopId] || 0) + upsellRev;
        platformUpsellOrders++;
        platformUpsellRevenue += upsellRev;
      }
    }
  }

  // ── Chart data bucketing ─────────────────────────────────────────────────
  let chartData;
  if (period === "24h") {
    const buckets = {};
    for (let h = 0; h < 24; h++) {
      const label = `${String(h).padStart(2, "0")}:00`;
      buckets[label] = 0;
    }
    chartOrders.forEach(o => {
      const h = new Date(o.createdAt).getHours();
      const label = `${String(h).padStart(2, "0")}:00`;
      buckets[label] = (buckets[label] || 0) + 1;
    });
    chartData = Object.entries(buckets).map(([label, orders]) => ({ label, orders }));
  } else {
    const buckets = {};
    chartOrders.forEach(o => {
      const date = new Date(o.createdAt).toISOString().split("T")[0];
      buckets[date] = (buckets[date] || 0) + 1;
    });
    chartData = Object.entries(buckets)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, orders]) => ({ label: date, orders }));
  }

  // ── Transform feature adoption data ─────────────────────────────────────
  const settingsMap = Object.fromEntries(settingsAll.map(s => [s.shopId, s]));
  const bundlesMap = Object.fromEntries(bundlesByShop.map(r => [r.shopId, r._count.id]));
  const upsellsMap = Object.fromEntries(upsellsByShop.map(r => [r.shopId, {
    count: r._count.id,
    impressions: r._sum.impressions || 0,
    accepts: r._sum.accepts || 0,
    declines: r._sum.declines || 0,
  }]));
  const downsellsMap = Object.fromEntries(downsellsByShop.map(r => [r.shopId, {
    count: r._count.id,
    impressions: r._sum.impressions || 0,
    accepts: r._sum.accepts || 0,
    declines: r._sum.declines || 0,
  }]));

  // Pixels: shopId -> set of types
  const pixelsMap = {};
  for (const p of pixelsByShopAndType) {
    if (!pixelsMap[p.shopId]) pixelsMap[p.shopId] = new Set();
    pixelsMap[p.shopId].add(p.type);
  }

  const shippingMap = Object.fromEntries(shippingByShop.map(r => [r.shopId, r._count.id]));

  // Platform-wide pixel type counts
  const pixelTypeSummary = {};
  for (const p of pixelsByShopAndType) {
    pixelTypeSummary[p.type] = (pixelTypeSummary[p.type] || 0) + 1;
  }

  // ── Transform conversion metrics ─────────────────────────────────────────
  const codData = paymentMethodSplit.find(r => r.paymentMethod === "cod");
  const cardData = paymentMethodSplit.find(r => r.paymentMethod === "card");
  const totalPaymentOrders = (codData?._count.id || 0) + (cardData?._count.id || 0);

  const completedSessions = sessionFunnel.find(r => r.status === "completed")?._count.id || 0;
  const abandonedSessions = sessionFunnel.find(r => r.status === "abandoned")?._count.id || 0;
  const totalSessions = sessionFunnel.reduce((s, r) => s + r._count.id, 0);
  const conversionRate = totalSessions > 0 ? ((completedSessions / totalSessions) * 100).toFixed(1) : "0.0";
  const abandonmentRate = totalSessions > 0 ? ((abandonedSessions / totalSessions) * 100).toFixed(1) : "0.0";

  const cancelledOrders = orderStatusDist.find(r => r.status === "cancelled")?._count.id || 0;
  const totalOrdersInPeriod = orderStatusDist.reduce((s, r) => s + r._count.id, 0);
  const cancellationRate = totalOrdersInPeriod > 0 ? ((cancelledOrders / totalOrdersInPeriod) * 100).toFixed(1) : "0.0";

  const otpVerificationRate = otpTotal > 0 ? ((otpVerified / otpTotal) * 100).toFixed(1) : "0.0";
  const recoverableCarts = abandonedCartTotal - abandonedCartNonRecoverable;
  const cartRecoveryRate = recoverableCarts > 0 ? ((abandonedCartRecovered / recoverableCarts) * 100).toFixed(1) : "0.0";

  // Platform-wide upsell/downsell stats
  const platformUpsellImpressions = upsellsByShop.reduce((s, r) => s + (r._sum.impressions || 0), 0);
  const platformUpsellAccepts = upsellsByShop.reduce((s, r) => s + (r._sum.accepts || 0), 0);
  const platformDownsellImpressions = downsellsByShop.reduce((s, r) => s + (r._sum.impressions || 0), 0);
  const platformDownsellAccepts = downsellsByShop.reduce((s, r) => s + (r._sum.accepts || 0), 0);

  // Bundle impressions/accepts (all bundles, not period-filtered — stored counters)
  const allBundleStats = await db.bundle.aggregate({ _sum: { impressions: true, accepts: true } });
  const platformBundleImpressions = allBundleStats._sum.impressions || 0;
  const platformBundleAccepts = allBundleStats._sum.accepts || 0;

  // ── Transform per-shop data ─────────────────────────────────────────────
  const lastOrderMap = Object.fromEntries(lastOrderByShop.map(r => [r.shopId, r._max.createdAt]));
  const aovByShopMap = Object.fromEntries(aovByShop.map(r => [r.shopId, r._avg.total || 0]));
  const cancelledByShopMap = Object.fromEntries(cancelledByShop.map(r => [r.shopId, r._count.id]));
  const last7Set = new Set(ordersLast7ByShop.map(r => r.shopId));

  // Payment method per shop map: shopId -> { cod: N, card: N }
  const paymentByShopMap = {};
  for (const r of paymentMethodByShop) {
    if (!paymentByShopMap[r.shopId]) paymentByShopMap[r.shopId] = { cod: 0, card: 0 };
    paymentByShopMap[r.shopId][r.paymentMethod] = r._count.id;
  }

  // Total feature count per shop (for health score & badge)
  const TOTAL_FEATURES = 12;
  const getFeaturesCount = (shopId) => {
    const s = settingsMap[shopId] || {};
    const pixelTypes = pixelsMap[shopId] || new Set();
    let count = 0;
    if (s.enableOTP) count++;
    if (bundlesMap[shopId]) count++;
    if (upsellsMap[shopId]) count++;
    if (downsellsMap[shopId]) count++;
    if (pixelTypes.has("facebook_pixel") || pixelTypes.has("facebook_capi")) count++;
    if (pixelTypes.has("tiktok_pixel") || pixelTypes.has("tiktok_events_api")) count++;
    if (pixelTypes.has("snapchat_pixel")) count++;
    if (shippingMap[shopId]) count++;
    if (s.enableRTL || (s.language && s.language !== "en")) count++;
    if (s.cardDiscountEnabled) count++;
    if (s.enableSmartCheckout) count++;
    if (s.enableUserBlocking) count++;
    return count;
  };

  const getHealthScore = (shopId, orderCount) => {
    const lastOrder = lastOrderMap[shopId];
    const daysSinceLastOrder = lastOrder
      ? (Date.now() - new Date(lastOrder).getTime()) / (1000 * 60 * 60 * 24)
      : 999;
    const hasRecentOrders = daysSinceLastOrder <= 30 ? 1 : 0;
    const hasVeryRecentOrders = last7Set.has(shopId) ? 1 : 0;
    const featuresRatio = getFeaturesCount(shopId) / TOTAL_FEATURES;
    const cancelledCount = cancelledByShopMap[shopId] || 0;
    const noCancellations = orderCount > 0 && cancelledCount === 0 ? 0.5 : 0;
    return hasRecentOrders + hasVeryRecentOrders + featuresRatio + noCancellations;
  };

  const getStoreStatus = (shopId, orderCount, joinedAt) => {
    const lastOrder = lastOrderMap[shopId];
    const daysSinceLastOrder = lastOrder
      ? (Date.now() - new Date(lastOrder).getTime()) / (1000 * 60 * 60 * 24)
      : 999;
    const daysSinceJoined = joinedAt
      ? (Date.now() - new Date(joinedAt).getTime()) / (1000 * 60 * 60 * 24)
      : 999;
    if (orderCount === 0 && daysSinceJoined <= 7) return "new";
    if (orderCount === 0) return "never_used";
    if (daysSinceLastOrder <= 14) return "active";
    if (daysSinceLastOrder <= 60) return "dormant";
    return "inactive";
  };

  // Build rows
  const shopMap = Object.fromEntries(shops.map(s => [s.id, s]));
  const rows = ordersByShop.map(row => {
    const shop = shopMap[row.shopId] || {};
    const orderCount = row._count.id;
    return {
      shopId: row.shopId,
      shopifyDomain: shop.shopifyDomain || "Unknown",
      shopName: shop.name || null,
      planName: shop.subscription?.planName || "Free",
      planStatus: shop.subscription?.status || "none",
      orderCount,
      revenue: row._sum.total || 0,
      joinedAt: shop.createdAt ? new Date(shop.createdAt).toISOString().split("T")[0] : "-",
      aov: aovByShopMap[row.shopId] || 0,
      codCount: paymentByShopMap[row.shopId]?.cod || 0,
      cardCount: paymentByShopMap[row.shopId]?.card || 0,
      lastOrderAt: lastOrderMap[row.shopId] ? new Date(lastOrderMap[row.shopId]).toISOString().split("T")[0] : null,
      featuresCount: getFeaturesCount(row.shopId),
      healthScore: getHealthScore(row.shopId, orderCount),
      storeStatus: getStoreStatus(row.shopId, orderCount, shop.createdAt),
      themeEmbedEnabled: shop.themeEmbedEnabled ?? null,
    };
  });

  const shopsWithOrders = new Set(ordersByShop.map(r => r.shopId));
  for (const shop of shops) {
    if (!shopsWithOrders.has(shop.id)) {
      rows.push({
        shopId: shop.id,
        shopifyDomain: shop.shopifyDomain,
        shopName: shop.name || null,
        planName: shop.subscription?.planName || "Free",
        planStatus: shop.subscription?.status || "none",
        orderCount: 0,
        revenue: 0,
        joinedAt: shop.createdAt ? new Date(shop.createdAt).toISOString().split("T")[0] : "-",
        aov: 0,
        codCount: 0,
        cardCount: 0,
        lastOrderAt: lastOrderMap[shop.id] ? new Date(lastOrderMap[shop.id]).toISOString().split("T")[0] : null,
        featuresCount: getFeaturesCount(shop.id),
        healthScore: getHealthScore(shop.id, 0),
        storeStatus: getStoreStatus(shop.id, 0, shop.createdAt),
        themeEmbedEnabled: shop.themeEmbedEnabled ?? null,
      });
    }
  }

  // Feature heatmap rows (sorted by features enabled desc)
  const heatmapRows = shops.map(shop => {
    const s = settingsMap[shop.id] || {};
    const pixelTypes = pixelsMap[shop.id] || new Set();
    return {
      shopId: shop.id,
      shopifyDomain: shop.shopifyDomain,
      shopName: shop.name || null,
      storeStatus: getStoreStatus(shop.id, (ordersByShop.find(r => r.shopId === shop.id)?._count.id || 0), shop.createdAt),
      features: {
        otp: !!s.enableOTP,
        bundles: !!(bundlesMap[shop.id]),
        upsells: !!(upsellsMap[shop.id]),
        downsells: !!(downsellsMap[shop.id]),
        fbPixel: pixelTypes.has("facebook_pixel"),
        fbCapi: pixelTypes.has("facebook_capi"),
        tiktok: pixelTypes.has("tiktok_pixel") || pixelTypes.has("tiktok_events_api"),
        snapchat: pixelTypes.has("snapchat_pixel"),
        shipping: !!(shippingMap[shop.id]),
        rtl: !!(s.enableRTL || (s.language && s.language !== "en")),
        cardPayment: !!s.cardDiscountEnabled,
        smartCheckout: !!s.enableSmartCheckout,
      },
    };
  }).sort((a, b) => {
    const countA = Object.values(a.features).filter(Boolean).length;
    const countB = Object.values(b.features).filter(Boolean).length;
    return countB - countA;
  });

  // Background job health — operator-facing, so it shows every job including
  // the ones a merchant could do nothing about.
  const cronHealth = await getCronHealth().catch((e) => {
    console.error("[monitor] cron health check failed:", e);
    return null;
  });

  return {
    cronHealth,
    summary: { totalShops, ordersToday, ordersThisMonth, revenueThisMonth, activeStores },
    chartData,
    rows,
    period,
    customFrom,
    customTo,
    conversionMetrics: {
      conversionRate,
      abandonmentRate,
      aov: aovData._avg.total || 0,
      aovCount: aovData._count.id,
      cancellationRate,
      cancelledOrders,
      totalOrdersInPeriod,
      paymentSplit: {
        cod: { count: codData?._count.id || 0, revenue: codData?._sum.total || 0 },
        card: { count: cardData?._count.id || 0, revenue: cardData?._sum.total || 0 },
        total: totalPaymentOrders,
      },
      sessionFunnel: { total: totalSessions, completed: completedSessions, abandoned: abandonedSessions },
      otpStats: { total: otpTotal, verified: otpVerified, rate: otpVerificationRate },
      abandonedCartRecovery: { total: abandonedCartTotal, recovered: abandonedCartRecovered, nonRecoverable: abandonedCartNonRecoverable, recoverable: recoverableCarts, rate: cartRecoveryRate },
      bundleStats: {
        storesCount: bundlesByShop.length,
        ordersCount: canParseItems ? platformBundleOrders : null,
        impressions: platformBundleImpressions,
        accepts: platformBundleAccepts,
        acceptRate: platformBundleImpressions > 0 ? ((platformBundleAccepts / platformBundleImpressions) * 100).toFixed(1) : "0.0",
      },
      upsellStats: {
        storesCount: upsellsByShop.length,
        ordersCount: canParseItems ? platformUpsellOrders : null,
        revenue: canParseItems ? platformUpsellRevenue : null,
        impressions: platformUpsellImpressions,
        accepts: platformUpsellAccepts,
        acceptRate: platformUpsellImpressions > 0 ? ((platformUpsellAccepts / platformUpsellImpressions) * 100).toFixed(1) : "0.0",
      },
      downsellStats: {
        storesCount: downsellsByShop.length,
        impressions: platformDownsellImpressions,
        accepts: platformDownsellAccepts,
        acceptRate: platformDownsellImpressions > 0 ? ((platformDownsellAccepts / platformDownsellImpressions) * 100).toFixed(1) : "0.0",
      },
    },
    heatmapRows,
    totalFeatures: TOTAL_FEATURES,
    showAll,
  };
};

// ── UI Components ────────────────────────────────────────────────────────────

function Section({ title, subtitle, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      backgroundColor: "white", borderRadius: "12px", border: "1px solid #e5e7eb",
      marginBottom: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", padding: "16px 20px", display: "flex", justifyContent: "space-between",
          alignItems: "center", border: "none", background: "none", cursor: "pointer",
          borderBottom: open ? "1px solid #f3f4f6" : "none", borderRadius: "12px",
        }}
      >
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: "14px", fontWeight: "600", color: "#111827" }}>{title}</div>
          {subtitle && <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "2px" }}>{subtitle}</div>}
        </div>
        <span style={{ color: "#9ca3af", fontSize: "11px", fontWeight: "500", marginLeft: "16px", flexShrink: 0 }}>
          {open ? "▲ Hide" : "▼ Show"}
        </span>
      </button>
      {open && <div style={{ padding: "20px" }}>{children}</div>}
    </div>
  );
}

/**
 * Background job health, operator view.
 *
 * Shows every scheduled job, including the ones a merchant could do nothing
 * about. Reports the two failure modes separately — a job can be running
 * perfectly on schedule while accomplishing nothing, which is precisely how
 * three jobs stayed broken for months.
 */
function CronHealthPanel({ health }) {
  if (!health) return null;

  const jobs = Object.values(health.jobs);
  const unhealthy = jobs.filter((j) => !j.healthy);
  const ok = health.healthy;

  const fmtAge = (m) => {
    if (m === null || m === undefined) return "never run";
    if (m < 60) return `${m}m ago`;
    if (m < 1440) return `${Math.round(m / 60)}h ago`;
    return `${Math.round(m / 1440)}d ago`;
  };

  return (
    <div style={{
      backgroundColor: "white", borderRadius: "12px",
      border: `1px solid ${ok ? "#e5e7eb" : "#fecaca"}`,
      borderLeft: `4px solid ${ok ? "#10b981" : "#dc2626"}`,
      padding: "20px 24px", marginBottom: "16px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ fontSize: "15px", fontWeight: 600, color: "#111827" }}>
          Background jobs
        </div>
        <div style={{ fontSize: "13px", fontWeight: 600, color: ok ? "#065f46" : "#991b1b" }}>
          {ok ? "All healthy" : `${unhealthy.length} needing attention`}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px" }}>
        {jobs.map((j) => {
          const tone = j.healthy ? "#10b981" : j.failing ? "#dc2626" : "#d97706";
          const note = j.failing
            ? `errored on last ${j.consecutiveErrorRuns} runs`
            : j.overdue
              ? `overdue — expected every ${j.maxAgeMinutes}m`
              : j.lastErrors > 0
                ? `${j.lastErrors} error(s) last run`
                : `${j.lastProcessed.toLocaleString()} processed`;

          return (
            <div key={j.jobName} style={{
              border: "1px solid #f3f4f6", borderRadius: "8px", padding: "12px 14px",
              backgroundColor: j.healthy ? "#ffffff" : "#fffbf5",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: tone, flexShrink: 0 }} />
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#111827" }}>{j.label}</span>
              </div>
              <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "6px" }}>
                {fmtAge(j.ageMinutes)} · {note}
              </div>
            </div>
          );
        })}
      </div>

      {health.problems.length > 0 && (
        <ul style={{ margin: "14px 0 0", paddingLeft: "18px", fontSize: "13px", color: "#991b1b" }}>
          {health.problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      backgroundColor: "white", borderRadius: "12px", border: "1px solid #e5e7eb",
      padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      borderTop: accent ? `3px solid ${accent}` : undefined,
    }}>
      <div style={{ fontSize: "12px", fontWeight: "500", color: "#6b7280", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: "26px", fontWeight: "700", color: "#111827" }}>{value}</div>
      {sub && <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "4px" }}>{sub}</div>}
    </div>
  );
}

function MiniBar({ label, value, max, color, count, extra }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
        <span style={{ fontSize: "13px", color: "#374151", fontWeight: "500" }}>{label}</span>
        <span style={{ fontSize: "12px", color: "#6b7280" }}>
          {count.toLocaleString()}{extra ? ` · ${extra}` : ""}
        </span>
      </div>
      <div style={{ height: "8px", backgroundColor: "#f3f4f6", borderRadius: "4px", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, backgroundColor: color, borderRadius: "4px" }} />
      </div>
    </div>
  );
}

function Dot({ on }) {
  return (
    <div style={{
      width: "10px", height: "10px", borderRadius: "50%",
      backgroundColor: on ? "#10b981" : "#e5e7eb",
      display: "inline-block",
    }} />
  );
}

// Wraps a horizontally-scrollable table with a mirrored scrollbar on top
function StickyScrollTable({ children }) {
  const topBarRef = useRef(null);
  const innerRef = useRef(null);
  const phantomRef = useRef(null);
  const isSyncing = useRef(false);

  useEffect(() => {
    const topBar = topBarRef.current;
    const inner = innerRef.current;
    const phantom = phantomRef.current;
    if (!topBar || !inner || !phantom) return;

    // Set phantom width to match scrollable content
    const syncPhantomWidth = () => {
      phantom.style.width = inner.scrollWidth + "px";
    };
    syncPhantomWidth();

    const onTopScroll = () => {
      if (isSyncing.current) return;
      isSyncing.current = true;
      inner.scrollLeft = topBar.scrollLeft;
      isSyncing.current = false;
    };
    const onInnerScroll = () => {
      if (isSyncing.current) return;
      isSyncing.current = true;
      topBar.scrollLeft = inner.scrollLeft;
      isSyncing.current = false;
    };

    topBar.addEventListener("scroll", onTopScroll);
    inner.addEventListener("scroll", onInnerScroll);
    const ro = new ResizeObserver(syncPhantomWidth);
    ro.observe(inner);

    return () => {
      topBar.removeEventListener("scroll", onTopScroll);
      inner.removeEventListener("scroll", onInnerScroll);
      ro.disconnect();
    };
  }, []);

  return (
    <>
      {/* Top scrollbar mirror */}
      <div ref={topBarRef} style={{ overflowX: "auto", overflowY: "hidden", height: "12px", marginBottom: "2px" }}>
        <div ref={phantomRef} style={{ height: "1px" }} />
      </div>
      {/* Actual scrollable content */}
      <div ref={innerRef} style={{ overflowX: "auto" }}>
        {children}
      </div>
    </>
  );
}

export default function MonitorPage() {
  const { cronHealth, summary, chartData, rows, period: initialPeriod, customFrom: initialFrom, customTo: initialTo, conversionMetrics, heatmapRows, totalFeatures, showAll } = useLoaderData();
  const [selectedPeriod, setSelectedPeriod] = useState(initialPeriod);
  const [customFrom, setCustomFrom] = useState(initialFrom || "");
  const [customTo, setCustomTo] = useState(initialTo || "");
  const navigate = useNavigate();

  const handlePeriodChange = (newPeriod) => {
    setSelectedPeriod(newPeriod);
    if (newPeriod !== "custom") navigate(`/app/monitor?period=${newPeriod}`);
  };

  const applyCustomRange = () => {
    if (!customFrom || !customTo) return;
    navigate(`/app/monitor?period=custom&from=${customFrom}&to=${customTo}`);
  };

  const formatCurrency = (amount) =>
    amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const planStatusColor = (status) => {
    if (status === "active") return "#10b981";
    if (status === "trialing") return "#f59e0b";
    if (status === "cancelled" || status === "none") return "#9ca3af";
    return "#6b7280";
  };

  const formatLabel = (label) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
      return new Date(label).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
    return label;
  };

  const healthColor = (score) => {
    if (score >= 3) return "#10b981";
    if (score >= 1.5) return "#f59e0b";
    return "#ef4444";
  };

  const renderOrdersChart = (data) => {
    if (!data || data.length === 0) {
      return (
        <div style={{
          padding: "60px 20px", textAlign: "center", color: "#6b7280",
          backgroundColor: "#f9fafb", borderRadius: "8px", border: "1px dashed #e5e7eb",
        }}>
          <div style={{ fontSize: "14px", fontWeight: "500" }}>No data available</div>
          <div style={{ fontSize: "12px", marginTop: "4px" }}>Orders will appear here once placed</div>
        </div>
      );
    }

    const values = data.map(d => d.orders);
    const maxValue = Math.max(...values) || 1;
    const step = maxValue / 4;
    const yAxisValues = [0, 1, 2, 3, 4].map(i => Math.round(step * i));
    const chartHeight = 180;
    const chartWidth = 100;
    const padding = { top: 10, bottom: 0 };

    const points = data.map((d, i) => ({
      x: (i / (data.length - 1)) * chartWidth,
      y: padding.top + (chartHeight - padding.top - padding.bottom) * (1 - d.orders / maxValue),
    }));

    let linePath = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cpx = (p0.x + p1.x) / 2;
      linePath += ` C ${cpx} ${p0.y}, ${cpx} ${p1.y}, ${p1.x} ${p1.y}`;
    }
    const areaPath = `${linePath} L ${chartWidth} ${chartHeight} L 0 ${chartHeight} Z`;

    const getXLabels = () => {
      if (data.length <= 7) return data.map((d, i) => ({ label: d.label, position: (i / Math.max(data.length - 1, 1)) * 100 }));
      const step = Math.ceil(data.length / 6);
      const labels = [];
      for (let i = 0; i < data.length; i += step) {
        labels.push({ label: data[i].label, position: (i / (data.length - 1)) * 100 });
      }
      if (labels[labels.length - 1].label !== data[data.length - 1].label) {
        labels.push({ label: data[data.length - 1].label, position: 100 });
      }
      return labels;
    };

    return (
      <div style={{ display: "flex", gap: "8px" }}>
        <div style={{
          display: "flex", flexDirection: "column", justifyContent: "space-between",
          paddingTop: "10px", paddingBottom: "24px", minWidth: "30px", textAlign: "right",
        }}>
          {[...yAxisValues].reverse().map((val, i) => (
            <span key={i} style={{ fontSize: "11px", color: "#6b7280", lineHeight: "1" }}>{val}</span>
          ))}
        </div>
        <div style={{ flex: 1, position: "relative" }}>
          <svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" style={{ overflow: "visible" }}>
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
              <line key={i} x1="0" y1={padding.top + (chartHeight - padding.top - padding.bottom) * ratio} x2={chartWidth} y2={padding.top + (chartHeight - padding.top - padding.bottom) * ratio} stroke="#e5e7eb" strokeWidth="0.3" />
            ))}
            <defs>
              <linearGradient id="gradient-orders" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#gradient-orders)" />
            <path d={linePath} fill="none" stroke="#6366f1" strokeWidth="0.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <div style={{ position: "relative", height: "24px", marginTop: "4px", borderTop: "1px solid #e5e7eb" }}>
            {getXLabels().map((l, i) => (
              <span key={i} style={{
                position: "absolute", left: `${l.position}%`, transform: "translateX(-50%)",
                fontSize: "10px", color: "#6b7280", whiteSpace: "nowrap", paddingTop: "6px",
              }}>
                {formatLabel(l.label)}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const periodLabel = selectedPeriod === "custom" && customFrom && customTo
    ? `${customFrom} → ${customTo}`
    : ({
        "24h": "last 24 hours",
        week: "this week",
        month: "this month",
        "30": "last 30 days",
        all: "all time",
      }[selectedPeriod] || selectedPeriod);

  const ACTIVE_STATUSES = ["active", "dormant", "new"];
  const filteredRows = showAll ? rows : rows.filter(r => ACTIVE_STATUSES.includes(r.storeStatus));
  const filteredHeatmapRows = showAll ? heatmapRows : heatmapRows.filter(r => ACTIVE_STATUSES.includes(r.storeStatus));
  const hiddenCount = rows.length - filteredRows.length;

  const { paymentSplit, sessionFunnel: sf, otpStats, abandonedCartRecovery: acr,
    bundleStats, upsellStats, downsellStats } = conversionMetrics;

  const codPct = paymentSplit.total > 0 ? ((paymentSplit.cod.count / paymentSplit.total) * 100).toFixed(0) : 0;
  const cardPct = paymentSplit.total > 0 ? ((paymentSplit.card.count / paymentSplit.total) * 100).toFixed(0) : 0;

  // Heatmap feature columns definition
  const featureCols = [
    { key: "otp", label: "OTP" },
    { key: "bundles", label: "Bundles" },
    { key: "upsells", label: "Upsells" },
    { key: "downsells", label: "Downsells" },
    { key: "fbPixel", label: "FB Pixel" },
    { key: "fbCapi", label: "FB CAPI" },
    { key: "tiktok", label: "TikTok" },
    { key: "snapchat", label: "Snapchat" },
    { key: "shipping", label: "Shipping" },
    { key: "rtl", label: "RTL/AR" },
    { key: "cardPayment", label: "Card Pay" },
    { key: "smartCheckout", label: "Smart CO" },
  ];

  return (
    <s-page heading="Monitor">
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        marginBottom: "24px", flexWrap: "wrap", gap: "16px",
      }}>
        <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
          Platform-wide metrics across all stores. Visible to admin only.
        </p>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
          <div style={{ display: "inline-flex", backgroundColor: "#f3f4f6", borderRadius: "8px", padding: "4px", gap: "4px" }}>
            {[
              { value: "24h", label: "Today" },
              { value: "week", label: "This week" },
              { value: "month", label: "This month" },
              { value: "30", label: "Last 30 days" },
              { value: "all", label: "All time" },
              { value: "custom", label: "Custom" },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => handlePeriodChange(opt.value)}
                style={{
                  padding: "8px 14px", border: "none", borderRadius: "6px",
                  fontSize: "13px", fontWeight: "500", cursor: "pointer", transition: "all 0.15s ease",
                  backgroundColor: selectedPeriod === opt.value ? "white" : "transparent",
                  color: selectedPeriod === opt.value ? "#111827" : "#6b7280",
                  boxShadow: selectedPeriod === opt.value ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {selectedPeriod === "custom" && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                style={{
                  padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: "6px",
                  fontSize: "13px", color: "#111827", backgroundColor: "white",
                }}
              />
              <span style={{ fontSize: "13px", color: "#6b7280" }}>to</span>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                style={{
                  padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: "6px",
                  fontSize: "13px", color: "#111827", backgroundColor: "white",
                }}
              />
              <button
                onClick={applyCustomRange}
                disabled={!customFrom || !customTo}
                style={{
                  padding: "6px 14px", border: "none", borderRadius: "6px",
                  fontSize: "13px", fontWeight: "600", cursor: customFrom && customTo ? "pointer" : "not-allowed",
                  backgroundColor: customFrom && customTo ? "#111827" : "#e5e7eb",
                  color: customFrom && customTo ? "white" : "#9ca3af",
                }}
              >
                Apply
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Background job health. Sits above the metrics deliberately: a broken
          job makes every number below it untrustworthy. */}
      <CronHealthPanel health={cronHealth} />

      {/* Stat cards row 1 — fixed summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "16px", marginBottom: "16px" }}>
        <StatCard label="Total Stores" value={summary.totalShops.toLocaleString()} />
        <StatCard label="Orders Today" value={summary.ordersToday.toLocaleString()} />
        <StatCard label="Orders This Month" value={summary.ordersThisMonth.toLocaleString()} />
        <StatCard label="Revenue This Month" value={`$${formatCurrency(summary.revenueThisMonth)}`} />
        <StatCard
          label="Active Stores"
          value={summary.activeStores.toLocaleString()}
          sub={`${summary.totalShops - summary.activeStores} inactive (last 30d)`}
        />
      </div>

      {/* Stat cards row 2 — period-dependent */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "24px" }}>
        <StatCard
          label="Conversion Rate"
          value={`${conversionMetrics.conversionRate}%`}
          sub={`${sf.completed.toLocaleString()} of ${sf.total.toLocaleString()} sessions`}
          accent="#10b981"
        />
        <StatCard
          label="Avg Order Value"
          value={`$${formatCurrency(conversionMetrics.aov)}`}
          sub={`${conversionMetrics.aovCount.toLocaleString()} orders`}
          accent="#6366f1"
        />
        <StatCard
          label="COD / Card Split"
          value={`${codPct}% / ${cardPct}%`}
          sub={`${paymentSplit.cod.count.toLocaleString()} COD · ${paymentSplit.card.count.toLocaleString()} Card`}
          accent="#f59e0b"
        />
        <StatCard
          label="Cancellation Rate"
          value={`${conversionMetrics.cancellationRate}%`}
          sub={`${conversionMetrics.cancelledOrders.toLocaleString()} of ${conversionMetrics.totalOrdersInPeriod.toLocaleString()} orders`}
          accent="#ef4444"
        />
      </div>

      {/* Orders chart */}
      <div style={{
        backgroundColor: "white", borderRadius: "12px", border: "1px solid #e5e7eb",
        padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", marginBottom: "24px",
      }}>
        <div style={{ fontSize: "14px", fontWeight: "600", color: "#111827", marginBottom: "20px" }}>
          Orders — {periodLabel}
        </div>
        {renderOrdersChart(chartData)}
      </div>

      {/* Payment & Conversion section */}
      <Section title="Payment & Conversion" subtitle={`${periodLabel} · session funnel and payment method breakdown`} defaultOpen={true}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          {/* Payment split */}
          <div style={{ backgroundColor: "#f9fafb", borderRadius: "8px", padding: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: "600", color: "#111827", marginBottom: "16px" }}>Payment Method Split</div>
            <MiniBar label="COD" value={paymentSplit.cod.count} max={paymentSplit.total} color="#10b981" count={paymentSplit.cod.count} extra={`$${formatCurrency(paymentSplit.cod.revenue)}`} />
            <MiniBar label="Card" value={paymentSplit.card.count} max={paymentSplit.total} color="#6366f1" count={paymentSplit.card.count} extra={`$${formatCurrency(paymentSplit.card.revenue)}`} />
            {paymentSplit.total > 0 && (
              <div style={{ marginTop: "12px", height: "12px", borderRadius: "6px", overflow: "hidden", display: "flex" }}>
                <div style={{ width: `${codPct}%`, backgroundColor: "#10b981" }} />
                <div style={{ flex: 1, backgroundColor: "#6366f1" }} />
              </div>
            )}
          </div>
          {/* Session funnel */}
          <div style={{ backgroundColor: "#f9fafb", borderRadius: "8px", padding: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: "600", color: "#111827", marginBottom: "16px" }}>Session Funnel</div>
            <MiniBar label="Total Sessions" value={sf.total} max={sf.total} color="#6366f1" count={sf.total} />
            <MiniBar label="Completed (Orders)" value={sf.completed} max={sf.total} color="#10b981" count={sf.completed} extra={`${conversionMetrics.conversionRate}%`} />
            <MiniBar label="Abandoned" value={sf.abandoned} max={sf.total} color="#ef4444" count={sf.abandoned} extra={`${conversionMetrics.abandonmentRate}%`} />
          </div>
        </div>
      </Section>

      {/* OTP & Recovery section */}
      <Section title="OTP & Cart Recovery" subtitle="Verification rates and abandoned cart recovery">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          <div style={{ backgroundColor: "#f9fafb", borderRadius: "8px", padding: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: "600", color: "#111827", marginBottom: "16px" }}>OTP Verification — {periodLabel}</div>
            {otpStats.total === 0 ? (
              <div style={{ fontSize: "13px", color: "#9ca3af" }}>No OTP sessions in this period</div>
            ) : (
              <>
                <MiniBar label="OTP Sent" value={otpStats.total} max={otpStats.total} color="#6366f1" count={otpStats.total} />
                <MiniBar label="Verified" value={otpStats.verified} max={otpStats.total} color="#10b981" count={otpStats.verified} extra={`${otpStats.rate}%`} />
                <MiniBar label="Not Verified" value={otpStats.total - otpStats.verified} max={otpStats.total} color="#f59e0b" count={otpStats.total - otpStats.verified} extra={`${(100 - parseFloat(otpStats.rate)).toFixed(1)}%`} />
              </>
            )}
          </div>
          <div style={{ backgroundColor: "#f9fafb", borderRadius: "8px", padding: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: "600", color: "#111827", marginBottom: "16px" }}>Abandoned Cart Recovery — {periodLabel}</div>
            {acr.total === 0 ? (
              <div style={{ fontSize: "13px", color: "#9ca3af" }}>No abandoned carts in this period</div>
            ) : (
              <>
                <MiniBar label="Abandoned" value={acr.total} max={acr.total} color="#f59e0b" count={acr.total} />
                <MiniBar label="Recovered" value={acr.recovered} max={acr.total} color="#10b981" count={acr.recovered} extra={`${acr.rate}%`} />
                {acr.nonRecoverable > 0 && (
                  <MiniBar label="Non-recoverable" value={acr.nonRecoverable} max={acr.total} color="#9ca3af" count={acr.nonRecoverable} extra="No contact" />
                )}
              </>
            )}
          </div>
        </div>
      </Section>

      {/* Sales Booster Stats section */}
      <Section title="Sales Boosters" subtitle="Bundle, upsell, and downsell performance across all stores">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px" }}>
          {/* Bundles */}
          <div style={{ backgroundColor: "#f9fafb", borderRadius: "8px", padding: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: "600", color: "#111827", marginBottom: "4px" }}>Bundles</div>
            <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "12px" }}>{bundleStats.storesCount} stores with active bundles</div>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "20px", fontWeight: "700", color: "#111827" }}>
                  {bundleStats.acceptRate}%
                </div>
                <div style={{ fontSize: "11px", color: "#6b7280" }}>Acceptance rate</div>
              </div>
              <div>
                <div style={{ fontSize: "20px", fontWeight: "700", color: "#111827" }}>
                  {bundleStats.ordersCount !== null ? bundleStats.ordersCount.toLocaleString() : "N/A"}
                </div>
                <div style={{ fontSize: "11px", color: "#6b7280" }}>Bundle orders ({periodLabel})</div>
              </div>
            </div>
            <div style={{ marginTop: "8px", fontSize: "11px", color: "#9ca3af" }}>
              {bundleStats.impressions.toLocaleString()} impressions · {bundleStats.accepts.toLocaleString()} accepts (all time)
            </div>
          </div>
          {/* Upsells */}
          <div style={{ backgroundColor: "#f9fafb", borderRadius: "8px", padding: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: "600", color: "#111827", marginBottom: "4px" }}>Upsells</div>
            <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "12px" }}>{upsellStats.storesCount} stores with active upsells</div>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "20px", fontWeight: "700", color: "#111827" }}>{upsellStats.acceptRate}%</div>
                <div style={{ fontSize: "11px", color: "#6b7280" }}>Acceptance rate</div>
              </div>
              <div>
                <div style={{ fontSize: "20px", fontWeight: "700", color: "#111827" }}>
                  {upsellStats.revenue !== null ? `$${formatCurrency(upsellStats.revenue)}` : "N/A"}
                </div>
                <div style={{ fontSize: "11px", color: "#6b7280" }}>Upsell revenue ({periodLabel})</div>
              </div>
            </div>
            <div style={{ marginTop: "8px", fontSize: "11px", color: "#9ca3af" }}>
              {upsellStats.impressions.toLocaleString()} impressions · {upsellStats.accepts.toLocaleString()} accepts (all time)
            </div>
          </div>
          {/* Downsells */}
          <div style={{ backgroundColor: "#f9fafb", borderRadius: "8px", padding: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: "600", color: "#111827", marginBottom: "4px" }}>Downsells</div>
            <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "12px" }}>{downsellStats.storesCount} stores with active downsells</div>
            <div style={{ display: "flex", gap: "12px" }}>
              <div>
                <div style={{ fontSize: "20px", fontWeight: "700", color: "#111827" }}>{downsellStats.acceptRate}%</div>
                <div style={{ fontSize: "11px", color: "#6b7280" }}>Acceptance rate</div>
              </div>
            </div>
            <div style={{ marginTop: "8px", fontSize: "11px", color: "#9ca3af" }}>
              {downsellStats.impressions.toLocaleString()} impressions · {downsellStats.accepts.toLocaleString()} accepts (all time)
            </div>
          </div>
        </div>
      </Section>

      {/* Feature Adoption Heatmap section */}
      <Section title="Feature Adoption Heatmap" subtitle="Which features each store has enabled — sorted by feature count">
        <StickyScrollTable>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ backgroundColor: "#f9fafb" }}>
                <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: "600", color: "#374151", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap", position: "sticky", left: 0, backgroundColor: "#f9fafb", zIndex: 1 }}>
                  Store
                </th>
                {featureCols.map(col => (
                  <th key={col.key} style={{ padding: "8px 10px", textAlign: "center", fontWeight: "600", color: "#6b7280", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap", fontSize: "11px" }}>
                    {col.label}
                  </th>
                ))}
                <th style={{ padding: "8px 10px", textAlign: "center", fontWeight: "600", color: "#6b7280", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap", fontSize: "11px" }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredHeatmapRows.map((row, i) => {
                const enabledCount = Object.values(row.features).filter(Boolean).length;
                const statusDotColor = { active: "#10b981", dormant: "#f59e0b", inactive: "#ef4444", never_used: "#d1d5db", new: "#3b82f6" }[row.storeStatus] || "#d1d5db";
                return (
                  <tr key={row.shopId} style={{ borderBottom: i < filteredHeatmapRows.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", position: "sticky", left: 0, backgroundColor: "white", zIndex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: statusDotColor, flexShrink: 0 }} title={row.storeStatus} />
                        <div style={{ fontWeight: "500", color: "#374151" }}>{row.shopName || row.shopifyDomain.replace(".myshopify.com", "")}</div>
                      </div>
                      {row.shopName && <div style={{ fontSize: "10px", color: "#9ca3af", marginLeft: "13px" }}>{row.shopifyDomain.replace(".myshopify.com", "")}</div>}
                    </td>
                    {featureCols.map(col => (
                      <td key={col.key} style={{ padding: "8px 10px", textAlign: "center" }}>
                        <Dot on={row.features[col.key]} />
                      </td>
                    ))}
                    <td style={{ padding: "8px 10px", textAlign: "center" }}>
                      <span style={{
                        display: "inline-block", padding: "1px 6px", borderRadius: "9999px",
                        fontSize: "11px", fontWeight: "600",
                        backgroundColor: enabledCount >= 6 ? "#d1fae5" : enabledCount >= 3 ? "#fef3c7" : "#f3f4f6",
                        color: enabledCount >= 6 ? "#065f46" : enabledCount >= 3 ? "#92400e" : "#6b7280",
                      }}>
                        {enabledCount}/{totalFeatures}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {/* Summary footer row */}
              {filteredHeatmapRows.length > 0 && (
                <tr style={{ backgroundColor: "#f9fafb", borderTop: "2px solid #e5e7eb" }}>
                  <td style={{ padding: "8px 12px", fontWeight: "600", color: "#374151", fontSize: "11px", position: "sticky", left: 0, backgroundColor: "#f9fafb" }}>
                    {filteredHeatmapRows.length}{!showAll && heatmapRows.length > filteredHeatmapRows.length ? ` of ${heatmapRows.length}` : ""} stores
                  </td>
                  {featureCols.map(col => {
                    const count = filteredHeatmapRows.filter(r => r.features[col.key]).length;
                    return (
                      <td key={col.key} style={{ padding: "8px 10px", textAlign: "center", fontSize: "11px", color: "#6b7280" }}>
                        {count}/{filteredHeatmapRows.length}
                      </td>
                    );
                  })}
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </StickyScrollTable>
      </Section>

      {/* Per-store table */}
      <div style={{
        backgroundColor: "white", borderRadius: "12px", border: "1px solid #e5e7eb",
        overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "14px", fontWeight: "600", color: "#111827" }}>
            Stores — {periodLabel}
            {" "}
            <span style={{ fontWeight: "400", color: "#6b7280", fontSize: "13px" }}>
              {showAll ? `${rows.length} total` : `${filteredRows.length} active${hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ""}`}
            </span>
          </span>
          <button
            onClick={() => {
              const params = new URLSearchParams(window.location.search);
              if (showAll) params.delete("showAll"); else params.set("showAll", "1");
              navigate(`?${params.toString()}`);
            }}
            style={{ fontSize: "12px", color: "#6b7280", background: "none", border: "1px solid #e5e7eb", borderRadius: "6px", padding: "4px 10px", cursor: "pointer" }}
          >
            {showAll ? "Active only" : "Show all"}
          </button>
        </div>
        <StickyScrollTable>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ backgroundColor: "#f9fafb" }}>
                {["Health", "Store", "Status", "Orders", "Revenue", "AOV", "COD / Card", "Last Order", "App Embed", "Features", "Joined"].map((h) => (
                  <th key={h} style={{
                    padding: "10px 16px", textAlign: "left", fontWeight: "600",
                    color: "#6b7280", fontSize: "12px", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap",
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, i) => {
                const daysSince = row.lastOrderAt
                  ? (Date.now() - new Date(row.lastOrderAt).getTime()) / (1000 * 60 * 60 * 24)
                  : 999;
                const lastOrderColor = daysSince > 30 ? "#ef4444" : daysSince > 7 ? "#f59e0b" : "#10b981";
                const storeStatusConfig = {
                  active:     { label: "Active",      bg: "#d1fae5", color: "#065f46" },
                  dormant:    { label: "Dormant",     bg: "#fef3c7", color: "#92400e" },
                  inactive:   { label: "Inactive",    bg: "#fee2e2", color: "#991b1b" },
                  never_used: { label: "Never used",  bg: "#f3f4f6", color: "#6b7280" },
                  new:        { label: "New",         bg: "#dbeafe", color: "#1e40af" },
                }[row.storeStatus] || { label: row.storeStatus, bg: "#f3f4f6", color: "#6b7280" };
                return (
                  <tr key={row.shopId} style={{
                    borderBottom: i < filteredRows.length - 1 ? "1px solid #f3f4f6" : "none",
                    backgroundColor: "white",
                  }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{
                        width: "10px", height: "10px", borderRadius: "50%",
                        backgroundColor: healthColor(row.healthScore),
                        display: "inline-block",
                      }} title={`Health score: ${row.healthScore.toFixed(1)}`} />
                    </td>
                    <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                      <div style={{ fontWeight: "500", color: "#111827" }}>{row.shopName || row.shopifyDomain}</div>
                      {row.shopName && <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "1px" }}>{row.shopifyDomain}</div>}
                      <div style={{ fontSize: "11px", color: planStatusColor(row.planStatus), marginTop: "1px" }}>{row.planName} · {row.planStatus}</div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{
                        display: "inline-block", padding: "2px 8px", borderRadius: "9999px",
                        fontSize: "11px", fontWeight: "500",
                        backgroundColor: storeStatusConfig.bg,
                        color: storeStatusConfig.color,
                      }}>
                        {storeStatusConfig.label}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#374151", fontWeight: "500" }}>
                      {row.orderCount.toLocaleString()}
                    </td>
                    <td style={{ padding: "12px 16px", color: "#374151" }}>
                      ${formatCurrency(row.revenue)}
                    </td>
                    <td style={{ padding: "12px 16px", color: "#374151" }}>
                      {row.aov > 0 ? `$${formatCurrency(row.aov)}` : "—"}
                    </td>
                    <td style={{ padding: "12px 16px", color: "#374151", whiteSpace: "nowrap" }}>
                      {row.codCount > 0 || row.cardCount > 0 ? `${row.codCount} / ${row.cardCount}` : "—"}
                    </td>
                    <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                      {row.lastOrderAt ? (
                        <span style={{ color: lastOrderColor, fontWeight: "500" }}>{row.lastOrderAt}</span>
                      ) : (
                        <span style={{ color: "#9ca3af" }}>Never</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>
                      {row.themeEmbedEnabled === true ? (
                        <span style={{ color: "#10b981", fontWeight: "600" }}>✓</span>
                      ) : row.themeEmbedEnabled === false ? (
                        <span style={{ color: "#ef4444" }}>✗</span>
                      ) : (
                        <span style={{ color: "#d1d5db" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{
                        display: "inline-block", padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: "600",
                        backgroundColor: row.featuresCount >= 6 ? "#d1fae5" : row.featuresCount >= 3 ? "#fef3c7" : "#f3f4f6",
                        color: row.featuresCount >= 6 ? "#065f46" : row.featuresCount >= 3 ? "#92400e" : "#6b7280",
                      }}>
                        {row.featuresCount}/{totalFeatures}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#9ca3af" }}>{row.joinedAt}</td>
                  </tr>
                );
              })}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ padding: "40px", textAlign: "center", color: "#9ca3af" }}>
                    No data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </StickyScrollTable>
      </div>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
