import { useState, useRef, useEffect, useCallback } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getOrCreateShop, getCombos, deleteBundle, updateBundleStatus, duplicateBundle, getShopByDomain } from "../lib/db.server";
import { syncStorefrontConfigByDomain } from "../lib/storefront-config.server";
import { ensureBundleDiscount } from "../lib/bundle-function.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);
  const combos = await getCombos(shop.id);

  return { shopId: shop.id, combos };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  await getOrCreateShop(session.shop, session.accessToken);

  const formData = await request.formData();
  const actionType = formData.get("action");
  const comboId = formData.get("comboId");

  // Refresh BOTH the storefront config and the native-checkout Discount Function
  // config. Without the second one, an offer toggled off or deleted here stays
  // in the function's metafield and keeps discounting at Shopify's checkout.
  const sync = async () => {
    await syncStorefrontConfigByDomain(admin, session.shop);
    const shopWithOffers = await getShopByDomain(session.shop);
    if (shopWithOffers) await ensureBundleDiscount(admin, shopWithOffers);
  };

  if (actionType === "delete" && comboId) {
    await deleteBundle(comboId);
    await sync();
    return Response.json({ success: true });
  }

  if (actionType === "toggle" && comboId) {
    await updateBundleStatus(comboId, formData.get("newStatus"));
    await sync();
    return Response.json({ success: true });
  }

  if (actionType === "duplicate" && comboId) {
    await duplicateBundle(comboId);
    await sync();
    return Response.json({ success: true });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
};

const STATUS_STYLES = {
  published: { bg: "#dcfce7", color: "#166534", label: "Published" },
  draft: { bg: "#fef3c7", color: "#92400e", label: "Draft" },
  inactive: { bg: "#fee2e2", color: "#991b1b", label: "Inactive" },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.draft;
  return (
    <span style={{
      padding: "2px 8px",
      borderRadius: "12px",
      fontSize: "12px",
      fontWeight: "500",
      backgroundColor: s.bg,
      color: s.color,
    }}>
      {s.label}
    </span>
  );
}

const TABS = [
  { id: "all", label: "All" },
  { id: "published", label: "Published" },
  { id: "draft", label: "Draft" },
  { id: "inactive", label: "Inactive" },
];

const ICON_BUTTON = {
  padding: "6px 8px",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  backgroundColor: "#ffffff",
  cursor: "pointer",
  fontSize: "14px",
};

export default function CombosList() {
  const { combos } = useLoaderData();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const primaryAddBtnRef = useRef(null);
  const backButtonRef = useRef(null);

  const handleAddCombo = useCallback(() => {
    navigate("/app/sales-booster/combo/new");
  }, [navigate]);

  const handleBack = useCallback(() => {
    navigate("/app/sales-booster");
  }, [navigate]);

  useEffect(() => {
    const primaryBtn = primaryAddBtnRef.current;
    const backBtn = backButtonRef.current;

    if (primaryBtn) primaryBtn.addEventListener("click", handleAddCombo);
    if (backBtn) backBtn.addEventListener("click", handleBack);

    return () => {
      if (primaryBtn) primaryBtn.removeEventListener("click", handleAddCombo);
      if (backBtn) backBtn.removeEventListener("click", handleBack);
    };
  }, [handleAddCombo, handleBack]);

  const filteredCombos = combos.filter((c) => {
    const matchesSearch = searchQuery === "" || c.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = activeTab === "all" || c.status === activeTab;
    return matchesSearch && matchesTab;
  });

  const submit = (action, comboId, extra = {}) => {
    fetcher.submit({ action, comboId, ...extra }, { method: "POST" });
  };

  const handleDuplicate = (id) => {
    submit("duplicate", id);
    shopify.toast.show("Combo duplicated successfully");
  };

  const handleDelete = (id, name) => {
    if (window.confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
      submit("delete", id);
      shopify.toast.show("Combo deleted successfully");
    }
  };

  const handleToggleStatus = (id, currentStatus) => {
    submit("toggle", id, { newStatus: currentStatus === "published" ? "inactive" : "published" });
  };

  return (
    <s-page heading="Combo Offers">
      <s-button ref={backButtonRef} slot="secondary-action" variant="tertiary">
        ← Back
      </s-button>
      <s-button ref={primaryAddBtnRef} slot="primary-action" variant="primary">
        + Create new combo
      </s-button>

      <s-section>
        <s-stack direction="block" gap="base">
          <div className="pv-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: "8px 16px",
                  border: "none",
                  borderBottom: activeTab === tab.id ? "2px solid #000" : "2px solid transparent",
                  backgroundColor: "transparent",
                  fontWeight: activeTab === tab.id ? "600" : "400",
                  cursor: "pointer",
                  fontSize: "14px",
                  color: activeTab === tab.id ? "#000" : "#6b7280",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="pv-search-row">
            <input
              type="text"
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: "6px",
                border: "1px solid #d1d5db",
                fontSize: "14px",
              }}
            />
          </div>

          <s-box borderWidth="base" borderRadius="base" style={{ overflow: "hidden" }}>
            <div className="pv-table__head" style={{ "--pv-table-cols": "1fr 200px 150px 120px 150px" }}>
              <div>Offer Name</div>
              <div>Products</div>
              <div>Last Edited</div>
              <div>Status</div>
              <div>Actions</div>
            </div>

            {filteredCombos.length === 0 ? (
              <div style={{ padding: "60px 40px", textAlign: "center", color: "#6b7280" }}>
                <div style={{ fontSize: "48px", marginBottom: "16px" }}>🎁</div>
                <s-text variant="heading-md">Create your first combo</s-text>
                <div style={{ marginTop: "8px" }}>
                  <s-text tone="subdued">
                    Sell 2–3 products together at a discounted rate.
                  </s-text>
                </div>
              </div>
            ) : (
              filteredCombos.map((combo) => {
                const conversionRate = combo.impressions > 0
                  ? ((combo.accepts / combo.impressions) * 100).toFixed(1)
                  : "0.0";
                const items = Array.isArray(combo.comboItems) ? combo.comboItems : [];

                return (
                  <div key={combo.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <div className="pv-table__row" style={{ "--pv-table-cols": "1fr 200px 150px 120px 150px" }}>
                      <div className="pv-table__cell pv-table__cell--name" style={{ fontWeight: "500" }}>
                        {combo.name}
                      </div>

                      <div className="pv-table__cell" data-label="Products" style={{ fontSize: "13px", color: "#6b7280" }}>
                        {items.length === 0
                          ? "—"
                          : items.map((i) => `${i.quantity > 1 ? `${i.quantity}× ` : ""}${i.title}`).join(" + ")}
                      </div>

                      <div className="pv-table__cell" data-label="Last Edited" style={{ fontSize: "13px", color: "#6b7280" }}>
                        {new Date(combo.updatedAt).toLocaleDateString()}
                      </div>

                      <div
                        className="pv-table__cell"
                        data-label="Status"
                        style={{ display: "flex", alignItems: "center", gap: "8px" }}
                      >
                        <StatusBadge status={combo.status} />
                        {combo.status !== "draft" && (
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(combo.id, combo.status)}
                            className="pv-toggle"
                            aria-label={combo.status === "published" ? "Deactivate combo" : "Activate combo"}
                            style={{
                              width: "36px",
                              height: "20px",
                              borderRadius: "10px",
                              border: "none",
                              backgroundColor: combo.status === "published" ? "#10b981" : "#d1d5db",
                              cursor: "pointer",
                              position: "relative",
                              transition: "background-color 0.2s",
                            }}
                          >
                            <span style={{
                              position: "absolute",
                              top: "2px",
                              left: combo.status === "published" ? "18px" : "2px",
                              width: "16px",
                              height: "16px",
                              borderRadius: "50%",
                              backgroundColor: "#ffffff",
                              transition: "left 0.2s",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                            }} />
                          </button>
                        )}
                      </div>

                      <div className="pv-table__cell pv-table__cell--actions" style={{ display: "flex", gap: "6px" }}>
                        <button type="button" onClick={() => navigate(`/app/sales-booster/combo/${combo.id}`)} title="Edit" style={ICON_BUTTON}>
                          ✏️
                        </button>
                        <button type="button" onClick={() => handleDuplicate(combo.id)} title="Duplicate" style={ICON_BUTTON}>
                          📋
                        </button>
                        <button type="button" onClick={() => handleDelete(combo.id, combo.name)} title="Delete" style={ICON_BUTTON}>
                          🗑️
                        </button>
                      </div>
                    </div>

                    <div className="pv-table__stats">
                      <span>📊 <strong>STATS:</strong></span>
                      {combo.impressions === 0 && combo.accepts === 0 ? (
                        <span>No data available yet.</span>
                      ) : (
                        <>
                          <span><strong style={{ color: "#374151" }}>{combo.impressions}</strong> Views</span>
                          <span><strong style={{ color: "#374151" }}>{combo.accepts}</strong> Accepts</span>
                          <span><strong style={{ color: "#374151" }}>{conversionRate}%</strong> Conversion</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </s-box>

          {filteredCombos.length > 0 && (
            <div style={{ textAlign: "center", fontSize: "13px", color: "#6b7280" }}>
              Showing {filteredCombos.length} of {combos.length} combos
            </div>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
