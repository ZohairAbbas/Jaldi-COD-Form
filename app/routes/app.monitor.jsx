import { useState } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Returns midnight of the current day in the configured timezone, as a UTC Date
function startOfDayInTZ(tz) {
  const now = new Date();
  // Get year/month/day in target timezone
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  const d = parts.find(p => p.type === "day").value;
  // Construct midnight in that timezone, get UTC equivalent
  return new Date(`${y}-${m}-${d}T00:00:00`);
}

// Returns first day of the current month at midnight in the configured timezone
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

// Returns start of current week (Monday) at midnight in the configured timezone
function startOfWeekInTZ(tz) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  }).formatToParts(now);
  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  const d = parseInt(parts.find(p => p.type === "day").value);
  const weekday = parts.find(p => p.type === "weekday").value; // Mon, Tue, ...
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayIndex = weekdays.indexOf(weekday);
  const diff = dayIndex === 0 ? -6 : 1 - dayIndex; // Monday = start
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

  let dateFrom;
  if (period === "24h") {
    dateFrom = startOfDayInTZ(tz);
  } else if (period === "week") {
    dateFrom = startOfWeekInTZ(tz);
  } else if (period === "month") {
    dateFrom = startOfMonthInTZ(tz);
  } else if (period === "30") {
    dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  } else {
    dateFrom = new Date("2020-01-01");
  }

  const startOfDay = startOfDayInTZ(tz);
  const firstOfMonth = startOfMonthInTZ(tz);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Fixed summary stats (not period-dependent)
  const [ordersToday, ordersThisMonth, totalShops, activeShopIds] = await Promise.all([
    db.order.count({ where: { createdAt: { gte: startOfDay } } }),
    db.order.count({ where: { createdAt: { gte: firstOfMonth } } }),
    db.shop.count(),
    db.order.groupBy({
      by: ["shopId"],
      where: { createdAt: { gte: thirtyDaysAgo } },
    }),
  ]);

  const revenueThisMonthData = await db.order.findMany({
    where: { createdAt: { gte: firstOfMonth } },
    select: { total: true },
  });
  const revenueThisMonth = revenueThisMonthData.reduce((sum, o) => sum + o.total, 0);
  const activeStores = activeShopIds.length;

  // Chart data — orders in selected period
  const chartOrders = await db.order.findMany({
    where: { createdAt: { gte: dateFrom } },
    select: { createdAt: true },
  });

  // Bucket chart data
  let chartData;
  if (period === "24h") {
    // Per-hour buckets
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
    // Per-day buckets
    const buckets = {};
    chartOrders.forEach(o => {
      const date = new Date(o.createdAt).toISOString().split("T")[0];
      buckets[date] = (buckets[date] || 0) + 1;
    });
    chartData = Object.entries(buckets)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, orders]) => ({ label: date, orders }));
  }

  // Orders per shop in selected period
  const ordersByShop = await db.order.groupBy({
    by: ["shopId"],
    _count: { id: true },
    _sum: { total: true },
    where: { createdAt: { gte: dateFrom } },
    orderBy: { _count: { id: "desc" } },
  });

  // All shops with subscription info
  const shops = await db.shop.findMany({
    select: {
      id: true,
      shopifyDomain: true,
      createdAt: true,
      subscription: { select: { planName: true, status: true } },
    },
  });

  const shopMap = Object.fromEntries(shops.map(s => [s.id, s]));
  const rows = ordersByShop.map(row => {
    const shop = shopMap[row.shopId] || {};
    return {
      shopId: row.shopId,
      shopifyDomain: shop.shopifyDomain || "Unknown",
      planName: shop.subscription?.planName || "Free",
      planStatus: shop.subscription?.status || "none",
      orderCount: row._count.id,
      revenue: row._sum.total || 0,
      joinedAt: shop.createdAt ? new Date(shop.createdAt).toISOString().split("T")[0] : "-",
    };
  });

  const shopsWithOrders = new Set(ordersByShop.map(r => r.shopId));
  for (const shop of shops) {
    if (!shopsWithOrders.has(shop.id)) {
      rows.push({
        shopId: shop.id,
        shopifyDomain: shop.shopifyDomain,
        planName: shop.subscription?.planName || "Free",
        planStatus: shop.subscription?.status || "none",
        orderCount: 0,
        revenue: 0,
        joinedAt: shop.createdAt ? new Date(shop.createdAt).toISOString().split("T")[0] : "-",
      });
    }
  }

  return {
    summary: { totalShops, ordersToday, ordersThisMonth, revenueThisMonth, activeStores },
    chartData,
    rows,
    period,
  };
};

export default function MonitorPage() {
  const { summary, chartData, rows, period: initialPeriod } = useLoaderData();
  const [selectedPeriod, setSelectedPeriod] = useState(initialPeriod);
  const navigate = useNavigate();

  const handlePeriodChange = (newPeriod) => {
    setSelectedPeriod(newPeriod);
    navigate(`/app/monitor?period=${newPeriod}`);
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
    // If it's a date string (YYYY-MM-DD), format it nicely
    if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
      return new Date(label).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
    return label; // hour label like "14:00"
  };

  const renderOrdersChart = (data) => {
    if (!data || data.length === 0) {
      return (
        <div style={{
          padding: "60px 20px",
          textAlign: "center",
          color: "#6b7280",
          backgroundColor: "#f9fafb",
          borderRadius: "8px",
          border: "1px dashed #e5e7eb",
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

    // X-axis labels (show up to 7)
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

  const StatCard = ({ label, value, sub }) => (
    <div style={{
      backgroundColor: "white", borderRadius: "12px", border: "1px solid #e5e7eb",
      padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    }}>
      <div style={{ fontSize: "13px", fontWeight: "500", color: "#6b7280", marginBottom: "8px" }}>{label}</div>
      <div style={{ fontSize: "28px", fontWeight: "600", color: "#111827" }}>{value}</div>
      {sub && <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "4px" }}>{sub}</div>}
    </div>
  );

  const periodLabel = {
    "24h": "last 24 hours",
    week: "this week",
    month: "this month",
    "30": "last 30 days",
    all: "all time",
  }[selectedPeriod] || selectedPeriod;

  return (
    <s-page heading="Monitor">
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        marginBottom: "32px", flexWrap: "wrap", gap: "16px",
      }}>
        <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
          Platform-wide metrics across all stores. Visible to admin only.
        </p>

        <div style={{
          display: "inline-flex", backgroundColor: "#f3f4f6",
          borderRadius: "8px", padding: "4px", gap: "4px",
        }}>
          {[
            { value: "24h", label: "Today" },
            { value: "week", label: "This week" },
            { value: "month", label: "This month" },
            { value: "30", label: "Last 30 days" },
            { value: "all", label: "All time" },
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
      </div>

      {/* Stat cards — 5 columns */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(5, 1fr)",
        gap: "16px", marginBottom: "32px",
      }}>
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

      {/* Platform-wide orders chart */}
      <div style={{
        backgroundColor: "white", borderRadius: "12px", border: "1px solid #e5e7eb",
        padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", marginBottom: "24px",
      }}>
        <div style={{ fontSize: "14px", fontWeight: "600", color: "#111827", marginBottom: "20px" }}>
          Orders — {periodLabel}
        </div>
        {renderOrdersChart(chartData)}
      </div>

      {/* Per-store table */}
      <div style={{
        backgroundColor: "white", borderRadius: "12px", border: "1px solid #e5e7eb",
        overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6" }}>
          <span style={{ fontSize: "14px", fontWeight: "600", color: "#111827" }}>
            Stores ({rows.length}) — {periodLabel}
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ backgroundColor: "#f9fafb" }}>
                {["Store", "Plan", "Status", "Orders", "Revenue", "Joined"].map((h) => (
                  <th key={h} style={{
                    padding: "10px 16px", textAlign: "left", fontWeight: "600",
                    color: "#6b7280", fontSize: "12px", borderBottom: "1px solid #e5e7eb",
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.shopId} style={{
                  borderBottom: i < rows.length - 1 ? "1px solid #f3f4f6" : "none",
                  backgroundColor: "white",
                }}>
                  <td style={{ padding: "12px 16px", color: "#111827", fontWeight: "500" }}>
                    {row.shopifyDomain}
                  </td>
                  <td style={{ padding: "12px 16px", color: "#374151" }}>{row.planName}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: "9999px",
                      fontSize: "11px", fontWeight: "500",
                      backgroundColor: `${planStatusColor(row.planStatus)}20`,
                      color: planStatusColor(row.planStatus),
                    }}>
                      {row.planStatus}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", color: "#374151", fontWeight: "500" }}>
                    {row.orderCount.toLocaleString()}
                  </td>
                  <td style={{ padding: "12px 16px", color: "#374151" }}>
                    ${formatCurrency(row.revenue)}
                  </td>
                  <td style={{ padding: "12px 16px", color: "#9ca3af" }}>{row.joinedAt}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: "40px", textAlign: "center", color: "#9ca3af" }}>
                    No data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
