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
import { getCurrencyCode } from "../lib/constants";
import { syncStorefrontConfigByDomain } from "../lib/storefront-config.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  const url = new URL(request.url);
  const duplicateId = url.searchParams.get("duplicate");

  // If editing existing upsell
  if (params.id !== "new") {
    const upsell = await getUpsellById(params.id);
    if (!upsell || upsell.shopId !== shop.id) {
      throw new Response("Upsell not found", { status: 404 });
    }
    return { upsell, isNew: false, shopId: shop.id, shopCurrency: getCurrencyCode(shop.country) };
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
      return { upsell: duplicatedUpsell, isNew: true, shopId: shop.id, shopCurrency: getCurrencyCode(shop.country) };
    }
  }

  // New upsell with defaults
  const defaultUpsell = getDefaultUpsell("one-tick");

  return { upsell: defaultUpsell, isNew: true, shopId: shop.id, shopCurrency: getCurrencyCode(shop.country) };
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

export default function OneTickUpsellEditor() {
  const { upsell: initialUpsell, isNew, shopCurrency } = useLoaderData();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const [upsell, setUpsell] = useState(initialUpsell);
  const [connectToProduct, setConnectToProduct] = useState(!!initialUpsell.productId);

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
      navigate("/app/sales-booster/one-tick");
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
    if (!upsell.upsellTitle?.trim()) {
      shopify.toast.show("Please enter an upsell title", { isError: true });
      return;
    }

    fetcher.submit(upsell, {
      method: "POST",
      encType: "application/json",
    });
  }, [upsell, fetcher, shopify]);

  const handleCancel = useCallback(() => {
    navigate("/app/sales-booster/one-tick");
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
  }, [handleSelectProduct, connectToProduct, upsell.productId]);

  // Attach event listener to remove product button
  useEffect(() => {
    const button = removeProductBtnRef.current;
    if (button) {
      button.addEventListener("click", handleRemoveProduct);
      return () => {
        button.removeEventListener("click", handleRemoveProduct);
      };
    }
  }, [handleRemoveProduct, connectToProduct, upsell.productId]);

  // Replace {title} and {price} in checkbox text for preview
  const getPreviewCheckboxText = () => {
    return upsell.checkboxText
      .replace("{title}", upsell.upsellTitle || "Your Offer Name")
      .replace("{price}", `${shopCurrency} ${upsell.upsellPrice?.toFixed(2) || "0.00"}`);
  };

  return (
    <s-page heading={isNew ? "Create One-Tick Upsell" : "Edit One-Tick Upsell"}>
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
          {/* 1. Configure the upsell */}
          <s-section>
            <s-stack direction="block" gap="base">
              <s-text variant="heading-md">1. Configure the upsell</s-text>

              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="base">
                  {/* Upsell Name */}
                  <s-stack direction="block" gap="tight">
                    <s-text variant="heading-sm">Upsell name</s-text>
                    <input
                      type="text"
                      value={upsell.name}
                      onChange={(e) => handleUpdate({ name: e.target.value })}
                      placeholder="New upsell"
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "6px",
                        border: "1px solid #d1d5db",
                        fontSize: "14px",
                        boxSizing: "border-box",
                      }}
                    />
                  </s-stack>

                  {/* Show the upsell for */}
                  <s-stack direction="block" gap="tight">
                    <s-text variant="heading-sm">Show the upsell for:</s-text>
                    <s-text variant="body-md">All products</s-text>
                  </s-stack>
                </s-stack>
              </s-box>
            </s-stack>
          </s-section>

          {/* 2. Customize the upsell */}
          <s-section>
            <s-stack direction="block" gap="base">
              <s-text variant="heading-md">2. Customize the upsell</s-text>

              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="base">
                  {/* Upsell Title and Price */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "12px" }}>
                    <s-stack direction="block" gap="tight">
                      <s-text variant="body-sm">Upsell title</s-text>
                      <input
                        type="text"
                        value={upsell.upsellTitle || ""}
                        onChange={(e) => handleUpdate({ upsellTitle: e.target.value })}
                        placeholder="Your Offer Name"
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "6px",
                          border: "1px solid #d1d5db",
                          fontSize: "14px",
                          boxSizing: "border-box",
                        }}
                      />
                    </s-stack>
                    <s-stack direction="block" gap="tight">
                      <s-text variant="body-sm">Upsell price</s-text>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "14px", fontWeight: "500" }}>{shopCurrency}</span>
                        <input
                          type="number"
                          value={upsell.upsellPrice || ""}
                          onChange={(e) => handleUpdate({ upsellPrice: parseFloat(e.target.value) || 0 })}
                          placeholder="1.99"
                          step="0.01"
                          min="0"
                          style={{
                            width: "100px",
                            padding: "10px 12px",
                            borderRadius: "6px",
                            border: "1px solid #d1d5db",
                            fontSize: "14px",
                          }}
                        />
                      </div>
                    </s-stack>
                  </div>

                  {/* Checkbox Text */}
                  <s-stack direction="block" gap="tight">
                    <s-text variant="body-sm">Checkbox text</s-text>
                    <input
                      type="text"
                      value={upsell.checkboxText || ""}
                      onChange={(e) => handleUpdate({ checkboxText: e.target.value })}
                      placeholder="Add {title} for just {price}"
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "6px",
                        border: "1px solid #d1d5db",
                        fontSize: "14px",
                        boxSizing: "border-box",
                      }}
                    />
                    <s-text variant="body-sm" tone="subdued">
                      Use {"{title}"} and {"{price}"} to insert the upsell title and price inside this text.
                    </s-text>
                  </s-stack>

                  {/* Description Text */}
                  <s-stack direction="block" gap="tight">
                    <s-text variant="body-sm">Description text</s-text>
                    <textarea
                      value={upsell.descriptionText || ""}
                      onChange={(e) => handleUpdate({ descriptionText: e.target.value })}
                      placeholder=""
                      rows="3"
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "6px",
                        border: "1px solid #d1d5db",
                        fontSize: "14px",
                        fontFamily: "inherit",
                        resize: "vertical",
                        boxSizing: "border-box",
                      }}
                    />
                  </s-stack>

                  {/* Text and Description Colors */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <s-stack direction="block" gap="tight">
                      <s-text variant="body-sm">Text color</s-text>
                      <input
                        type="color"
                        value={upsell.textColor?.startsWith("rgba") ? "#000000" : upsell.textColor || "#000000"}
                        onChange={(e) => handleUpdate({ textColor: e.target.value })}
                        style={{ width: "100%", height: "40px", padding: "4px", borderRadius: "4px" }}
                      />
                    </s-stack>
                    <s-stack direction="block" gap="tight">
                      <s-text variant="body-sm">Description color</s-text>
                      <input
                        type="color"
                        value={upsell.descriptionColor?.startsWith("rgba") ? "#595959" : upsell.descriptionColor || "#595959"}
                        onChange={(e) => handleUpdate({ descriptionColor: e.target.value })}
                        style={{ width: "100%", height: "40px", padding: "4px", borderRadius: "4px" }}
                      />
                    </s-stack>
                  </div>

                  {/* Connect to Product */}
                  <s-stack direction="block" gap="tight">
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={connectToProduct}
                        onChange={(e) => {
                          setConnectToProduct(e.target.checked);
                          if (!e.target.checked) {
                            handleUpdate({
                              productId: null,
                              productTitle: null,
                              productImage: null,
                              productPrice: null,
                              variantId: null,
                            });
                          }
                        }}
                        style={{ width: "18px", height: "18px" }}
                      />
                      <s-text variant="body-sm" style={{ fontWeight: "500" }}>
                        Connect the upsell to a product in your store
                      </s-text>
                    </label>
                    <s-text variant="body-sm" tone="subdued">
                      The product will be added to your orders if the upsell is selected by the customer.
                    </s-text>

                    {connectToProduct && (
                      <div style={{ marginTop: "8px" }}>
                        {upsell.productId ? (
                          <s-box padding="base" borderWidth="base" borderRadius="base">
                            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                              {upsell.productImage && (
                                <img
                                  src={upsell.productImage}
                                  alt={upsell.productTitle}
                                  style={{
                                    width: "48px",
                                    height: "48px",
                                    objectFit: "cover",
                                    borderRadius: "6px",
                                    border: "1px solid #e5e7eb",
                                  }}
                                />
                              )}
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: "500", fontSize: "14px" }}>{upsell.productTitle}</div>
                                <div style={{ fontSize: "13px", color: "#6b7280" }}>{shopCurrency} {upsell.productPrice?.toFixed(2)}</div>
                              </div>
                              <s-button
                                ref={removeProductBtnRef}
                                variant="tertiary"
                              >
                                Remove
                              </s-button>
                            </div>
                          </s-box>
                        ) : (
                          <s-button ref={selectProductBtnRef}>
                            Select product
                          </s-button>
                        )}
                      </div>
                    )}
                  </s-stack>

                  {/* Preselect Upsell */}
                  <s-stack direction="block" gap="tight">
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={upsell.preselectUpsell || false}
                        onChange={(e) => handleUpdate({ preselectUpsell: e.target.checked })}
                        style={{ width: "18px", height: "18px" }}
                      />
                      <s-text variant="body-sm">Preselect the upsell</s-text>
                    </label>
                  </s-stack>

                  {/* Background Color */}
                  <s-stack direction="block" gap="tight">
                    <s-text variant="body-sm">Background color</s-text>
                    <input
                      type="color"
                      value={upsell.backgroundColor?.startsWith("rgba") ? "#d9ebf6" : upsell.backgroundColor || "#d9ebf6"}
                      onChange={(e) => handleUpdate({ backgroundColor: e.target.value })}
                      style={{ width: "100%", height: "40px", padding: "4px", borderRadius: "4px" }}
                    />
                  </s-stack>

                  {/* Border Style and Color */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <s-stack direction="block" gap="tight">
                      <s-text variant="body-sm">Border style</s-text>
                      <select
                        value={upsell.borderStyle || "solid"}
                        onChange={(e) => handleUpdate({ borderStyle: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "6px",
                          border: "1px solid #d1d5db",
                          fontSize: "14px",
                        }}
                      >
                        <option value="solid">Solid</option>
                        <option value="dashed">Dashed</option>
                        <option value="dotted">Dotted</option>
                      </select>
                    </s-stack>
                    <s-stack direction="block" gap="tight">
                      <s-text variant="body-sm">Border color</s-text>
                      <input
                        type="color"
                        value={upsell.borderColor?.startsWith("rgba") ? "#0074bf" : upsell.borderColor || "#0074bf"}
                        onChange={(e) => handleUpdate({ borderColor: e.target.value })}
                        style={{ width: "100%", height: "40px", padding: "4px", borderRadius: "4px" }}
                      />
                    </s-stack>
                  </div>

                  {/* Border Width */}
                  <s-stack direction="block" gap="tight">
                    <s-text variant="body-sm">Border width</s-text>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={upsell.borderWidth || 2}
                      onChange={(e) => handleUpdate({ borderWidth: parseInt(e.target.value) })}
                      style={{ width: "100%" }}
                    />
                    <s-text variant="body-sm" tone="subdued">{upsell.borderWidth || 2}px</s-text>
                  </s-stack>

                  {/* Border Radius */}
                  <s-stack direction="block" gap="tight">
                    <s-text variant="body-sm">Border radius</s-text>
                    <input
                      type="range"
                      min="0"
                      max="20"
                      value={upsell.borderRadius || 8}
                      onChange={(e) => handleUpdate({ borderRadius: parseInt(e.target.value) })}
                      style={{ width: "100%" }}
                    />
                    <s-text variant="body-sm" tone="subdued">{upsell.borderRadius || 8}px</s-text>
                  </s-stack>
                </s-stack>
              </s-box>
            </s-stack>
          </s-section>
        </div>

        {/* Right Column - Live Preview */}
        <div>
          <s-section>
            <s-stack direction="block" gap="base">
              <s-text variant="heading-md">Live preview:</s-text>

              {/* COD Form Preview */}
              <div
                style={{
                  backgroundColor: "#f3f4f6",
                  borderRadius: "8px",
                  padding: "24px",
                }}
              >
                {/* Form Preview Container */}
                <div
                  style={{
                    backgroundColor: "#fff",
                    borderRadius: "8px",
                    padding: "20px",
                    maxWidth: "400px",
                    margin: "0 auto",
                  }}
                >
                  {/* Form Title */}
                  <h2
                    style={{
                      fontSize: "18px",
                      fontWeight: "700",
                      marginBottom: "16px",
                      textAlign: "center",
                      letterSpacing: "0.5px",
                    }}
                  >
                    CASH ON DELIVERY
                  </h2>

                  {/* Form Fields (placeholder) */}
                  <div style={{ marginBottom: "16px" }}>
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        style={{
                          height: "40px",
                          backgroundColor: "#f9fafb",
                          borderRadius: "6px",
                          marginBottom: "12px",
                          border: "1px solid #e5e7eb",
                        }}
                      />
                    ))}
                  </div>

                  {/* One-Tick Upsell Preview */}
                  <div
                    style={{
                      backgroundColor: upsell.backgroundColor || "#d9ebf6",
                      border: `${upsell.borderWidth || 2}px ${upsell.borderStyle || "solid"} ${upsell.borderColor || "#0074bf"}`,
                      borderRadius: `${upsell.borderRadius || 8}px`,
                      padding: "16px",
                      marginBottom: "16px",
                    }}
                  >
                    <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={upsell.preselectUpsell || false}
                        readOnly
                        style={{
                          width: "18px",
                          height: "18px",
                          marginTop: "2px",
                          cursor: "pointer",
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: "14px",
                            fontWeight: "500",
                            color: upsell.textColor || "#000000",
                            marginBottom: upsell.descriptionText ? "4px" : "0",
                          }}
                        >
                          {getPreviewCheckboxText()}
                        </div>
                        {upsell.descriptionText && (
                          <div
                            style={{
                              fontSize: "13px",
                              color: upsell.descriptionColor || "#595959",
                            }}
                          >
                            {upsell.descriptionText}
                          </div>
                        )}
                      </div>
                    </label>
                  </div>

                  {/* Complete Order Button (placeholder) */}
                  <div
                    style={{
                      backgroundColor: "#000",
                      color: "#fff",
                      padding: "14px",
                      borderRadius: "6px",
                      textAlign: "center",
                      fontWeight: "600",
                      fontSize: "14px",
                    }}
                  >
                    COMPLETE ORDER - {shopCurrency} 751.94
                  </div>
                </div>
              </div>
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
