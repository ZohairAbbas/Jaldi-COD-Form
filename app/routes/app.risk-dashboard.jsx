import { useState, useEffect } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { getOrCreateShop } from "../lib/db.server";
import { getRiskMetrics, getRiskOrders, getBuyerProfile } from "../lib/risk-dashboard.server";



export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const riskLevel = url.searchParams.get("riskLevel") || "ALL";
  const deliveryOutcome = url.searchParams.get("deliveryOutcome") || "ALL";
  const search = url.searchParams.get("search") || "";
  const buyerPhone = url.searchParams.get("buyer") || null;

  const [metrics, ordersData] = await Promise.all([
    getRiskMetrics(shop.id),
    getRiskOrders(shop.id, { page, riskLevel, deliveryOutcome, search }),
  ]);

  let buyerProfile = null;
  if (buyerPhone) {
    buyerProfile = await getBuyerProfile(shop.id, buyerPhone);
  }

  return {
    metrics,
    ordersData,
    buyerProfile,
    filters: { riskLevel, deliveryOutcome, search, page },
    shopDomain: shop.shopifyDomain,
  };
};

const RISK_TONES = { HIGH: "critical", MEDIUM: "warning", LOW: "success" };
const OUTCOME_TONES = {
  delivered: "success",
  returned: "critical",
  attempted_delivery: "warning",
  delayed: "warning",
  out_for_delivery: "info",
  in_transit: "info",
  booked: "info",
  cancelled: "critical",
};
const OUTCOME_LABELS = {
  delivered: "Delivered",
  returned: "Returned",
  attempted_delivery: "Attempted",
  delayed: "Delayed",
  out_for_delivery: "Out for Delivery",
  in_transit: "In Transit",
  booked: "Booked",
  cancelled: "Cancelled",
};

function RiskBadge({ level }) {
  const tone = RISK_TONES[level];
  return <s-badge {...(tone ? { tone } : {})}>{level || "—"}</s-badge>;
}

function OutcomeBadge({ outcome }) {
  if (!outcome) return <s-badge tone="info">Pending</s-badge>;
  const tone = OUTCOME_TONES[outcome];
  const label = OUTCOME_LABELS[outcome] || outcome;
  return <s-badge {...(tone ? { tone } : {})}>{label}</s-badge>;
}

function MetricCard({ title, value, subtitle, color }) {
  return (
    <div style={{
      flex: "1 1 0",
      minWidth: "140px",
      padding: "16px",
    }}>
      <div style={{ fontSize: "12px", color: "#6b7177", marginBottom: "4px" }}>{title}</div>
      <div style={{ fontSize: "24px", fontWeight: "700", color: color || "#303030" }}>{value}</div>
      {subtitle && <div style={{ fontSize: "11px", color: "#8c9196", marginTop: "2px" }}>{subtitle}</div>}
    </div>
  );
}

function BuyerProfilePanel({ profile, onClose }) {
  if (!profile) return null;

  return (
    <div style={{
      position: "fixed",
      top: 0,
      right: 0,
      width: "420px",
      height: "100vh",
      backgroundColor: "#fff",
      borderLeft: "1px solid #e3e3e3",
      boxShadow: "-4px 0 12px rgba(0,0,0,0.08)",
      zIndex: 1000,
      overflowY: "auto",
      padding: "24px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h3 style={{ fontSize: "16px", fontWeight: "600", margin: 0 }}>Buyer Profile</h3>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "20px",
            color: "#6b7177",
            padding: "4px",
          }}
        >
          &times;
        </button>
      </div>

      {/* Buyer info */}
      <div style={{ marginBottom: "20px" }}>
        <div style={{ fontSize: "14px", fontWeight: "600" }}>
          {[profile.firstName, profile.lastName].filter(Boolean).join(" ") || "Unknown"}
        </div>
        <div style={{ fontSize: "13px", color: "#6b7177", marginTop: "4px" }}>{profile.phone}</div>
        {profile.email && <div style={{ fontSize: "13px", color: "#6b7177" }}>{profile.email}</div>}
      </div>

      {/* Network risk */}
      <div style={{
        padding: "12px",
        backgroundColor: "#f6f6f7",
        borderRadius: "8px",
        marginBottom: "16px",
      }}>
        <div style={{ fontSize: "12px", color: "#6b7177", marginBottom: "8px" }}>Network Risk (Cross-Merchant)</div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <RiskBadge level={profile.riskScoreGlobal} />
          <span style={{ fontSize: "12px", color: "#6b7177" }}>
            {profile.rtoRateGlobal != null ? `${(profile.rtoRateGlobal * 100).toFixed(1)}% RTO rate` : "No data"}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "12px" }}>
          <div><span style={{ color: "#6b7177" }}>Total orders:</span> {profile.totalOrdersGlobal}</div>
          <div><span style={{ color: "#6b7177" }}>Delivered:</span> {profile.deliveredOrdersGlobal}</div>
          <div><span style={{ color: "#6b7177" }}>Returned:</span> {profile.rtoOrdersGlobal}</div>
          <div><span style={{ color: "#6b7177" }}>Cancelled:</span> {profile.cancelledOrdersGlobal}</div>
        </div>
      </div>

      {/* Shop-level stats */}
      <div style={{
        padding: "12px",
        backgroundColor: "#f6f6f7",
        borderRadius: "8px",
        marginBottom: "16px",
      }}>
        <div style={{ fontSize: "12px", color: "#6b7177", marginBottom: "8px" }}>Your Store Stats</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "12px" }}>
          <div><span style={{ color: "#6b7177" }}>Orders:</span> {profile.shopStats.totalOrders}</div>
          <div><span style={{ color: "#6b7177" }}>Delivered:</span> {profile.shopStats.deliveredOrders}</div>
          <div><span style={{ color: "#6b7177" }}>Returned:</span> {profile.shopStats.returnedOrders}</div>
          <div><span style={{ color: "#6b7177" }}>RTO Rate:</span> {profile.shopStats.rtoRate}%</div>
        </div>
      </div>

      {/* Order history for this shop */}
      <div>
        <div style={{ fontSize: "13px", fontWeight: "600", marginBottom: "8px" }}>Order History (Your Store)</div>
        {profile.shopOrders.length === 0 ? (
          <div style={{ fontSize: "12px", color: "#8c9196" }}>No orders found</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {profile.shopOrders.map(order => (
              <div key={order.id} style={{
                padding: "8px 10px",
                backgroundColor: "#f6f6f7",
                borderRadius: "6px",
                fontSize: "12px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}>
                <div>
                  <span style={{ fontWeight: "500" }}>{order.shopifyOrderNumber || "—"}</span>
                  <span style={{ color: "#8c9196", marginLeft: "8px" }}>
                    {new Date(order.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <RiskBadge level={order.riskLevel} />
                  <OutcomeBadge outcome={order.deliveryOutcome} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Timestamps */}
      <div style={{ marginTop: "16px", fontSize: "11px", color: "#8c9196" }}>
        First seen: {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : "—"}
        {" · "}
        Last active: {profile.lastVerifiedAt ? new Date(profile.lastVerifiedAt).toLocaleDateString() : "—"}
      </div>
    </div>
  );
}

export default function RiskDashboard() {
  const { metrics, ordersData, buyerProfile: loaderBuyerProfile, filters, shopDomain } = useLoaderData();
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState(filters.search);
  const [buyerProfile, setBuyerProfile] = useState(loaderBuyerProfile);

  // Fix: Sync buyer profile state when loader re-runs (e.g. phone click → navigate)
  useEffect(() => {
    setBuyerProfile(loaderBuyerProfile);
  }, [loaderBuyerProfile]);


  const buildUrl = (overrides) => {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    return `/app/risk-dashboard?${params.toString()}`;
  };

  const updateFilter = (key, value) => {
    const overrides = { [key]: value };
    if (key !== "page") overrides.page = "1";
    navigate(buildUrl(overrides));
  };

  const handleSearch = (e) => {
    e.preventDefault();
    updateFilter("search", searchInput);
  };

  const openBuyerProfile = (phone) => {
    navigate(buildUrl({ buyer: phone }));
  };

  const closeBuyerProfile = () => {
    navigate(buildUrl({ buyer: null }));
    setBuyerProfile(null);
  };

  const openShopifyOrder = (shopifyOrderId) => {
    if (!shopifyOrderId) return;
    const numericId = shopifyOrderId.includes("/") ? shopifyOrderId.split("/").pop() : shopifyOrderId;
    window.open(`https://${shopDomain}/admin/orders/${numericId}`, "_blank");
  };

  return (
    <s-page heading="COD Intelligence">
      <s-text variant="body-md" tone="subdued">Risk scoring and delivery insights for your COD orders</s-text>

      {/* Metrics Cards */}
      <s-section>
        <s-card>
          <div style={{ display: "flex", flexWrap: "wrap" }}>
            <MetricCard title="Orders (30d)" value={metrics.totalOrders} />
            <MetricCard title="High Risk" value={metrics.highRiskCount} color="#d72c0d" subtitle="Last 30 days" />
            <MetricCard title="Medium Risk" value={metrics.mediumRiskCount} color="#d97706" subtitle="Last 30 days" />
            <MetricCard title="RTO Rate" value={`${metrics.rtoRate}%`} color={metrics.rtoRate > 20 ? "#d72c0d" : "#2a9d5c"} subtitle="All time" />
            <MetricCard title="Delivered" value={metrics.deliveredCount} color="#2a9d5c" />
            <MetricCard title="Returned" value={metrics.returnedCount} color="#d72c0d" />
          </div>
        </s-card>
      </s-section>

      {/* Filters */}
      <s-section>
        <s-card>
          <div style={{ padding: "12px 16px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <form onSubmit={handleSearch} style={{ display: "flex", gap: "8px", flex: "1 1 200px" }}>
              <input
                type="text"
                placeholder="Search by phone, name, email, or order #"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #e3e3e3",
                  fontSize: "13px",
                  outline: "none",
                  color: "#303030",
                }}
              />
              <button
                type="submit"
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "1px solid #e3e3e3",
                  backgroundColor: "#fff",
                  fontSize: "13px",
                  cursor: "pointer",
                  color: "#303030",
                }}
              >
                Search
              </button>
            </form>

            <select
              value={filters.riskLevel}
              onChange={e => updateFilter("riskLevel", e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid #e3e3e3",
                fontSize: "13px",
                backgroundColor: "#fff",
                color: "#303030",
              }}
            >
              <option value="ALL">All Risk Levels</option>
              <option value="HIGH">High Risk</option>
              <option value="MEDIUM">Medium Risk</option>
              <option value="LOW">Low Risk</option>
              <option value="UNKNOWN">Unknown</option>
            </select>

            <select
              value={filters.deliveryOutcome}
              onChange={e => updateFilter("deliveryOutcome", e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid #e3e3e3",
                fontSize: "13px",
                backgroundColor: "#fff",
                color: "#303030",
              }}
            >
              <option value="ALL">All Outcomes</option>
              <option value="delivered">Delivered</option>
              <option value="returned">Returned (RTO)</option>
              <option value="attempted_delivery">Attempted Delivery</option>
              <option value="out_for_delivery">Out for Delivery</option>
              <option value="in_transit">In Transit</option>
              <option value="delayed">Delayed</option>
              <option value="booked">Booked</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </s-card>
      </s-section>

      {/* Orders Table */}
      <s-section>
        <s-card>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ backgroundColor: "#f6f6f7", borderBottom: "1px solid #e3e3e3" }}>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: "500", color: "#6b7177" }}>Order</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: "500", color: "#6b7177" }}>Customer</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: "500", color: "#6b7177" }}>Phone</th>
              <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: "500", color: "#6b7177" }}>Total</th>
              <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: "500", color: "#6b7177" }}>Risk</th>
              <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: "500", color: "#6b7177" }}>Delivery</th>
              <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: "500", color: "#6b7177" }}>Date</th>
            </tr>
          </thead>
          <tbody>
            {ordersData.orders.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "#8c9196" }}>
                  No orders match your filters
                </td>
              </tr>
            ) : (
              ordersData.orders.map(order => (
                <tr
                  key={order.id}
                  onClick={() => openBuyerProfile(order.phone)}
                  style={{
                    borderBottom: "1px solid #f1f1f1",
                    cursor: "pointer",
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = "#f6f6f7"}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
                >
                  <td style={{ padding: "10px 14px" }}>
                    <span
                      onClick={(e) => { e.stopPropagation(); openShopifyOrder(order.shopifyOrderId); }}
                      onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
                      onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}
                      style={{ color: "#2c6ecb", cursor: "pointer", fontWeight: "500" }}
                    >
                      {order.shopifyOrderNumber || "—"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    {[order.firstName, order.lastName].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    {order.phone}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>
                    {order.total?.toFixed(2) || "—"}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "center" }}>
                    <RiskBadge level={order.riskLevel} />
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "center" }}>
                    <OutcomeBadge outcome={order.deliveryOutcome} />
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right", color: "#6b7177" }}>
                    {new Date(order.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {ordersData.totalPages > 1 && (
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 14px",
            borderTop: "1px solid #e3e3e3",
            fontSize: "12px",
            color: "#6b7177",
          }}>
            <span>
              Showing {((ordersData.page - 1) * ordersData.perPage) + 1}–{Math.min(ordersData.page * ordersData.perPage, ordersData.total)} of {ordersData.total}
            </span>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={() => updateFilter("page", String(ordersData.page - 1))}
                disabled={ordersData.page <= 1}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "1px solid #e3e3e3",
                  backgroundColor: "#fff",
                  cursor: ordersData.page <= 1 ? "default" : "pointer",
                  opacity: ordersData.page <= 1 ? 0.5 : 1,
                  fontSize: "12px",
                }}
              >
                Previous
              </button>
              <button
                onClick={() => updateFilter("page", String(ordersData.page + 1))}
                disabled={ordersData.page >= ordersData.totalPages}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "1px solid #e3e3e3",
                  backgroundColor: "#fff",
                  cursor: ordersData.page >= ordersData.totalPages ? "default" : "pointer",
                  opacity: ordersData.page >= ordersData.totalPages ? 0.5 : 1,
                  fontSize: "12px",
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
        </s-card>
      </s-section>

      {/* Buyer Profile Side Panel */}
      {buyerProfile && (
        <>
          <div
            onClick={closeBuyerProfile}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              height: "100vh",
              backgroundColor: "rgba(0,0,0,0.2)",
              zIndex: 999,
            }}
          />
          <BuyerProfilePanel profile={buyerProfile} onClose={closeBuyerProfile} />
        </>
      )}
    </s-page>
  );
}
