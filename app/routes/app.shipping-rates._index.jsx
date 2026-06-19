import { useState, useRef, useEffect, useCallback } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  getOrCreateShop,
  getShippingRates,
  deleteShippingRate,
  toggleShippingRateEnabled,
} from "../lib/db.server";
import { getCurrencySymbol } from "../lib/constants";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  // Get all shipping rates for this shop
  const shippingRates = await getShippingRates(shop.id);

  return {
    shopId: shop.id,
    shippingRates,
    currencySymbol: getCurrencySymbol(shop.country),
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  await getOrCreateShop(session.shop, session.accessToken);

  const formData = await request.formData();
  const actionType = formData.get("action");
  const rateId = formData.get("rateId");

  if (actionType === "delete" && rateId) {
    await deleteShippingRate(rateId);
    return Response.json({ success: true });
  }

  if (actionType === "toggle" && rateId) {
    await toggleShippingRateEnabled(rateId);
    return Response.json({ success: true });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
};

export default function ShippingRates() {
  const { shippingRates, currencySymbol } = useLoaderData();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const [searchQuery, setSearchQuery] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [hoveredConditionRateId, setHoveredConditionRateId] = useState(null);

  // Refs for s-button elements
  const addButtonRef = useRef(null);
  const secondaryAddBtnRef = useRef(null);
  const importButtonRef = useRef(null);
  const syncButtonRef = useRef(null);

  const handleAddRate = useCallback(() => {
    navigate("/app/shipping-rates/new");
  }, [navigate]);

  const handleImport = useCallback(async () => {
    setIsImporting(true);
    try {
      const response = await fetch("/api/shipping-rates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "import_shopify" }),
      });

      const data = await response.json();

      if (data.success) {
        shopify.toast.show(`Imported ${data.imported} shipping rates from Shopify`);
        navigate(0); // Reload page
      } else {
        shopify.toast.show("Failed to import shipping rates", { isError: true });
      }
    } catch (error) {
      console.error("Import error:", error);
      shopify.toast.show("Error importing shipping rates", { isError: true });
    } finally {
      setIsImporting(false);
    }
  }, [shopify, navigate]);

  const handleSync = useCallback(async () => {
    setIsImporting(true);
    try {
      const response = await fetch("/api/shipping-rates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "sync_shopify" }),
      });

      const data = await response.json();

      if (data.success) {
        shopify.toast.show(`Synced ${data.synced} shipping rates from Shopify`);
        navigate(0); // Reload page
      } else {
        shopify.toast.show("Failed to sync shipping rates", { isError: true });
      }
    } catch (error) {
      console.error("Sync error:", error);
      shopify.toast.show("Error syncing shipping rates", { isError: true });
    } finally {
      setIsImporting(false);
    }
  }, [shopify, navigate]);

  // Attach event listeners to s-button elements
  useEffect(() => {
    const addBtn = addButtonRef.current;
    const secondaryAddBtn = secondaryAddBtnRef.current;
    const importBtn = importButtonRef.current;
    const syncBtn = syncButtonRef.current;

    if (addBtn) {
      addBtn.addEventListener("click", handleAddRate);
    }
    if (secondaryAddBtn) {
      secondaryAddBtn.addEventListener("click", handleAddRate);
    }
    if (importBtn) {
      importBtn.addEventListener("click", handleImport);
    }
    if (syncBtn) {
      syncBtn.addEventListener("click", handleSync);
    }

    return () => {
      if (addBtn) {
        addBtn.removeEventListener("click", handleAddRate);
      }
      if (secondaryAddBtn) {
        secondaryAddBtn.removeEventListener("click", handleAddRate);
      }
      if (importBtn) {
        importBtn.removeEventListener("click", handleImport);
      }
      if (syncBtn) {
        syncBtn.removeEventListener("click", handleSync);
      }
    };
  }, [handleAddRate, handleImport, handleSync]);

  // Filter shipping rates by search
  const filteredRates = shippingRates.filter(
    (rate) =>
      searchQuery === "" ||
      rate.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleEditRate = (id) => {
    navigate(`/app/shipping-rates/${id}`);
  };

  const handleDeleteRate = async (id, name) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${name}"? This action cannot be undone.`
    );

    if (confirmed) {
      fetcher.submit(
        { action: "delete", rateId: id },
        { method: "POST" }
      );
      shopify.toast.show("Shipping rate deleted successfully");
    }
  };

  const handleToggleEnabled = async (id) => {
    fetcher.submit(
      { action: "toggle", rateId: id },
      { method: "POST" }
    );
  };

  const getConditionSummary = (conditions) => {
    if (!conditions || conditions.length === 0) {
      return "No condition, always visible";
    }

    const conditionsArray = typeof conditions === "string" ? JSON.parse(conditions) : conditions;

    if (conditionsArray.length === 0) {
      return "No condition, always visible";
    }

    return `${conditionsArray.length} condition${conditionsArray.length > 1 ? "s" : ""}`;
  };

  // Build a human-readable line per condition for the hover tooltip.
  const getConditionDetails = (conditions) => {
    const arr = typeof conditions === "string" ? JSON.parse(conditions || "[]") : (conditions || []);
    return arr.map((c) => {
      switch (c.type) {
        case "order_total_gte":
          return `Order total ≥ ${currencySymbol}${Number(c.value || 0).toFixed(2)}`;
        case "order_total_lt":
          return `Order total < ${currencySymbol}${Number(c.value || 0).toFixed(2)}`;
        case "order_weight_gte":
          return `Order weight ≥ ${c.value || 0} kg`;
        case "order_weight_lt":
          return `Order weight < ${c.value || 0} kg`;
        case "quantity_gte":
          return `Quantity ≥ ${c.value || 0}`;
        case "quantity_lt":
          return `Quantity < ${c.value || 0}`;
        case "contains_product": {
          const names = c.productTitles || c.productTitle
            || (c.productIds ? `${c.productIds.length} product(s)` : "a product");
          return `Cart contains ${names}`;
        }
        case "not_contains_product": {
          const names = c.productTitles || c.productTitle
            || (c.productIds ? `${c.productIds.length} product(s)` : "a product");
          return `Cart doesn't contain ${names}`;
        }
        default:
          return c.type;
      }
    });
  };

  const hasShopifyRates = shippingRates.some((rate) => rate.isShopifyImported);

  return (
    <s-page heading="Shipping Rates">
      <s-button
        ref={addButtonRef}
        slot="primary-action"
        variant="primary"
      >
        + Add rate
      </s-button>

      <s-section>
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Configure your shipping rates for the COD form. All prices will use your store currency.
          </s-paragraph>

          {/* Import/Sync Buttons */}
          <s-stack direction="inline" gap="base">
            <s-button
              ref={importButtonRef}
              variant="secondary"
              {...(isImporting ? { loading: true } : {})}
            >
              Import from Shopify
            </s-button>

            {hasShopifyRates && (
              <s-button
                ref={syncButtonRef}
                variant="secondary"
                {...(isImporting ? { loading: true } : {})}
              >
                Sync Shopify Rates
              </s-button>
            )}
          </s-stack>

          {/* Search */}
          <input
            type="text"
            placeholder="Search shipping rates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "8px",
              border: "1px solid #D1D5DB",
              fontSize: "14px",
            }}
          />

          {/* Rates Table */}
          {filteredRates.length > 0 ? (
            <div style={{
              border: "1px solid #E5E7EB",
              borderRadius: "8px",
              overflow: "visible",
            }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "#F9FAFB" }}>
                    <th style={{
                      padding: "12px",
                      textAlign: "left",
                      borderBottom: "1px solid #E5E7EB",
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "#6B7280",
                      textTransform: "uppercase",
                    }}>
                      Priority
                    </th>
                    <th style={{
                      padding: "12px",
                      textAlign: "left",
                      borderBottom: "1px solid #E5E7EB",
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "#6B7280",
                      textTransform: "uppercase",
                    }}>
                      Enabled
                    </th>
                    <th style={{
                      padding: "12px",
                      textAlign: "left",
                      borderBottom: "1px solid #E5E7EB",
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "#6B7280",
                      textTransform: "uppercase",
                    }}>
                      Name
                    </th>
                    <th style={{
                      padding: "12px",
                      textAlign: "left",
                      borderBottom: "1px solid #E5E7EB",
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "#6B7280",
                      textTransform: "uppercase",
                    }}>
                      Price
                    </th>
                    <th style={{
                      padding: "12px",
                      textAlign: "left",
                      borderBottom: "1px solid #E5E7EB",
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "#6B7280",
                      textTransform: "uppercase",
                    }}>
                      Condition
                    </th>
                    <th style={{
                      padding: "12px",
                      textAlign: "left",
                      borderBottom: "1px solid #E5E7EB",
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "#6B7280",
                      textTransform: "uppercase",
                    }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRates.map((rate) => (
                    <tr key={rate.id} style={{ borderBottom: "1px solid #E5E7EB" }}>
                      <td style={{ padding: "12px", fontSize: "14px", color: "#111827" }}>
                        {rate.priority}
                      </td>
                      <td style={{ padding: "12px" }}>
                        <input
                          type="checkbox"
                          checked={rate.enabled}
                          onChange={() => handleToggleEnabled(rate.id)}
                          style={{ width: "18px", height: "18px", cursor: "pointer" }}
                        />
                      </td>
                      <td style={{ padding: "12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "14px", color: "#111827" }}>
                            {rate.name}
                          </span>
                          {rate.isShopifyImported && (
                            <span style={{
                              padding: "2px 6px",
                              backgroundColor: "#DBEAFE",
                              color: "#1E40AF",
                              borderRadius: "4px",
                              fontSize: "11px",
                              fontWeight: "500",
                            }}>
                              Shopify
                            </span>
                          )}
                        </div>
                        {rate.description && (
                          <div style={{ fontSize: "12px", color: "#6B7280", marginTop: "2px" }}>
                            {rate.description}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "12px", fontSize: "14px", color: "#111827" }}>
                        {rate.price === 0 ? (
                          <span style={{ color: "#10B981", fontWeight: "500" }}>Free</span>
                        ) : (
                          `${currencySymbol}${rate.price.toFixed(2)}`
                        )}
                      </td>
                      <td style={{ padding: "12px", fontSize: "13px", color: "#6B7280", position: "relative" }}>
                        {(() => {
                          const condArr = typeof rate.conditions === "string" ? JSON.parse(rate.conditions || "[]") : (rate.conditions || []);
                          const hasConditions = condArr.length > 0;
                          return (
                            <div
                              style={{ display: "inline-flex", alignItems: "center", gap: "6px", cursor: hasConditions ? "help" : "default" }}
                              onMouseEnter={() => hasConditions && setHoveredConditionRateId(rate.id)}
                              onMouseLeave={() => setHoveredConditionRateId(null)}
                            >
                              {hasConditions && (
                                <span style={{
                                  width: "16px",
                                  height: "16px",
                                  backgroundColor: "#FEF3C7",
                                  color: "#92400E",
                                  borderRadius: "50%",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: "10px",
                                  fontWeight: "600",
                                }}>
                                  ⚙
                                </span>
                              )}
                              <span style={hasConditions ? { borderBottom: "1px dotted #9CA3AF" } : undefined}>
                                {getConditionSummary(rate.conditions)}
                              </span>

                              {hasConditions && hoveredConditionRateId === rate.id && (
                                <div style={{
                                  position: "absolute",
                                  bottom: "100%",
                                  left: "12px",
                                  marginBottom: "4px",
                                  zIndex: 20,
                                  backgroundColor: "#111827",
                                  color: "#FFFFFF",
                                  padding: "8px 10px",
                                  borderRadius: "6px",
                                  fontSize: "12px",
                                  lineHeight: "1.5",
                                  boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
                                  whiteSpace: "nowrap",
                                  pointerEvents: "none",
                                }}>
                                  <div style={{ fontWeight: "600", marginBottom: "2px", color: "#D1D5DB" }}>
                                    Shows when {condArr.length > 1 ? "all apply:" : "this applies:"}
                                  </div>
                                  {getConditionDetails(rate.conditions).map((line, i) => (
                                    <div key={i}>• {line}</div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td style={{ padding: "12px" }}>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            onClick={() => handleEditRate(rate.id)}
                            style={{
                              padding: "6px 12px",
                              backgroundColor: "#F3F4F6",
                              border: "1px solid #D1D5DB",
                              borderRadius: "6px",
                              cursor: "pointer",
                              fontSize: "13px",
                              color: "#374151",
                            }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteRate(rate.id, rate.name)}
                            style={{
                              padding: "6px 12px",
                              backgroundColor: "#FEE2E2",
                              border: "1px solid #FECACA",
                              borderRadius: "6px",
                              cursor: "pointer",
                              fontSize: "13px",
                              color: "#991B1B",
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-stack direction="block" gap="tight" align="center">
                <s-text variant="heading-sm">No shipping rates found</s-text>
                {searchQuery ? (
                  <s-text variant="body-sm">
                    Try a different search query or clear the search.
                  </s-text>
                ) : (
                  <>
                    <s-text variant="body-sm">
                      Get started by creating a new shipping rate or importing from Shopify.
                    </s-text>
                    <s-button
                      ref={secondaryAddBtnRef}
                      variant="primary"
                    >
                      + Add your first rate
                    </s-button>
                  </>
                )}
              </s-stack>
            </s-box>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
