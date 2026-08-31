import { useState, useEffect, useRef, useCallback } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  getOrCreateShop,
  getUpsellById,
  createUpsell,
  updateUpsell,
  getDefaultUpsell,
} from "../lib/db.server";
import { getCurrencySymbol } from "../lib/constants";
import { syncStorefrontConfigByDomain } from "../lib/storefront-config.server";
import CountryTargetingPicker from "../components/CountryTargetingPicker";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  const url = new URL(request.url);
  const upsellType = url.searchParams.get("type") || "pre-purchase";
  const duplicateId = url.searchParams.get("duplicate");

  const currencySymbol = getCurrencySymbol(shop.country);

  // If editing existing upsell
  if (params.id !== "new") {
    const upsell = await getUpsellById(params.id);
    if (!upsell || upsell.shopId !== shop.id) {
      throw new Response("Upsell not found", { status: 404 });
    }
    return { upsell, isNew: false, shopId: shop.id, currencySymbol };
  }

  // If duplicating
  if (duplicateId) {
    const sourceUpsell = await getUpsellById(duplicateId);
    if (sourceUpsell && sourceUpsell.shopId === shop.id) {
      const duplicatedUpsell = {
        ...sourceUpsell,
        id: null,
        name: `${sourceUpsell.name} (Copy)`,
        enabled: false,
      };
      return { upsell: duplicatedUpsell, isNew: true, shopId: shop.id, currencySymbol };
    }
  }

  // New upsell with defaults
  const defaultUpsell = getDefaultUpsell();
  defaultUpsell.upsellType = upsellType;

  return { upsell: defaultUpsell, isNew: true, shopId: shop.id, currencySymbol };
};

export const action = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  const upsellData = await request.json();

  // Remove fields that shouldn't be saved
  delete upsellData.id;
  delete upsellData.shopId;
  delete upsellData.createdAt;
  delete upsellData.updatedAt;
  delete upsellData.impressions;
  delete upsellData.accepts;
  delete upsellData.declines;

  let result;
  if (params.id === "new") {
    // Create new upsell
    const newUpsell = await createUpsell(shop.id, upsellData);
    result = Response.json({ success: true, upsell: newUpsell });
  } else {
    // Update existing upsell
    const existingUpsell = await getUpsellById(params.id);
    if (!existingUpsell || existingUpsell.shopId !== shop.id) {
      return Response.json({ error: "Upsell not found" }, { status: 404 });
    }

    const updatedUpsell = await updateUpsell(params.id, upsellData);
    result = Response.json({ success: true, upsell: updatedUpsell });
  }

  // Refresh the inlined storefront config metafield (non-blocking on failure).
  await syncStorefrontConfigByDomain(admin, session.shop);
  return result;
};

export default function UpsellEditor() {
  const { upsell: initialUpsell, isNew, currencySymbol } = useLoaderData();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const [upsell, setUpsell] = useState(initialUpsell);

  // Refs for s-button elements
  const saveButtonRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const selectProductBtnRef = useRef(null);
  const removeProductBtnRef = useRef(null);

  const isSaving = fetcher.state === "submitting";

  // Handle successful save
  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(isNew ? "Upsell created successfully!" : "Upsell saved successfully!");
      navigate("/app/sales-booster/one-click");
    } else if (fetcher.data?.error) {
      shopify.toast.show("Error saving upsell", { isError: true });
    }
  }, [fetcher.data, isNew, navigate, shopify]);

  const handleUpdate = (updates) => {
    setUpsell((prev) => ({ ...prev, ...updates }));
  };

  const handleSave = useCallback(() => {
    // Validation
    if (!upsell.name?.trim()) {
      shopify.toast.show("Please enter an upsell name", { isError: true });
      return;
    }

    fetcher.submit(upsell, {
      method: "POST",
      encType: "application/json",
    });
  }, [upsell, fetcher, shopify]);

  const handleCancel = useCallback(() => {
    navigate("/app/sales-booster/one-click");
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

  const handleSelectProduct = useCallback(async () => {
    try {
      const selected = await shopify.resourcePicker({
        type: "product",
        action: "select",
        filter: {
          variants: false,
          draft: false,
          archived: false,
        },
        multiple: false,
      });

      if (selected && selected.length > 0) {
        const product = selected[0];
        const variant = product.variants[0];

        handleUpdate({
          productId: product.id,
          productTitle: product.title,
          productImage: product.images[0]?.originalSrc || null,
          productPrice: parseFloat(variant.price),
          variantId: variant.id,
        });
      }
    } catch (error) {
      console.error("Product picker error:", error);
    }
  }, [shopify]);

  const handleRemoveProduct = useCallback(() => {
    handleUpdate({
      productId: null,
      productTitle: null,
      productImage: null,
      productPrice: null,
      variantId: null,
    });
  }, []);

  // Attach event listener to select product button
  useEffect(() => {
    const button = selectProductBtnRef.current;
    if (button) {
      button.addEventListener("click", handleSelectProduct);
      return () => {
        button.removeEventListener("click", handleSelectProduct);
      };
    }
  }, [handleSelectProduct]);

  // Attach event listener to remove product button
  useEffect(() => {
    const button = removeProductBtnRef.current;
    if (button) {
      button.addEventListener("click", handleRemoveProduct);
      return () => {
        button.removeEventListener("click", handleRemoveProduct);
      };
    }
  }, [handleRemoveProduct]);

  // Calculate discounted price
  const getDiscountedPrice = () => {
    if (!upsell.productPrice) return null;
    if (upsell.discountType === "none" || !upsell.discountValue) return upsell.productPrice;

    if (upsell.discountType === "fixed") {
      return Math.max(0, upsell.productPrice - upsell.discountValue);
    } else if (upsell.discountType === "percentage") {
      return upsell.productPrice * (1 - upsell.discountValue / 100);
    }
    return upsell.productPrice;
  };

  const discountedPrice = getDiscountedPrice();

  // Replace {product_name} in modal title for preview
  const getPreviewTitle = () => {
    return upsell.modalTitle.replace("{product_name}", upsell.productTitle || "Product Name");
  };

  return (
    <s-page heading={isNew ? "Create Upsell" : "Edit Upsell"}>
      <s-button
        ref={saveButtonRef}
        slot="primary-action"
        variant="primary"
        {...(isSaving ? { loading: true } : {})}
      >
        {isNew ? "Create Upsell" : "Save Changes"}
      </s-button>

      <s-button
        ref={cancelButtonRef}
        slot="secondary-action"
        variant="tertiary"
      >
        Cancel
      </s-button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        {/* Left Column - Configuration */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Basic Settings */}
          <s-section>
            <s-stack direction="block" gap="base">
              <s-heading>Basic Settings</s-heading>

              {/* Enable Toggle */}
              <s-stack direction="inline" gap="base" align="space-between">
                <input
                  type="checkbox"
                  checked={upsell.enabled}
                  onChange={(e) => handleUpdate({ enabled: e.target.checked })}
                  style={{ width: "20px", height: "20px" }}
                />
                <s-stack direction="block" gap="tight">
                  <s-text variant="heading-sm">Enable Upsell</s-text>
                  <s-text variant="body-sm" tone="subdued">
                    When enabled, this upsell will be shown to customers
                  </s-text>
                </s-stack>
              </s-stack>

              {/* Upsell Name */}
              <s-stack direction="block" gap="tight">
                <s-text variant="heading-sm">Upsell Name *</s-text>
                <input
                  type="text"
                  value={upsell.name}
                  onChange={(e) => handleUpdate({ name: e.target.value })}
                  placeholder="e.g., Holiday Special Upsell"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    border: "1px solid #d1d5db",
                    fontSize: "14px",
                  }}
                />
                <s-text variant="body-sm" tone="subdued">
                  This name is for your reference only
                </s-text>
              </s-stack>

              {/* Upsell Type */}
              <s-stack direction="block" gap="tight">
                <s-text variant="heading-sm">Upsell Type</s-text>
                <select
                  value={upsell.upsellType}
                  onChange={(e) => handleUpdate({ upsellType: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    border: "1px solid #d1d5db",
                    fontSize: "14px",
                  }}
                >
                  <option value="pre-purchase">Pre-purchase</option>
                  <option value="post-purchase">Post-purchase</option>
                </select>
              </s-stack>

              {/* Country targeting */}
              <CountryTargetingPicker
                countryTargeting={upsell.countryTargeting}
                targetCountries={upsell.targetCountries}
                onChange={handleUpdate}
                label="Show the upsell in:"
                offerNoun="upsell"
              />

            </s-stack>
          </s-section>

          {/* Product Selection */}
          <s-section>
            <s-stack direction="block" gap="base">
              <s-heading>Select Upsell Product</s-heading>
              <s-text tone="subdued">
                Choose the product you want to upsell to customers
              </s-text>

              {upsell.productId ? (
                <s-box padding="base" borderWidth="base" borderRadius="base">
                  <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                    {upsell.productImage && (
                      <img
                        src={upsell.productImage}
                        alt={upsell.productTitle}
                        style={{
                          width: "64px",
                          height: "64px",
                          objectFit: "cover",
                          borderRadius: "8px",
                          border: "1px solid #e5e7eb",
                        }}
                      />
                    )}
                    <div style={{ flex: 1 }}>
                      <s-text variant="heading-sm">{upsell.productTitle}</s-text>
                      <s-text tone="subdued">{currencySymbol}{upsell.productPrice?.toFixed(2)}</s-text>
                    </div>
                    <s-button ref={removeProductBtnRef} variant="tertiary">
                      Remove
                    </s-button>
                  </div>
                </s-box>
              ) : (
                <s-button ref={selectProductBtnRef}>
                  Select Product
                </s-button>
              )}
            </s-stack>
          </s-section>

          {/* Discount Settings */}
          <s-section>
            <s-stack direction="block" gap="base">
              <s-heading>Discount Settings</s-heading>
              <s-text tone="subdued">
                Optionally offer a discount on the upsell product
              </s-text>

              <s-stack direction="block" gap="tight">
                <s-text variant="heading-sm">Discount Type</s-text>
                <select
                  value={upsell.discountType}
                  onChange={(e) => handleUpdate({ discountType: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    border: "1px solid #d1d5db",
                    fontSize: "14px",
                  }}
                >
                  <option value="none">No discount</option>
                  <option value="fixed">Fixed value</option>
                  <option value="percentage">Percentage</option>
                </select>
              </s-stack>

              {upsell.discountType !== "none" && (
                <s-stack direction="block" gap="tight">
                  <s-text variant="heading-sm">
                    Discount Value {upsell.discountType === "percentage" ? "(%)" : `(${currencySymbol})`}
                  </s-text>
                  <input
                    type="number"
                    value={upsell.discountValue}
                    onChange={(e) => handleUpdate({ discountValue: parseFloat(e.target.value) || 0 })}
                    min="0"
                    max={upsell.discountType === "percentage" ? 100 : undefined}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "6px",
                      border: "1px solid #d1d5db",
                      fontSize: "14px",
                    }}
                  />
                </s-stack>
              )}

              {upsell.productPrice && upsell.discountType !== "none" && upsell.discountValue > 0 && (
                <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                  <s-text variant="body-sm">
                    Original:{" "}
                    <span style={{ textDecoration: "line-through" }}>
                      {currencySymbol}{upsell.productPrice.toFixed(2)}
                    </span>
                    {" → "}Discounted: <strong>{currencySymbol}{discountedPrice?.toFixed(2)}</strong>{" "}
                    (Save{" "}
                    {upsell.discountType === "percentage"
                      ? `${upsell.discountValue}%`
                      : `${currencySymbol}${upsell.discountValue}`}
                    )
                  </s-text>
                </s-box>
              )}
            </s-stack>
          </s-section>

          {/* Customization */}
          <s-section>
            <s-stack direction="block" gap="base">
              <s-heading>Customize Appearance</s-heading>

              {/* Modal Title */}
              <s-stack direction="block" gap="tight">
                <s-text variant="heading-sm">Modal Title</s-text>
                <input
                  type="text"
                  value={upsell.modalTitle}
                  onChange={(e) => handleUpdate({ modalTitle: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    border: "1px solid #d1d5db",
                    fontSize: "14px",
                  }}
                />
                <s-text variant="body-sm" tone="subdued">
                  Use {"{product_name}"} to insert the product name
                </s-text>
              </s-stack>

              {/* Accept Button */}
              <s-stack direction="block" gap="tight">
                <s-text variant="heading-sm">Accept Button Text</s-text>
                <input
                  type="text"
                  value={upsell.acceptButtonText}
                  onChange={(e) => handleUpdate({ acceptButtonText: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    border: "1px solid #d1d5db",
                    fontSize: "14px",
                  }}
                />
              </s-stack>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <s-stack direction="block" gap="tight">
                  <s-text variant="body-sm">Accept Button Background</s-text>
                  <input
                    type="color"
                    value={upsell.acceptButtonBgColor}
                    onChange={(e) => handleUpdate({ acceptButtonBgColor: e.target.value })}
                    style={{ width: "100%", height: "40px", padding: "4px", borderRadius: "4px" }}
                  />
                </s-stack>
                <s-stack direction="block" gap="tight">
                  <s-text variant="body-sm">Accept Button Text Color</s-text>
                  <input
                    type="color"
                    value={upsell.acceptButtonTextColor}
                    onChange={(e) => handleUpdate({ acceptButtonTextColor: e.target.value })}
                    style={{ width: "100%", height: "40px", padding: "4px", borderRadius: "4px" }}
                  />
                </s-stack>
              </div>

              {/* Decline Button */}
              <s-stack direction="block" gap="tight">
                <s-text variant="heading-sm">Decline Button Text</s-text>
                <input
                  type="text"
                  value={upsell.declineButtonText}
                  onChange={(e) => handleUpdate({ declineButtonText: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    border: "1px solid #d1d5db",
                    fontSize: "14px",
                  }}
                />
              </s-stack>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <s-stack direction="block" gap="tight">
                  <s-text variant="body-sm">Decline Button Background</s-text>
                  <input
                    type="color"
                    value={upsell.declineButtonBgColor}
                    onChange={(e) => handleUpdate({ declineButtonBgColor: e.target.value })}
                    style={{ width: "100%", height: "40px", padding: "4px", borderRadius: "4px" }}
                  />
                </s-stack>
                <s-stack direction="block" gap="tight">
                  <s-text variant="body-sm">Decline Button Text Color</s-text>
                  <input
                    type="color"
                    value={upsell.declineButtonTextColor}
                    onChange={(e) => handleUpdate({ declineButtonTextColor: e.target.value })}
                    style={{ width: "100%", height: "40px", padding: "4px", borderRadius: "4px" }}
                  />
                </s-stack>
              </div>
            </s-stack>
          </s-section>
        </div>

        {/* Right Column - Live Preview */}
        <div>
          <s-section>
            <s-stack direction="block" gap="base">
              <s-heading>Live Preview</s-heading>

              {!upsell.productId ? (
                <s-box padding="loose" borderWidth="base" borderRadius="base" background="subdued">
                  <div style={{ textAlign: "center", padding: "40px" }}>
                    <s-text tone="subdued">Select a product to see the preview</s-text>
                  </div>
                </s-box>
              ) : (
                <div
                  style={{
                    backgroundColor: "rgba(0, 0, 0, 0.5)",
                    borderRadius: "8px",
                    padding: "24px",
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  {/* Upsell Modal Preview */}
                  <div
                    style={{
                      backgroundColor: "#fff",
                      borderRadius: "12px",
                      padding: "24px",
                      maxWidth: "400px",
                      width: "100%",
                      textAlign: "center",
                    }}
                  >
                    {/* Title */}
                    <h2
                      style={{
                        fontSize: "20px",
                        fontWeight: "600",
                        marginBottom: "20px",
                        color: "#000",
                      }}
                    >
                      {getPreviewTitle()}
                    </h2>

                    {/* Product Image */}
                    {upsell.productImage && (
                      <img
                        src={upsell.productImage}
                        alt={upsell.productTitle}
                        style={{
                          width: "200px",
                          height: "200px",
                          objectFit: "contain",
                          marginBottom: "16px",
                        }}
                      />
                    )}

                    {/* Product Title */}
                    <p
                      style={{
                        fontSize: "16px",
                        fontWeight: "500",
                        marginBottom: "8px",
                        color: "#000",
                      }}
                    >
                      {upsell.productTitle}
                    </p>

                    {/* Price */}
                    <div style={{ marginBottom: "20px" }}>
                      {upsell.discountType !== "none" && upsell.discountValue > 0 ? (
                        <>
                          <span
                            style={{
                              textDecoration: "line-through",
                              color: "#6b7280",
                              marginRight: "8px",
                            }}
                          >
                            {currencySymbol}{upsell.productPrice?.toFixed(2)}
                          </span>
                          <span
                            style={{
                              fontSize: "20px",
                              fontWeight: "700",
                              color: "#000",
                            }}
                          >
                            {currencySymbol}{discountedPrice?.toFixed(2)}
                          </span>
                        </>
                      ) : (
                        <span
                          style={{
                            fontSize: "20px",
                            fontWeight: "700",
                            color: "#000",
                          }}
                        >
                          {currencySymbol}{upsell.productPrice?.toFixed(2)}
                        </span>
                      )}
                    </div>

                    {/* Accept Button */}
                    <button
                      style={{
                        width: "100%",
                        padding: "14px 20px",
                        borderRadius: "8px",
                        border: "none",
                        backgroundColor: upsell.acceptButtonBgColor,
                        color: upsell.acceptButtonTextColor,
                        fontSize: "16px",
                        fontWeight: "600",
                        cursor: "pointer",
                        marginBottom: "12px",
                      }}
                    >
                      {upsell.acceptButtonText}
                    </button>

                    {/* Decline Button */}
                    <button
                      style={{
                        width: "100%",
                        padding: "14px 20px",
                        borderRadius: "8px",
                        border: `1px solid ${upsell.declineButtonTextColor}`,
                        backgroundColor: upsell.declineButtonBgColor,
                        color: upsell.declineButtonTextColor,
                        fontSize: "16px",
                        fontWeight: "500",
                        cursor: "pointer",
                      }}
                    >
                      {upsell.declineButtonText}
                    </button>
                  </div>
                </div>
              )}
            </s-stack>
          </s-section>
        </div>
      </div>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
