import { useState } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  if (session.shop !== process.env.ADMIN_SHOP) {
    throw new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const period = url.searchParams.get("period") || "month";

  let dateFrom;
  const now = new Date();
  if (period === "month") {
    dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === "30") {
    dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  } else {
    dateFrom = new Date("2020-01-01");
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Platform-wide summary stats
  const [ordersToday, ordersThisMonth, totalShops] = await Promise.all([
    db.order.count({ where: { createdAt: { gte: startOfDay } } }),
    db.order.count({ where: { createdAt: { gte: firstOfMonth } } }),
    db.shop.count(),
  ]);

  // Revenue this month
  const revenueThisMonthData = await db.order.findMany({
    where: { createdAt: { gte: firstOfMonth } },
    select: { total: true },
  });
  const revenueThisMonth = revenueThisMonthData.reduce((sum, o) => sum + o.total, 0);

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
      subscription: {
        select: { planName: true, status: true },
      },
    },
  });

  // Merge shop data with order counts
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

  // Add shops with 0 orders in the period (not in ordersByShop)
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
    summary: {
      totalShops,
      ordersToday,
      ordersThisMonth,
      revenueThisMonth,
    },
    rows,
    period,
  };
};

export default function MonitorPage() {
  const { summary, rows, period: initialPeriod } = useLoaderData();
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

  const StatCard = ({ label, value }) => (
    <div style={{
      backgroundColor: "white",
      borderRadius: "12px",
      border: "1px solid #e5e7eb",
      padding: "24px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    }}>
      <div style={{ fontSize: "13px", fontWeight: "500", color: "#6b7280", marginBottom: "8px" }}>{label}</div>
      <div style={{ fontSize: "28px", fontWeight: "600", color: "#111827" }}>{value}</div>
    </div>
  );

  return (
    <s-page heading="Monitor">
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: "32px",
        flexWrap: "wrap",
        gap: "16px",
      }}>
        <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
          Platform-wide metrics across all stores. Visible to admin only.
        </p>

        <div style={{
          display: "inline-flex",
          backgroundColor: "#f3f4f6",
          borderRadius: "8px",
          padding: "4px",
          gap: "4px",
        }}>
          {[
            { value: "month", label: "This month" },
            { value: "30", label: "Last 30 days" },
            { value: "all", label: "All time" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => handlePeriodChange(opt.value)}
              style={{
                padding: "8px 16px",
                border: "none",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: "500",
                cursor: "pointer",
                transition: "all 0.15s ease",
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

      {/* Summary stat cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "16px",
        marginBottom: "32px",
      }}>
        <StatCard label="Total Stores" value={summary.totalShops.toLocaleString()} />
        <StatCard label="Orders Today" value={summary.ordersToday.toLocaleString()} />
        <StatCard label="Orders This Month" value={summary.ordersThisMonth.toLocaleString()} />
        <StatCard label="Revenue This Month" value={`$${formatCurrency(summary.revenueThisMonth)}`} />
      </div>

      {/* Per-store table */}
      <div style={{
        backgroundColor: "white",
        borderRadius: "12px",
        border: "1px solid #e5e7eb",
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6" }}>
          <span style={{ fontSize: "14px", fontWeight: "600", color: "#111827" }}>
            Stores ({rows.length})
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ backgroundColor: "#f9fafb" }}>
                {["Store", "Plan", "Status", "Orders", "Revenue", "Joined"].map((h) => (
                  <th key={h} style={{
                    padding: "10px 16px",
                    textAlign: "left",
                    fontWeight: "600",
                    color: "#6b7280",
                    fontSize: "12px",
                    borderBottom: "1px solid #e5e7eb",
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.shopId}
                  style={{
                    borderBottom: i < rows.length - 1 ? "1px solid #f3f4f6" : "none",
                    backgroundColor: "white",
                  }}
                >
                  <td style={{ padding: "12px 16px", color: "#111827", fontWeight: "500" }}>
                    {row.shopifyDomain}
                  </td>
                  <td style={{ padding: "12px 16px", color: "#374151" }}>
                    {row.planName}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: "9999px",
                      fontSize: "11px",
                      fontWeight: "500",
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
                  <td style={{ padding: "12px 16px", color: "#9ca3af" }}>
                    {row.joinedAt}
                  </td>
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
