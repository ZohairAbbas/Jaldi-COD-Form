import { useState, useEffect, useRef, useCallback } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  getOrCreateShop,
  getShippingRateById,
  createShippingRate,
  updateShippingRate,
  getDefaultShippingRate,
} from "../lib/db.server";
import { getCurrencySymbol } from "../lib/constants";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);
  const currencySymbol = getCurrencySymbol(shop.country);

  // If editing existing rate
  if (params.id !== "new") {
    const rate = await getShippingRateById(params.id);
    if (!rate || rate.shopId !== shop.id) {
      throw new Response("Shipping rate not found", { status: 404 });
    }
    return { shippingRate: rate, isNew: false, shopId: shop.id, currencySymbol };
  }

  // New rate with defaults
  const defaultRate = getDefaultShippingRate();

  return { shippingRate: defaultRate, isNew: true, shopId: shop.id, currencySymbol };
};

export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  const rateData = await request.json();

  // Remove fields that shouldn't be saved
  delete rateData.id;
  delete rateData.shopId;
  delete rateData.createdAt;
  delete rateData.updatedAt;

  if (params.id === "new") {
    // Create new rate
    const newRate = await createShippingRate(shop.id, rateData);
    return Response.json({ success: true, shippingRate: newRate });
  } else {
    // Update existing rate
    const existingRate = await getShippingRateById(params.id);
    if (!existingRate || existingRate.shopId !== shop.id) {
      return Response.json({ error: "Shipping rate not found" }, { status: 404 });
    }

    const updatedRate = await updateShippingRate(params.id, rateData);
    return Response.json({ success: true, shippingRate: updatedRate });
  }
};

export default function ShippingRateEditor() {
  const { shippingRate: initialRate, isNew, currencySymbol } = useLoaderData();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const [rate, setRate] = useState(() => ({
    ...initialRate,
    conditions: typeof initialRate.conditions === "string"
      ? JSON.parse(initialRate.conditions)
      : initialRate.conditions || [],
  }));

  // Refs for s-button elements
  const saveButtonRef = useRef(null);
  const cancelButtonRef = useRef(null);

  const isSaving = fetcher.state === "submitting";

  // Handle successful save
  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(isNew ? "Shipping rate created successfully!" : "Shipping rate saved successfully!");
      navigate("/app/shipping-rates");
    } else if (fetcher.data?.error) {
      shopify.toast.show("Error saving shipping rate", { isError: true });
    }
  }, [fetcher.data, isNew, navigate, shopify]);

  const handleUpdate = (updates) => {
    setRate((prev) => ({ ...prev, ...updates }));
  };

  const handleSave = useCallback(() => {
    // Validation
    if (!rate.name?.trim()) {
      shopify.toast.show("Please enter a rate name", { isError: true });
      return;
    }

    if (rate.price == null || rate.price < 0) {
      shopify.toast.show("Please enter a valid price", { isError: true });
      return;
    }

    // Convert conditions array to JSON for storage
    const rateToSave = {
      ...rate,
      conditions: rate.conditions,
    };

    fetcher.submit(rateToSave, {
      method: "POST",
      encType: "application/json",
    });
  }, [rate, fetcher, shopify]);

  const handleCancel = useCallback(() => {
    navigate("/app/shipping-rates");
  }, [navigate]);

  // Attach event listener to save button
  useEffect(() => {
    const button = saveButtonRef.current;
    if (button) {
      button.addEventListener("click", handleSave);
      return () => {
        button.removeEventListener("click", handleSave);
      };
    }
  }, [handleSave]);

  // Attach event listener to cancel button
  useEffect(() => {
    const button = cancelButtonRef.current;
    if (button) {
      button.addEventListener("click", handleCancel);
      return () => {
        button.removeEventListener("click", handleCancel);
      };
    }
  }, [handleCancel]);

  // Condition management
  const addCondition = () => {
    handleUpdate({
      conditions: [
        ...rate.conditions,
        { type: "order_total_gte", value: 0 },
      ],
    });
  };

  const updateCondition = (index, updates) => {
    const newConditions = [...rate.conditions];
    newConditions[index] = { ...newConditions[index], ...updates };
    handleUpdate({ conditions: newConditions });
  };

  const removeCondition = (index) => {
    const newConditions = rate.conditions.filter((_, i) => i !== index);
    handleUpdate({ conditions: newConditions });
  };

  const handleSelectProduct = async (index) => {
    try {
      const selected = await shopify.resourcePicker({
        type: "product",
        action: "select",
        filter: {
          variants: false,
          draft: false,
          archived: false,
        },
        multiple: true,
      });

      if (selected && selected.length > 0) {
        const productIds = selected.map(p => p.id);
        const productTitles = selected.map(p => p.title).join(', ');
        updateCondition(index, { productIds: productIds, productTitles: productTitles });
      }
    } catch (error) {
      console.error("Product picker error:", error);
    }
  };

  const getConditionLabel = (type) => {
    const labels = {
      order_total_gte: "Order total >=",
      order_total_lt: "Order total <",
      order_weight_gte: "Order weight >=",
      order_weight_lt: "Order weight <",
      quantity_gte: "Quantity >=",
      quantity_lt: "Quantity <",
      contains_product: "Cart contains product",
      not_contains_product: "Cart doesn't contain product",
    };
    return labels[type] || type;
  };

  const isProductCondition = (type) => {
    return type === "contains_product" || type === "not_contains_product";
  };

  return (
    <s-page heading={isNew ? "Create Shipping Rate" : "Edit Shipping Rate"}>
      <s-button
        ref={cancelButtonRef}
        slot="secondary-action"
        variant="tertiary"
      >
        Cancel
      </s-button>

      <s-button
        ref={saveButtonRef}
        slot="primary-action"
        variant="primary"
        {...(isSaving ? { loading: true } : {})}
      >
        Save
      </s-button>

      {/* Basic Settings */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Basic Settings</s-heading>

          {/* Rate Name */}
          <s-stack direction="block" gap="tight">
            <s-text variant="heading-sm">Rate name</s-text>
            <input
              type="text"
              value={rate.name}
              onChange={(e) => handleUpdate({ name: e.target.value })}
              placeholder="e.g., Standard Shipping"
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "8px",
                border: "1px solid #D1D5DB",
                fontSize: "14px",
              }}
            />
          </s-stack>

          {/* Rate Description */}
          <s-stack direction="block" gap="tight">
            <s-text variant="heading-sm">Rate description (optional)</s-text>
            <textarea
              value={rate.description || ""}
              onChange={(e) => handleUpdate({ description: e.target.value })}
              placeholder="e.g., Delivery within 3-5 business days"
              rows={3}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "8px",
                border: "1px solid #D1D5DB",
                fontSize: "14px",
                fontFamily: "inherit",
                resize: "vertical",
              }}
            />
          </s-stack>

          {/* Rate Price */}
          <s-stack direction="block" gap="tight">
            <s-text variant="heading-sm">Rate price</s-text>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "16px", fontWeight: "500", color: "#6B7280" }}>
                {currencySymbol}
              </span>
              <input
                type="number"
                value={rate.price}
                onChange={(e) => handleUpdate({ price: parseFloat(e.target.value) || 0 })}
                min="0"
                step="0.01"
                style={{
                  width: "200px",
                  padding: "10px",
                  borderRadius: "8px",
                  border: "1px solid #D1D5DB",
                  fontSize: "14px",
                }}
              />
            </div>
            <s-text variant="body-sm" tone="subdued">
              Enter 0 for free shipping
            </s-text>
          </s-stack>

          {/* Enabled Toggle */}
          <s-stack direction="inline" gap="base" align="space-between">
            <s-stack direction="block" gap="tight">
              <s-text variant="heading-sm">Enable this rate</s-text>
              <s-text variant="body-sm" tone="subdued">
                Disabled rates won't show in the COD form
              </s-text>
            </s-stack>
            <input
              type="checkbox"
              checked={rate.enabled}
              onChange={(e) => handleUpdate({ enabled: e.target.checked })}
              style={{ width: "20px", height: "20px" }}
            />
          </s-stack>
        </s-stack>
      </s-section>

      {/* Conditions */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Rate Conditions</s-heading>
          <s-paragraph>
            Add conditions to control when this rate is available. All conditions must be met (AND logic).
          </s-paragraph>

          {/* Conditions List */}
          {rate.conditions.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {rate.conditions.map((condition, index) => (
                <div
                  key={index}
                  style={{
                    display: "flex",
                    gap: "12px",
                    alignItems: "flex-start",
                    padding: "16px",
                    border: "1px solid #E5E7EB",
                    borderRadius: "8px",
                    backgroundColor: "#F9FAFB",
                  }}
                >
                  {/* Condition Type Select */}
                  <select
                    value={condition.type}
                    onChange={(e) => {
                      const newType = e.target.value;
                      updateCondition(index, {
                        type: newType,
                        value: isProductCondition(newType) ? undefined : 0,
                        productId: isProductCondition(newType) ? "" : undefined,
                        productTitle: undefined,
                      });
                    }}
                    style={{
                      flex: "1",
                      padding: "10px",
                      borderRadius: "6px",
                      border: "1px solid #D1D5DB",
                      fontSize: "14px",
                      backgroundColor: "#FFFFFF",
                    }}
                  >
                    <option value="order_total_gte">Order total is greater or equal than</option>
                    <option value="order_total_lt">Order total is less than</option>
                    <option value="order_weight_gte">Order weight is greater or equal than</option>
                    <option value="order_weight_lt">Order weight is less than</option>
                    <option value="quantity_gte">Quantity is greater or equal than</option>
                    <option value="quantity_lt">Quantity is less than</option>
                    <option value="contains_product">Cart contains product</option>
                    <option value="not_contains_product">Cart doesn't contain product</option>
                  </select>

                  {/* Value Input or Product Picker */}
                  {isProductCondition(condition.type) ? (
                    <div style={{ flex: "1" }}>
                      {(condition.productIds && condition.productIds.length > 0) || condition.productId ? (
                        <div style={{
                          padding: "10px",
                          borderRadius: "6px",
                          border: "1px solid #D1D5DB",
                          backgroundColor: "#FFFFFF",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}>
                          <span style={{ fontSize: "14px" }}>
                            {condition.productTitles || condition.productTitle ||
                             (condition.productIds ? `${condition.productIds.length} product(s)` : condition.productId)}
                          </span>
                          <button
                            onClick={() => handleSelectProduct(index)}
                            style={{
                              padding: "4px 8px",
                              backgroundColor: "#F3F4F6",
                              border: "1px solid #D1D5DB",
                              borderRadius: "4px",
                              fontSize: "12px",
                              cursor: "pointer",
                            }}
                          >
                            Change
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleSelectProduct(index)}
                          style={{
                            width: "100%",
                            padding: "10px",
                            borderRadius: "6px",
                            border: "1px solid #D1D5DB",
                            backgroundColor: "#FFFFFF",
                            fontSize: "14px",
                            cursor: "pointer",
                            color: "#6B7280",
                          }}
                        >
                          Select Products
                        </button>
                      )}
                    </div>
                  ) : (
                    <input
                      type="number"
                      value={condition.value || 0}
                      onChange={(e) => updateCondition(index, { value: parseFloat(e.target.value) || 0 })}
                      min="0"
                      step="0.01"
                      style={{
                        flex: "1",
                        padding: "10px",
                        borderRadius: "6px",
                        border: "1px solid #D1D5DB",
                        fontSize: "14px",
                        backgroundColor: "#FFFFFF",
                      }}
                    />
                  )}

                  {/* Remove Button */}
                  <button
                    onClick={() => removeCondition(index)}
                    style={{
                      padding: "10px 14px",
                      backgroundColor: "#FEE2E2",
                      border: "1px solid #FECACA",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "14px",
                      color: "#991B1B",
                      fontWeight: "500",
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add Condition Button */}
          <button
            onClick={addCondition}
            style={{
              padding: "10px 16px",
              backgroundColor: "#F3F4F6",
              border: "1px solid #D1D5DB",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "500",
              color: "#374151",
              width: "fit-content",
            }}
          >
            + Add condition
          </button>

          {/* Info Box */}
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-text variant="body-sm">
              ℹ️ All conditions must be met for this rate to be available (AND logic). If no conditions are set, the rate will always be visible.
            </s-text>
          </s-box>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
