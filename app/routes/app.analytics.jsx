import { useState } from "react";
import { useLoaderData, useNavigate } from "react-router";
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
  const navigate = useNavigate();

  const handlePeriodChange = (newPeriod) => {
    setSelectedPeriod(newPeriod);
    navigate(`/app/analytics?period=${newPeriod}`);
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatCurrency = (amount) => {
    return `${currencySymbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatYAxisValue = (value, isCurrency = false, isPercent = false) => {
    if (isPercent) {
      return `${value.toFixed(0)}%`;
    }
    if (isCurrency) {
      if (value >= 1000000) return `${currencySymbol}${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `${currencySymbol}${(value / 1000).toFixed(1)}K`;
      return `${currencySymbol}${value.toFixed(0)}`;
    }
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toFixed(0);
  };

  const renderAreaChart = (data, dataKey, color, isCurrency = false, isPercent = false) => {
    if (data.length === 0) {
      return (
        <div style={{
          padding: "60px 20px",
          textAlign: "center",
          color: "#6b7280",
          backgroundColor: "#f9fafb",
          borderRadius: "8px",
          border: "1px dashed #e5e7eb"
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" style={{ marginBottom: "12px" }}>
            <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M7 16l4-4 4 4 5-6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div style={{ fontSize: "14px", fontWeight: "500" }}>No data available</div>
          <div style={{ fontSize: "12px", marginTop: "4px" }}>Data will appear once you have activity</div>
        </div>
      );
    }

    const values = data.map(d => d[dataKey]);
    const maxValue = Math.max(...values) || 1;
    const minValue = Math.min(...values);

    // Calculate nice Y-axis values
    const range = maxValue - Math.min(0, minValue);
    const step = range / 4;
    const yAxisValues = [0, 1, 2, 3, 4].map(i => Math.round(step * i));

    // Chart dimensions
    const chartHeight = 180;
    const chartWidth = 100;
    const padding = { left: 0, right: 0, top: 10, bottom: 0 };

    // Generate smooth curve path using bezier curves
    const generateSmoothPath = () => {
      if (data.length === 1) {
        const x = 50;
        const y = padding.top + (chartHeight - padding.top - padding.bottom) * (1 - values[0] / maxValue);
        return `M ${x} ${y} L ${x} ${y}`;
      }

      let path = '';
      const points = data.map((d, i) => {
        const x = (i / (data.length - 1)) * chartWidth;
        const y = padding.top + (chartHeight - padding.top - padding.bottom) * (1 - d[dataKey] / maxValue);
        return { x, y };
      });

      path = `M ${points[0].x} ${points[0].y}`;

      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i];
        const p1 = points[i + 1];
        const cpx = (p0.x + p1.x) / 2;
        path += ` C ${cpx} ${p0.y}, ${cpx} ${p1.y}, ${p1.x} ${p1.y}`;
      }

      return path;
    };

    const linePath = generateSmoothPath();
    const areaPath = `${linePath} L ${chartWidth} ${chartHeight} L 0 ${chartHeight} Z`;

    // Get X-axis date labels (show 5-7 labels)
    const getXAxisLabels = () => {
      if (data.length <= 7) {
        return data.map((d, i) => ({ date: d.date, position: (i / (data.length - 1)) * 100 }));
      }
      const step = Math.ceil(data.length / 6);
      const labels = [];
      for (let i = 0; i < data.length; i += step) {
        labels.push({ date: data[i].date, position: (i / (data.length - 1)) * 100 });
      }
      // Always include last date
      if (labels[labels.length - 1].date !== data[data.length - 1].date) {
        labels.push({ date: data[data.length - 1].date, position: 100 });
      }
      return labels;
    };

    const xLabels = getXAxisLabels();

    return (
      <div style={{ display: "flex", gap: "8px" }}>
        {/* Y-axis labels */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          paddingTop: "10px",
          paddingBottom: "24px",
          minWidth: "45px",
          textAlign: "right"
        }}>
          {[...yAxisValues].reverse().map((val, i) => (
            <span key={i} style={{ fontSize: "11px", color: "#6b7280", lineHeight: "1" }}>
              {formatYAxisValue(val, isCurrency, isPercent)}
            </span>
          ))}
        </div>

        {/* Chart area */}
        <div style={{ flex: 1, position: "relative" }}>
          <svg
            width="100%"
            height={chartHeight}
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="none"
            style={{ overflow: "visible" }}
          >
            {/* Horizontal grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
              <line
                key={i}
                x1="0"
                y1={padding.top + (chartHeight - padding.top - padding.bottom) * ratio}
                x2={chartWidth}
                y2={padding.top + (chartHeight - padding.top - padding.bottom) * ratio}
                stroke="#e5e7eb"
                strokeWidth="0.3"
                strokeDasharray={i === 4 ? "none" : "none"}
              />
            ))}

            {/* Gradient definition */}
            <defs>
              <linearGradient id={`gradient-${dataKey}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                <stop offset="100%" stopColor={color} stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* Area fill */}
            <path
              d={areaPath}
              fill={`url(#gradient-${dataKey})`}
            />

            {/* Line */}
            <path
              d={linePath}
              fill="none"
              stroke={color}
              strokeWidth="0.6"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* X-axis labels */}
          <div style={{
            position: "relative",
            height: "24px",
            marginTop: "4px",
            borderTop: "1px solid #e5e7eb"
          }}>
            {xLabels.map((label, i) => (
              <span
                key={i}
                style={{
                  position: "absolute",
                  left: `${label.position}%`,
                  transform: "translateX(-50%)",
                  fontSize: "10px",
                  color: "#6b7280",
                  whiteSpace: "nowrap",
                  paddingTop: "6px"
                }}
              >
                {formatDate(label.date)}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const MetricCard = ({ title, value, tooltip, children }) => (
    <div style={{
      backgroundColor: "white",
      borderRadius: "12px",
      border: "1px solid #e5e7eb",
      padding: "24px",
      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)"
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <span style={{ fontSize: "14px", fontWeight: "500", color: "#374151" }}>{title}</span>
        <span
          style={{
            fontSize: "12px",
            color: "#9ca3af",
            cursor: "help",
            width: "16px",
            height: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            backgroundColor: "#f3f4f6"
          }}
          title={tooltip}
        >
          ?
        </span>
      </div>
      <div style={{ fontSize: "32px", fontWeight: "600", color: "#111827", marginBottom: "20px" }}>
        {value}
      </div>
      {children}
    </div>
  );

  return (
    <s-page heading="Analytics">
      {/* Header section */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: "32px",
        flexWrap: "wrap",
        gap: "16px"
      }}>
        <div style={{ maxWidth: "600px" }}>
          <p style={{ fontSize: "14px", color: "#6b7280", margin: 0, lineHeight: "1.5" }}>
            Track your COD form performance over time. Dates shown in UTC timezone.
          </p>
        </div>

        <div style={{
          display: "inline-flex",
          backgroundColor: "#f3f4f6",
          borderRadius: "8px",
          padding: "4px",
          gap: "4px"
        }}>
          {[
            { value: "7", label: "7 days" },
            { value: "30", label: "30 days" },
            { value: "90", label: "90 days" },
            { value: "all", label: "All time" }
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => handlePeriodChange(option.value)}
              style={{
                padding: "8px 16px",
                border: "none",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: "500",
                cursor: "pointer",
                transition: "all 0.15s ease",
                backgroundColor: selectedPeriod === option.value ? "white" : "transparent",
                color: selectedPeriod === option.value ? "#111827" : "#6b7280",
                boxShadow: selectedPeriod === option.value ? "0 1px 2px rgba(0, 0, 0, 0.05)" : "none"
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main metrics grid - 2 columns */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: "24px",
        marginBottom: "24px"
      }}>
        <MetricCard
          title="Form Opens"
          value={stats.formOpens.toLocaleString()}
          tooltip="Number of times the COD form was opened by customers"
        >
          {renderAreaChart(chartData, 'formOpens', '#6366f1', false, false)}
        </MetricCard>

        <MetricCard
          title="Orders"
          value={stats.ordersCount.toLocaleString()}
          tooltip="Total number of completed COD orders"
        >
          {renderAreaChart(chartData, 'orders', '#6366f1', false, false)}
        </MetricCard>
      </div>

      {/* Revenue - full width */}
      <div style={{ marginBottom: "24px" }}>
        <MetricCard
          title="Revenue"
          value={formatCurrency(stats.totalRevenue)}
          tooltip="Total revenue from completed COD orders"
        >
          {renderAreaChart(chartData, 'revenue', '#10b981', true, false)}
        </MetricCard>
      </div>

      {/* Conversion Rate and AOV - 2 columns */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: "24px"
      }}>
        <MetricCard
          title="Conversion Rate"
          value={`${stats.conversionRate}%`}
          tooltip="Percentage of form opens that resulted in completed orders"
        >
          {renderAreaChart(chartData, 'conversionRate', '#f59e0b', false, true)}
        </MetricCard>

        <MetricCard
          title="Average Order Value"
          value={formatCurrency(stats.avgOrderValue)}
          tooltip="Average revenue per order"
        >
          {renderAreaChart(chartData, 'avgOrderValue', '#6366f1', true, false)}
        </MetricCard>
      </div>
    </s-page>
  );
}
