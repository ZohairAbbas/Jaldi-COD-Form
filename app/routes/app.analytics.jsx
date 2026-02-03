import { useState } from "react";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { getOrCreateShop } from "../lib/db.server";
import { getCurrencySymbol } from "../lib/constants";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  // Get time period from query params (default: 30 days)
  const url = new URL(request.url);
  const period = url.searchParams.get("period") || "30";

  let daysAgo;
  if (period === "all") {
    daysAgo = new Date("2020-01-01"); // Far back date for "all time"
  } else {
    daysAgo = new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000);
  }

  // Get form opens (order sessions)
  const formOpens = await db.orderSession.count({
    where: {
      shopId: shop.id,
      startedAt: { gte: daysAgo },
    },
  });

  // Get form opens with dates
  const formOpensSessions = await db.orderSession.findMany({
    where: {
      shopId: shop.id,
      startedAt: { gte: daysAgo },
    },
    select: {
      startedAt: true,
    },
  });

  // Get orders with dates
  const ordersData = await db.order.findMany({
    where: {
      shopId: shop.id,
      createdAt: { gte: daysAgo },
    },
    select: {
      total: true,
      createdAt: true,
    },
  });

  const ordersCount = ordersData.length;
  const totalRevenue = ordersData.reduce((sum, order) => sum + order.total, 0);

  // Calculate conversion rate
  const conversionRate = formOpens > 0 ? ((ordersCount / formOpens) * 100).toFixed(1) : 0;

  // Calculate average order value
  const avgOrderValue = ordersCount > 0 ? totalRevenue / ordersCount : 0;

  // Prepare chart data (aggregate by day)
  const chartData = {};

  // Aggregate form opens
  formOpensSessions.forEach(session => {
    const date = new Date(session.startedAt).toISOString().split('T')[0];
    if (!chartData[date]) chartData[date] = { formOpens: 0, orders: 0, revenue: 0 };
    chartData[date].formOpens += 1;
  });

  // Aggregate orders and revenue
  ordersData.forEach(order => {
    const date = new Date(order.createdAt).toISOString().split('T')[0];
    if (!chartData[date]) chartData[date] = { formOpens: 0, orders: 0, revenue: 0 };
    chartData[date].orders += 1;
    chartData[date].revenue += order.total;
  });

  // Convert to array and sort by date
  const chartDataArray = Object.entries(chartData)
    .map(([date, data]) => ({
      date,
      ...data,
      conversionRate: data.formOpens > 0 ? (data.orders / data.formOpens) * 100 : 0,
      avgOrderValue: data.orders > 0 ? data.revenue / data.orders : 0,
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  return {
    stats: {
      formOpens,
      ordersCount,
      totalRevenue,
      conversionRate,
      avgOrderValue,
    },
    chartData: chartDataArray,
    period,
    currencySymbol: getCurrencySymbol(shop.country),
  };
};

export default function AnalyticsPage() {
  const { stats, chartData, period: initialPeriod, currencySymbol } = useLoaderData();
  const [selectedPeriod, setSelectedPeriod] = useState(initialPeriod);

  const handlePeriodChange = (newPeriod) => {
    setSelectedPeriod(newPeriod);
    window.location.href = `/app/analytics?period=${newPeriod}`;
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatCurrency = (amount) => {
    return `${currencySymbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const renderAreaChart = (data, dataKey, color) => {
    if (data.length === 0) {
      return (
        <div style={{ padding: "40px", textAlign: "center", color: "#9ca3af" }}>
          No data available for this period
        </div>
      );
    }

    const maxValue = Math.max(...data.map(d => d[dataKey]));
    const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - (d[dataKey] / maxValue) * 100;
      return `${x},${y}`;
    }).join(' ');

    return (
      <div style={{ position: "relative", height: "200px", padding: "20px 0" }}>
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ overflow: "visible" }}>
          {/* Grid lines */}
          <line x1="0" y1="25" x2="100" y2="25" stroke="#f3f4f6" strokeWidth="0.2" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="#f3f4f6" strokeWidth="0.2" />
          <line x1="0" y1="75" x2="100" y2="75" stroke="#f3f4f6" strokeWidth="0.2" />

          {/* Area fill */}
          <polygon
            points={`0,100 ${points} 100,100`}
            fill={color}
            fillOpacity="0.1"
          />

          {/* Line */}
          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth="0.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Dots */}
          {data.map((d, i) => {
            const x = (i / (data.length - 1)) * 100;
            const y = 100 - (d[dataKey] / maxValue) * 100;
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="0.8"
                fill={color}
              />
            );
          })}
        </svg>

        {/* X-axis labels */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", fontSize: "11px", color: "#6b7280" }}>
          {data.length > 0 && (
            <>
              <span>{formatDate(data[0].date)}</span>
              {data.length > 1 && <span>{formatDate(data[data.length - 1].date)}</span>}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <s-page heading="Analytics">
      {/* Header with period selector */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <s-text tone="subdued">
          The dates on this chart use the UTC timezone, not your Shopify timezone. Use this data to understand the performance of your form over time.
        </s-text>

        <select
          value={selectedPeriod}
          onChange={(e) => handlePeriodChange(e.target.value)}
          style={{
            padding: "8px 12px",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            fontSize: "14px",
            cursor: "pointer",
            backgroundColor: "white",
          }}
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="all">All time</option>
        </select>
      </div>

      {/* Main metrics grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: "20px", marginBottom: "20px" }}>
        {/* Form Opens */}
        <s-card>
          <div style={{ padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <s-text variant="heading-sm">Form opens</s-text>
              <span style={{ fontSize: "14px", color: "#9ca3af", cursor: "help" }} title="Number of times the form was opened by customers">
                ⓘ
              </span>
            </div>
            <s-text variant="heading-2xl" style={{ display: "block", marginBottom: "16px" }}>
              {stats.formOpens}
            </s-text>
            {renderAreaChart(chartData, 'formOpens', '#3b82f6')}
          </div>
        </s-card>

        {/* Orders */}
        <s-card>
          <div style={{ padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <s-text variant="heading-sm">Orders</s-text>
              <span style={{ fontSize: "14px", color: "#9ca3af", cursor: "help" }} title="Total number of completed orders">
                ⓘ
              </span>
            </div>
            <s-text variant="heading-2xl" style={{ display: "block", marginBottom: "16px" }}>
              {stats.ordersCount}
            </s-text>
            {renderAreaChart(chartData, 'orders', '#3b82f6')}
          </div>
        </s-card>
      </div>

      {/* Revenue Chart (full width) */}
      <div style={{ marginBottom: "20px" }}>
        <s-card>
          <div style={{ padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <s-text variant="heading-sm">Revenue</s-text>
              <span style={{ fontSize: "14px", color: "#9ca3af", cursor: "help" }} title="Total revenue from completed orders">
                ⓘ
              </span>
            </div>
            <s-text variant="heading-2xl" style={{ display: "block", marginBottom: "16px" }}>
              {formatCurrency(stats.totalRevenue)}
            </s-text>
            {renderAreaChart(chartData, 'revenue', '#3b82f6')}
          </div>
        </s-card>
      </div>

      {/* Conversion Rate and AOV */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: "20px", marginBottom: "20px" }}>
        {/* Conversion Rate */}
        <s-card>
          <div style={{ padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <s-text variant="heading-sm">Form conversion rate</s-text>
              <span style={{ fontSize: "14px", color: "#9ca3af", cursor: "help" }} title="Percentage of form opens that resulted in orders">
                ⓘ
              </span>
            </div>
            <s-text variant="heading-2xl" style={{ display: "block", marginBottom: "16px" }}>
              {stats.conversionRate}%
            </s-text>
            {renderAreaChart(chartData, 'conversionRate', '#f97316')}
          </div>
        </s-card>

        {/* Average Order Value */}
        <s-card>
          <div style={{ padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <s-text variant="heading-sm">Average order value</s-text>
              <span style={{ fontSize: "14px", color: "#9ca3af", cursor: "help" }} title="Average value per order">
                ⓘ
              </span>
            </div>
            <s-text variant="heading-2xl" style={{ display: "block", marginBottom: "16px" }}>
              {formatCurrency(stats.avgOrderValue)}
            </s-text>
            {renderAreaChart(chartData, 'avgOrderValue', '#3b82f6')}
          </div>
        </s-card>
      </div>

    </s-page>
  );
}
