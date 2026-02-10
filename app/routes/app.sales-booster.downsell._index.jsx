import { useState, useRef, useEffect, useCallback } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getOrCreateShop, getDownsells, deleteDownsell, toggleDownsellEnabled } from "../lib/db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  // Get all downsells for this shop
  const downsells = await getDownsells(shop.id);

  return {
    shopId: shop.id,
    downsells,
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  await getOrCreateShop(session.shop, session.accessToken);

  const formData = await request.formData();
  const actionType = formData.get("action");
  const downsellId = formData.get("downsellId");

  if (actionType === "delete" && downsellId) {
    await deleteDownsell(downsellId);
    return Response.json({ success: true });
  }

  if (actionType === "toggle" && downsellId) {
    await toggleDownsellEnabled(downsellId);
    return Response.json({ success: true });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
};

export default function DownsellsList() {
  const { downsells } = useLoaderData();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const [searchQuery, setSearchQuery] = useState("");

  // Refs for s-button elements
  const primaryAddBtnRef = useRef(null);
  const secondaryAddBtnRef = useRef(null);
  const backButtonRef = useRef(null);

  const handleAddDownsell = useCallback(() => {
    navigate("/app/sales-booster/downsell/new");
  }, [navigate]);

  const handleBack = useCallback(() => {
    navigate("/app/sales-booster");
  }, [navigate]);

  // Attach event listeners to s-button elements
  useEffect(() => {
    const primaryBtn = primaryAddBtnRef.current;
    const secondaryBtn = secondaryAddBtnRef.current;
    const backBtn = backButtonRef.current;

    if (primaryBtn) {
      primaryBtn.addEventListener("click", handleAddDownsell);
    }
    if (secondaryBtn) {
      secondaryBtn.addEventListener("click", handleAddDownsell);
    }
    if (backBtn) {
      backBtn.addEventListener("click", handleBack);
    }

    return () => {
      if (primaryBtn) {
        primaryBtn.removeEventListener("click", handleAddDownsell);
      }
      if (secondaryBtn) {
        secondaryBtn.removeEventListener("click", handleAddDownsell);
      }
      if (backBtn) {
        backBtn.removeEventListener("click", handleBack);
      }
    };
  }, [handleAddDownsell, handleBack]);

  // Filter downsells by search
  const filteredDownsells = downsells.filter((d) =>
    searchQuery === "" ||
    d.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleEditDownsell = (id) => {
    navigate(`/app/sales-booster/downsell/${id}`);
  };

  const handleDuplicateDownsell = (id) => {
    navigate(`/app/sales-booster/downsell/new?duplicate=${id}`);
  };

  const handleDeleteDownsell = async (id, name) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${name}"? This action cannot be undone.`
    );

    if (confirmed) {
      fetcher.submit(
        { action: "delete", downsellId: id },
        { method: "POST" }
      );
      shopify.toast.show("Downsell deleted successfully");
    }
  };

  const handleToggleEnabled = async (id) => {
    fetcher.submit(
      { action: "toggle", downsellId: id },
      { method: "POST" }
    );
  };

  const handleMovePriority = (id, direction) => {
    // TODO: Implement priority reordering
  };

  return (
    <s-page heading="Downsells">
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
        + Add downsell
      </s-button>

      {/* Search and Add */}
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

          {/* Downsells Table */}
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
            {filteredDownsells.length === 0 ? (
              <div style={{
                padding: "40px",
                textAlign: "center",
                color: "#6b7280",
              }}>
                <s-text tone="subdued">
                  No downsells found. Click "Add downsell" to create one.
                </s-text>
              </div>
            ) : (
              filteredDownsells.map((downsell) => {
                const conversionRate = downsell.impressions > 0
                  ? ((downsell.accepts / downsell.impressions) * 100).toFixed(1)
                  : "0.0";

                return (
                  <div
                    key={downsell.id}
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
                      <div style={{ fontWeight: "500" }}>{downsell.priority}</div>

                      {/* Enabled Toggle */}
                      <div>
                        <button
                          type="button"
                          onClick={() => handleToggleEnabled(downsell.id)}
                          style={{
                            width: "44px",
                            height: "24px",
                            borderRadius: "12px",
                            border: "none",
                            backgroundColor: downsell.enabled ? "#10b981" : "#d1d5db",
                            cursor: "pointer",
                            position: "relative",
                            transition: "background-color 0.2s",
                          }}
                        >
                          <span
                            style={{
                              position: "absolute",
                              top: "2px",
                              left: downsell.enabled ? "22px" : "2px",
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
                      <div style={{ fontWeight: "500" }}>{downsell.name}</div>

                      {/* Actions */}
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={() => handleEditDownsell(downsell.id)}
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
                          onClick={() => handleMovePriority(downsell.id, "up")}
                          title="Move Up"
                          style={{
                            padding: "8px",
                            border: "1px solid #d1d5db",
                            borderRadius: "6px",
                            backgroundColor: "#ffffff",
                            cursor: "pointer",
                          }}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMovePriority(downsell.id, "down")}
                          title="Move Down"
                          style={{
                            padding: "8px",
                            border: "1px solid #d1d5db",
                            borderRadius: "6px",
                            backgroundColor: "#ffffff",
                            cursor: "pointer",
                          }}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDownsell(downsell.id, downsell.name)}
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
                      {downsell.impressions === 0 && downsell.accepts === 0 && downsell.declines === 0 ? (
                        <span>No data available yet. Check again after the first impression or order with this downsell.</span>
                      ) : (
                        <>
                          <span>
                            <strong style={{ color: "#374151" }}>{downsell.impressions}</strong> Views
                          </span>
                          <span>
                            <strong style={{ color: "#374151" }}>{downsell.accepts}</strong> Accepts
                          </span>
                          <span>
                            <strong style={{ color: "#374151" }}>{downsell.declines}</strong> Declines
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
