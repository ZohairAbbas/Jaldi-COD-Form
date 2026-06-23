import { useState, useRef, useEffect, useCallback } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getOrCreateShop, getBundles, deleteBundle, updateBundleStatus, duplicateBundle } from "../lib/db.server";
import { syncStorefrontConfigByDomain } from "../lib/storefront-config.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);
  const bundles = await getBundles(shop.id);

  return {
    shopId: shop.id,
    bundles,
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  await getOrCreateShop(session.shop, session.accessToken);

  const formData = await request.formData();
  const actionType = formData.get("action");
  const bundleId = formData.get("bundleId");

  // Refresh the inlined storefront config metafield after a mutation (non-blocking).
  const sync = () => syncStorefrontConfigByDomain(admin, session.shop);

  if (actionType === "delete" && bundleId) {
    await deleteBundle(bundleId);
    await sync();
    return Response.json({ success: true });
  }

  if (actionType === "toggle" && bundleId) {
    const newStatus = formData.get("newStatus");
    await updateBundleStatus(bundleId, newStatus);
    await sync();
    return Response.json({ success: true });
  }

  if (actionType === "duplicate" && bundleId) {
    await duplicateBundle(bundleId);
    await sync();
    return Response.json({ success: true });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
};

export default function BundlesList() {
  const { bundles } = useLoaderData();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const primaryAddBtnRef = useRef(null);
  const backButtonRef = useRef(null);

  const handleAddBundle = useCallback(() => {
    navigate("/app/sales-booster/bundle/new");
  }, [navigate]);

  const handleBack = useCallback(() => {
    navigate("/app/sales-booster");
  }, [navigate]);

  useEffect(() => {
    const primaryBtn = primaryAddBtnRef.current;
    const backBtn = backButtonRef.current;

    if (primaryBtn) primaryBtn.addEventListener("click", handleAddBundle);
    if (backBtn) backBtn.addEventListener("click", handleBack);

    return () => {
      if (primaryBtn) primaryBtn.removeEventListener("click", handleAddBundle);
      if (backBtn) backBtn.removeEventListener("click", handleBack);
    };
  }, [handleAddBundle, handleBack]);

  // Client-side filtering
  const filteredBundles = bundles.filter((b) => {
    const matchesSearch = searchQuery === "" || b.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab =
      activeTab === "all" ||
      (activeTab === "published" && b.status === "published") ||
      (activeTab === "draft" && b.status === "draft") ||
      (activeTab === "inactive" && b.status === "inactive");
    return matchesSearch && matchesTab;
  });

  const handleEditBundle = (id) => {
    navigate(`/app/sales-booster/bundle/${id}`);
  };

  const handleDuplicateBundle = (id) => {
    fetcher.submit(
      { action: "duplicate", bundleId: id },
      { method: "POST" }
    );
    shopify.toast.show("Bundle duplicated successfully");
  };

  const handleDeleteBundle = (id, name) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${name}"? This action cannot be undone.`
    );
    if (confirmed) {
      fetcher.submit(
        { action: "delete", bundleId: id },
        { method: "POST" }
      );
      shopify.toast.show("Bundle deleted successfully");
    }
  };

  const handleToggleStatus = (id, currentStatus) => {
    const newStatus = currentStatus === "published" ? "inactive" : "published";
    fetcher.submit(
      { action: "toggle", bundleId: id, newStatus },
      { method: "POST" }
    );
  };

  const getStatusBadge = (status) => {
    const styles = {
      published: { bg: "#dcfce7", color: "#166534", label: "Published" },
      draft: { bg: "#fef3c7", color: "#92400e", label: "Draft" },
      inactive: { bg: "#fee2e2", color: "#991b1b", label: "Inactive" },
    };
    const s = styles[status] || styles.draft;
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
  };

  const tabs = [
    { id: "all", label: "All" },
    { id: "published", label: "Published" },
    { id: "draft", label: "Draft" },
    { id: "inactive", label: "Inactive" },
  ];

  return (
    <s-page heading="Offer List">
      <s-button ref={backButtonRef} slot="secondary-action" variant="tertiary">
        ← Back
      </s-button>
      <s-button ref={primaryAddBtnRef} slot="primary-action" variant="primary">
        + Create new offer
      </s-button>

      <s-section>
        <s-stack direction="block" gap="base">
          {/* Filter Tabs */}
          <div style={{ display: "flex", gap: "4px", borderBottom: "1px solid #e5e7eb", paddingBottom: "0" }}>
            {tabs.map((tab) => (
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
          </div>

          {/* Table */}
          <s-box borderWidth="base" borderRadius="base" style={{ overflow: "hidden" }}>
            {/* Table Header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 150px 120px 150px 150px",
              gap: "16px",
              padding: "12px 16px",
              backgroundColor: "#f9fafb",
              borderBottom: "1px solid #e5e7eb",
              fontWeight: "600",
              fontSize: "14px",
              color: "#374151",
            }}>
              <div>Offer Name</div>
              <div>Last Edited</div>
              <div>Status</div>
              <div>Offer Type</div>
              <div>Actions</div>
            </div>

            {/* Table Body */}
            {filteredBundles.length === 0 ? (
              <div style={{
                padding: "60px 40px",
                textAlign: "center",
                color: "#6b7280",
              }}>
                <div style={{ fontSize: "48px", marginBottom: "16px" }}>📦</div>
                <s-text variant="heading-md">Create your first offer</s-text>
                <div style={{ marginTop: "8px" }}>
                  <s-text tone="subdued">
                    Create a bundle or quantity break offer to encourage customers to buy more.
                  </s-text>
                </div>
              </div>
            ) : (
              filteredBundles.map((bundle) => {
                const conversionRate = bundle.impressions > 0
                  ? ((bundle.accepts / bundle.impressions) * 100).toFixed(1)
                  : "0.0";

                return (
                  <div
                    key={bundle.id}
                    style={{ borderBottom: "1px solid #e5e7eb" }}
                  >
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 150px 120px 150px 150px",
                      gap: "16px",
                      padding: "16px",
                      alignItems: "center",
                    }}>
                      {/* Offer Name */}
                      <div style={{ fontWeight: "500" }}>{bundle.name}</div>

                      {/* Last Edited */}
                      <div style={{ fontSize: "13px", color: "#6b7280" }}>
                        {new Date(bundle.updatedAt).toLocaleDateString()}
                      </div>

                      {/* Status + Toggle */}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {getStatusBadge(bundle.status)}
                        {bundle.status !== "draft" && (
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(bundle.id, bundle.status)}
                            style={{
                              width: "36px",
                              height: "20px",
                              borderRadius: "10px",
                              border: "none",
                              backgroundColor: bundle.status === "published" ? "#10b981" : "#d1d5db",
                              cursor: "pointer",
                              position: "relative",
                              transition: "background-color 0.2s",
                            }}
                          >
                            <span style={{
                              position: "absolute",
                              top: "2px",
                              left: bundle.status === "published" ? "18px" : "2px",
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

                      {/* Offer Type */}
                      <div style={{ fontSize: "13px", color: "#6b7280" }}>
                        Quantity Breaks
                      </div>

                      {/* Actions */}
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          type="button"
                          onClick={() => handleEditBundle(bundle.id)}
                          title="Edit"
                          style={{
                            padding: "6px 8px",
                            border: "1px solid #d1d5db",
                            borderRadius: "6px",
                            backgroundColor: "#ffffff",
                            cursor: "pointer",
                            fontSize: "14px",
                          }}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicateBundle(bundle.id)}
                          title="Duplicate"
                          style={{
                            padding: "6px 8px",
                            border: "1px solid #d1d5db",
                            borderRadius: "6px",
                            backgroundColor: "#ffffff",
                            cursor: "pointer",
                            fontSize: "14px",
                          }}
                        >
                          📋
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteBundle(bundle.id, bundle.name)}
                          title="Delete"
                          style={{
                            padding: "6px 8px",
                            border: "1px solid #d1d5db",
                            borderRadius: "6px",
                            backgroundColor: "#ffffff",
                            cursor: "pointer",
                            fontSize: "14px",
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>

                    {/* Stats Row */}
                    <div style={{
                      display: "flex",
                      gap: "24px",
                      padding: "8px 16px 16px 16px",
                      backgroundColor: "#f9fafb",
                      fontSize: "13px",
                      color: "#6b7280",
                    }}>
                      <span>📊 <strong>STATS:</strong></span>
                      {bundle.impressions === 0 && bundle.accepts === 0 ? (
                        <span>No data available yet.</span>
                      ) : (
                        <>
                          <span>
                            <strong style={{ color: "#374151" }}>{bundle.impressions}</strong> Views
                          </span>
                          <span>
                            <strong style={{ color: "#374151" }}>{bundle.accepts}</strong> Accepts
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

          {/* Pagination info */}
          {filteredBundles.length > 0 && (
            <div style={{ textAlign: "center", fontSize: "13px", color: "#6b7280" }}>
              Showing {filteredBundles.length} of {bundles.length} offers
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
