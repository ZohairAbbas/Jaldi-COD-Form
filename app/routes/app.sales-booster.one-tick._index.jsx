import { useState, useRef, useEffect, useCallback } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getOrCreateShop, getUpsells, deleteUpsell, toggleUpsellEnabled } from "../lib/db.server";
import { syncStorefrontConfigByDomain } from "../lib/storefront-config.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  // Get all one-tick upsells for this shop
  const upsells = await getUpsells(shop.id, "one-tick");

  return {
    shopId: shop.id,
    upsells,
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  await getOrCreateShop(session.shop, session.accessToken);

  const formData = await request.formData();
  const actionType = formData.get("action");
  const upsellId = formData.get("upsellId");

  // Refresh the inlined storefront config metafield after a mutation (non-blocking).
  const sync = () => syncStorefrontConfigByDomain(admin, session.shop);

  if (actionType === "delete" && upsellId) {
    await deleteUpsell(upsellId);
    await sync();
    return Response.json({ success: true });
  }

  if (actionType === "toggle" && upsellId) {
    await toggleUpsellEnabled(upsellId);
    await sync();
    return Response.json({ success: true });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
};

export default function OneTickUpsells() {
  const { upsells } = useLoaderData();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const [searchQuery, setSearchQuery] = useState("");

  // Refs for s-button elements
  const addBtnRef = useRef(null);
  const backButtonRef = useRef(null);

  const handleAddUpsell = useCallback(() => {
    navigate("/app/sales-booster/one-tick/new");
  }, [navigate]);

  const handleBack = useCallback(() => {
    navigate("/app/sales-booster");
  }, [navigate]);

  // Attach event listeners to s-button elements
  useEffect(() => {
    const addBtn = addBtnRef.current;
    const backBtn = backButtonRef.current;

    if (addBtn) {
      addBtn.addEventListener("click", handleAddUpsell);
    }
    if (backBtn) {
      backBtn.addEventListener("click", handleBack);
    }

    return () => {
      if (addBtn) {
        addBtn.removeEventListener("click", handleAddUpsell);
      }
      if (backBtn) {
        backBtn.removeEventListener("click", handleBack);
      }
    };
  }, [handleAddUpsell, handleBack]);

  // Filter upsells by search
  const filteredUpsells = upsells.filter((u) =>
    searchQuery === "" ||
    u.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleEditUpsell = (id) => {
    navigate(`/app/sales-booster/one-tick/${id}`);
  };

  const handleDuplicateUpsell = (id) => {
    navigate(`/app/sales-booster/one-tick/new?duplicate=${id}`);
  };

  const handleDeleteUpsell = async (id, name) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${name}"? This action cannot be undone.`
    );

    if (confirmed) {
      fetcher.submit(
        { action: "delete", upsellId: id },
        { method: "POST" }
      );
      shopify.toast.show("Upsell deleted successfully");
    }
  };

  const handleToggleEnabled = async (id) => {
    fetcher.submit(
      { action: "toggle", upsellId: id },
      { method: "POST" }
    );
  };

  return (
    <s-page heading="One-Tick Upsells">
      <s-button
        ref={backButtonRef}
        slot="secondary-action"
        variant="tertiary"
      >
        ← Back
      </s-button>

      <s-button
        ref={addBtnRef}
        slot="primary-action"
        variant="primary"
      >
        + Add a one-tick upsell
      </s-button>

      {/* Search and Upsells List */}
      <s-section>
        <s-stack direction="block" gap="base">
          {/* Search */}
          <div style={{ display: "flex", gap: "8px" }}>
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
            <s-button>
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                🔍 Search
              </span>
            </s-button>
          </div>

          {/* Upsells Table */}
          <s-box borderWidth="base" borderRadius="base" style={{ overflow: "hidden" }}>
            {/* Table Header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "80px 100px 1fr 150px",
              gap: "16px",
              padding: "12px 16px",
              backgroundColor: "#f9fafb",
              borderBottom: "1px solid #e5e7eb",
              fontWeight: "600",
              fontSize: "14px",
              color: "#374151",
            }}>
              <div>Priority</div>
              <div>Enabled</div>
              <div>Name</div>
              <div>Actions</div>
            </div>

            {/* Table Body */}
            {filteredUpsells.length === 0 ? (
              <div style={{
                padding: "40px",
                textAlign: "center",
                color: "#6b7280",
              }}>
                <s-text tone="subdued">
                  No one-tick upsells found. Click "Add a one-tick upsell" to create one.
                </s-text>
              </div>
            ) : (
              filteredUpsells.map((upsell) => {
                const conversionRate = upsell.impressions > 0
                  ? ((upsell.accepts / upsell.impressions) * 100).toFixed(1)
                  : "0.0";

                return (
                  <div
                    key={upsell.id}
                    style={{
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    {/* Main Row */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "80px 100px 1fr 150px",
                        gap: "16px",
                        padding: "16px",
                        alignItems: "center",
                      }}
                    >
                      {/* Priority */}
                      <div style={{ fontWeight: "500" }}>{upsell.priority}</div>

                      {/* Enabled Toggle */}
                      <div>
                        <button
                          type="button"
                          onClick={() => handleToggleEnabled(upsell.id)}
                          style={{
                            width: "44px",
                            height: "24px",
                            borderRadius: "12px",
                            border: "none",
                            backgroundColor: upsell.enabled ? "#10b981" : "#d1d5db",
                            cursor: "pointer",
                            position: "relative",
                            transition: "background-color 0.2s",
                          }}
                        >
                          <span
                            style={{
                              position: "absolute",
                              top: "2px",
                              left: upsell.enabled ? "22px" : "2px",
                              width: "20px",
                              height: "20px",
                              borderRadius: "50%",
                              backgroundColor: "#ffffff",
                              transition: "left 0.2s",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                            }}
                          />
                        </button>
                      </div>

                      {/* Name */}
                      <div style={{ fontWeight: "500" }}>{upsell.name}</div>

                      {/* Actions */}
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={() => handleEditUpsell(upsell.id)}
                          title="Edit"
                          style={{
                            padding: "8px",
                            border: "1px solid #d1d5db",
                            borderRadius: "6px",
                            backgroundColor: "#ffffff",
                            cursor: "pointer",
                          }}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicateUpsell(upsell.id)}
                          title="Duplicate"
                          style={{
                            padding: "8px",
                            border: "1px solid #d1d5db",
                            borderRadius: "6px",
                            backgroundColor: "#ffffff",
                            cursor: "pointer",
                          }}
                        >
                          📋
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteUpsell(upsell.id, upsell.name)}
                          title="Delete"
                          style={{
                            padding: "8px",
                            border: "1px solid #d1d5db",
                            borderRadius: "6px",
                            backgroundColor: "#ffffff",
                            cursor: "pointer",
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>

                    {/* Stats Row */}
                    <div
                      style={{
                        display: "flex",
                        gap: "24px",
                        padding: "8px 16px 16px 16px",
                        backgroundColor: "#f9fafb",
                        fontSize: "13px",
                        color: "#6b7280",
                      }}
                    >
                      <span>📊 <strong>LAST 30 DAYS:</strong></span>
                      {upsell.impressions === 0 && upsell.accepts === 0 && upsell.declines === 0 ? (
                        <span>No data available yet. Check again after the first impression or order with this upsell.</span>
                      ) : (
                        <>
                          <span>
                            <strong style={{ color: "#374151" }}>{upsell.impressions}</strong> Views
                          </span>
                          <span>
                            <strong style={{ color: "#374151" }}>{upsell.accepts}</strong> Accepts
                          </span>
                          <span>
                            <strong style={{ color: "#374151" }}>{upsell.declines}</strong> Declines
                          </span>
                          <span>
                            <strong style={{ color: "#374151" }}>{conversionRate}%</strong> Conversion
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </s-box>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
