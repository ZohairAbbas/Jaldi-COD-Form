import { useState, useRef, useEffect, useCallback } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getOrCreateShop, getUpsells, deleteUpsell, toggleUpsellEnabled } from "../lib/db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  // Get all upsells for this shop
  const upsells = await getUpsells(shop.id);

  return {
    shopId: shop.id,
    upsells,
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  await getOrCreateShop(session.shop, session.accessToken);

  const formData = await request.formData();
  const actionType = formData.get("action");
  const upsellId = formData.get("upsellId");

  if (actionType === "delete" && upsellId) {
    await deleteUpsell(upsellId);
    return Response.json({ success: true });
  }

  if (actionType === "toggle" && upsellId) {
    await toggleUpsellEnabled(upsellId);
    return Response.json({ success: true });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
};

export default function SalesBooster() {
  const { upsells } = useLoaderData();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const [selectedType, setSelectedType] = useState("pre-purchase");
  const [searchQuery, setSearchQuery] = useState("");

  // Refs for s-button elements
  const primaryAddBtnRef = useRef(null);
  const secondaryAddBtnRef = useRef(null);
  const backButtonRef = useRef(null);

  const handleAddUpsell = useCallback(() => {
    navigate(`/app/sales-booster/one-click/new?type=${selectedType}`);
  }, [navigate, selectedType]);

  const handleBack = useCallback(() => {
    navigate("/app/sales-booster");
  }, [navigate]);

  // Attach event listeners to s-button elements
  useEffect(() => {
    const primaryBtn = primaryAddBtnRef.current;
    const secondaryBtn = secondaryAddBtnRef.current;
    const backBtn = backButtonRef.current;

    if (primaryBtn) {
      primaryBtn.addEventListener("click", handleAddUpsell);
    }
    if (secondaryBtn) {
      secondaryBtn.addEventListener("click", handleAddUpsell);
    }
    if (backBtn) {
      backBtn.addEventListener("click", handleBack);
    }

    return () => {
      if (primaryBtn) {
        primaryBtn.removeEventListener("click", handleAddUpsell);
      }
      if (secondaryBtn) {
        secondaryBtn.removeEventListener("click", handleAddUpsell);
      }
      if (backBtn) {
        backBtn.removeEventListener("click", handleBack);
      }
    };
  }, [handleAddUpsell, handleBack]);

  // Filter upsells by type and search
  const filteredUpsells = upsells
    .filter((u) => u.upsellType === selectedType)
    .filter((u) =>
      searchQuery === "" ||
      u.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const handleEditUpsell = (id) => {
    navigate(`/app/sales-booster/one-click/${id}`);
  };

  const handleDuplicateUpsell = (id) => {
    navigate(`/app/sales-booster/one-click/new?duplicate=${id}`);
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
    <s-page heading="One-Click Upsells">
      <s-button
        ref={backButtonRef}
        slot="secondary-action"
        variant="tertiary"
      >
        ← Back
      </s-button>

      <s-button
        ref={primaryAddBtnRef}
        slot="primary-action"
        variant="primary"
      >
        + Add upsell
      </s-button>

      {/* Step 1: Select Upsell Type */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-text variant="heading-sm">1. Select your upsells mode</s-text>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="base">
              <s-text variant="heading-sm">Select Upsell Type</s-text>

              {/* Type Selector */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                overflow: "hidden",
              }}>
                <button
                  type="button"
                  onClick={() => setSelectedType("pre-purchase")}
                  style={{
                    padding: "16px 24px",
                    border: "none",
                    borderRight: "1px solid #e5e7eb",
                    backgroundColor: selectedType === "pre-purchase" ? "#f3f4f6" : "#ffffff",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: selectedType === "pre-purchase" ? "600" : "400",
                    color: "#111827",
                  }}
                >
                  Pre-purchase
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedType("post-purchase")}
                  style={{
                    padding: "16px 24px",
                    border: "none",
                    backgroundColor: selectedType === "post-purchase" ? "#f3f4f6" : "#ffffff",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: selectedType === "post-purchase" ? "600" : "400",
                    color: "#111827",
                  }}
                >
                  Post-purchase
                </button>
              </div>

              {/* Info Box */}
              <s-box padding="base" borderRadius="base" background="info">
                <s-stack direction="inline" gap="tight" align="start">
                  <span style={{ fontSize: "16px" }}>ℹ️</span>
                  <s-stack direction="block" gap="tight">
                    <s-text variant="heading-sm">
                      {selectedType === "pre-purchase" ? "Pre-Purchase Upsells" : "Post-Purchase Upsells"}
                    </s-text>
                    <s-text variant="body-sm">
                      {selectedType === "pre-purchase"
                        ? "The upsells popup will appear before your customers will be able to enter their address on the order form."
                        : "The upsells popup will appear after customers complete their order."}
                    </s-text>
                  </s-stack>
                </s-stack>
              </s-box>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      {/* Step 2: Upsells List */}
      <s-section>
        <s-stack direction="block" gap="base">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <s-text variant="heading-sm">2. Create your upsells</s-text>
          </div>

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
              gridTemplateColumns: "80px 100px 1fr 120px",
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
                  No {selectedType} upsells found. Click "Add upsell" to create one.
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
                        gridTemplateColumns: "80px 100px 1fr 120px",
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
