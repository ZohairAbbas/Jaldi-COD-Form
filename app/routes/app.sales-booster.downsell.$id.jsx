import { useState, useEffect, useRef, useCallback } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  getOrCreateShop,
  getDownsellById,
  createDownsell,
  updateDownsell,
  getDefaultDownsell,
} from "../lib/db.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  const url = new URL(request.url);
  const duplicateId = url.searchParams.get("duplicate");

  // If editing existing downsell
  if (params.id !== "new") {
    const downsell = await getDownsellById(params.id);
    if (!downsell || downsell.shopId !== shop.id) {
      throw new Response("Downsell not found", { status: 404 });
    }
    return { downsell, isNew: false, shopId: shop.id };
  }

  // If duplicating
  if (duplicateId) {
    const sourceDownsell = await getDownsellById(duplicateId);
    if (sourceDownsell && sourceDownsell.shopId === shop.id) {
      const duplicatedDownsell = {
        ...sourceDownsell,
        id: null,
        name: `${sourceDownsell.name} (Copy)`,
        enabled: false,
      };
      return { downsell: duplicatedDownsell, isNew: true, shopId: shop.id };
    }
  }

  // New downsell with defaults
  const defaultDownsell = getDefaultDownsell();
  return { downsell: defaultDownsell, isNew: true, shopId: shop.id };
};

export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  const downsellData = await request.json();

  // Remove fields that shouldn't be saved
  delete downsellData.id;
  delete downsellData.shopId;
  delete downsellData.createdAt;
  delete downsellData.updatedAt;
  delete downsellData.impressions;
  delete downsellData.accepts;
  delete downsellData.declines;

  if (params.id === "new") {
    // Create new downsell
    const newDownsell = await createDownsell(shop.id, downsellData);
    return Response.json({ success: true, downsell: newDownsell });
  } else {
    // Update existing downsell
    const existingDownsell = await getDownsellById(params.id);
    if (!existingDownsell || existingDownsell.shopId !== shop.id) {
      return Response.json({ error: "Downsell not found" }, { status: 404 });
    }

    const updatedDownsell = await updateDownsell(params.id, downsellData);
    return Response.json({ success: true, downsell: updatedDownsell });
  }
};

export default function DownsellEditor() {
  const { downsell: initialDownsell, isNew } = useLoaderData();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const [downsell, setDownsell] = useState(initialDownsell);

  // Refs for s-button elements
  const saveButtonRef = useRef(null);
  const cancelButtonRef = useRef(null);

  const isSaving = fetcher.state === "submitting";

  // Handle successful save
  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(isNew ? "Downsell created successfully!" : "Downsell saved successfully!");
      navigate("/app/sales-booster/downsell");
    } else if (fetcher.data?.error) {
      shopify.toast.show("Error saving downsell", { isError: true });
    }
  }, [fetcher.data, isNew, navigate, shopify]);

  const handleUpdate = (updates) => {
    setDownsell((prev) => ({ ...prev, ...updates }));
  };

  const handleSave = useCallback(() => {
    // Validation
    if (!downsell.name?.trim()) {
      shopify.toast.show("Please enter a downsell name", { isError: true });
      return;
    }

    fetcher.submit(downsell, {
      method: "POST",
      encType: "application/json",
    });
  }, [downsell, fetcher, shopify]);

  const handleCancel = useCallback(() => {
    navigate("/app/sales-booster/downsell");
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

  // Calculate discount display text
  const getDiscountDisplay = () => {
    if (downsell.discountType === "percentage") {
      return `${downsell.discountValue}%`;
    }
    return `Rs.${downsell.discountValue}`;
  };

  // Replace {discount} in button text for preview
  const getPreviewButtonText = () => {
    return downsell.acceptButtonText.replace("{discount}", getDiscountDisplay());
  };

  return (
    <s-page heading={isNew ? "Downsells - New downsell" : "Downsells - Edit downsell"}>
      {/* Enable toggle in header area */}
      <div slot="secondary-action" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <button
          type="button"
          onClick={() => handleUpdate({ enabled: !downsell.enabled })}
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
        <span style={{
          padding: "4px 12px",
          borderRadius: "16px",
          backgroundColor: downsell.enabled ? "#d1fae5" : "#f3f4f6",
          color: downsell.enabled ? "#059669" : "#6b7280",
          fontSize: "13px",
          fontWeight: "500",
        }}>
          {downsell.enabled ? "Active" : "Inactive"}
        </span>
        <s-button ref={cancelButtonRef} variant="tertiary">
          ← Back
        </s-button>
      </div>

      <s-button
        ref={saveButtonRef}
        slot="primary-action"
        variant="primary"
        {...(isSaving ? { loading: true } : {})}
      >
        {isNew ? "Create Downsell" : "Save Changes"}
      </s-button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        {/* Left Column - Configuration */}
        <div>
          {/* Section 1: Configure the downsell */}
          <s-section>
            <s-stack direction="block" gap="base">
              <s-text variant="heading-md">1. Configure the downsell</s-text>

              {/* Downsell Name */}
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="tight">
                  <s-text variant="heading-sm">Downsell name</s-text>
                  <input
                    type="text"
                    value={downsell.name}
                    onChange={(e) => handleUpdate({ name: e.target.value })}
                    placeholder="New downsell"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "6px",
                      border: "1px solid #d1d5db",
                      fontSize: "14px",
                    }}
                  />
                </s-stack>
              </s-box>

              {/* Show downsell for - All products for now */}
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="tight">
                  <s-text variant="heading-sm">Show the downsell for:</s-text>
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
                      style={{
                        padding: "12px 16px",
                        border: "none",
                        borderRight: "1px solid #e5e7eb",
                        backgroundColor: "#f3f4f6",
                        cursor: "pointer",
                        fontSize: "14px",
                        fontWeight: "600",
                        color: "#111827",
                      }}
                    >
                      All products
                    </button>
                    <button
                      type="button"
                      disabled
                      style={{
                        padding: "12px 16px",
                        border: "none",
                        backgroundColor: "#ffffff",
                        cursor: "not-allowed",
                        fontSize: "14px",
                        fontWeight: "400",
                        color: "#9ca3af",
                      }}
                    >
                      Specific products
                    </button>
                  </div>
                </s-stack>
              </s-box>

              {/* Show count */}
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <s-text variant="body-md">The downsell will be shown when the customer closes the form:</s-text>
                  <select
                    value={downsell.showCount}
                    onChange={(e) => handleUpdate({ showCount: parseInt(e.target.value) })}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #d1d5db",
                      fontSize: "14px",
                      minWidth: "100px",
                    }}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n} time{n > 1 ? "s" : ""}</option>
                    ))}
                  </select>
                </div>
              </s-box>

              {/* Discount settings */}
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="base">
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span>⚙️</span>
                    <s-text variant="heading-sm">Offer this discount to your customers:</s-text>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <s-stack direction="block" gap="tight">
                      <s-text variant="body-sm">Discount type:</s-text>
                      <select
                        value={downsell.discountType}
                        onChange={(e) => handleUpdate({ discountType: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "6px",
                          border: "1px solid #d1d5db",
                          fontSize: "14px",
                        }}
                      >
                        <option value="percentage">Percentage</option>
                        <option value="fixed">Fixed</option>
                      </select>
                    </s-stack>

                    <s-stack direction="block" gap="tight">
                      <s-text variant="body-sm">Discount value</s-text>
                      <input
                        type="number"
                        value={downsell.discountValue}
                        onChange={(e) => handleUpdate({ discountValue: parseFloat(e.target.value) || 0 })}
                        min="0"
                        max={downsell.discountType === "percentage" ? 100 : undefined}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "6px",
                          border: "1px solid #d1d5db",
                          fontSize: "14px",
                        }}
                      />
                    </s-stack>
                  </div>

                  {/* Disable other discounts checkbox */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <input
                      type="checkbox"
                      checked={downsell.disableOtherDiscounts}
                      onChange={(e) => handleUpdate({ disableOtherDiscounts: e.target.checked })}
                      style={{ width: "18px", height: "18px", marginTop: "2px" }}
                    />
                    <div>
                      <s-text variant="body-sm">Disable other discounts codes on the form if this downsell is accepted by the customer</s-text>
                      <s-text variant="body-sm" tone="subdued" style={{ fontStyle: "italic" }}>
                        If this option is active, this downsell will not be offered if the order already has other discounts
                      </s-text>
                    </div>
                  </div>
                </s-stack>
              </s-box>
            </s-stack>
          </s-section>

          {/* Section 2: Customize the downsell */}
          <s-section>
            <s-stack direction="block" gap="base">
              <s-text variant="heading-md">2. Customize the downsell</s-text>

              {/* Title Section */}
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="base">
                  <s-stack direction="block" gap="tight">
                    <s-text variant="heading-sm">Title</s-text>
                    <input
                      type="text"
                      value={downsell.title}
                      onChange={(e) => handleUpdate({ title: e.target.value })}
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
                      <s-text variant="body-sm">Title color</s-text>
                      <input
                        type="text"
                        value={downsell.titleColor}
                        onChange={(e) => handleUpdate({ titleColor: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "6px",
                          border: "1px solid #d1d5db",
                          fontSize: "14px",
                        }}
                      />
                    </s-stack>
                    <s-stack direction="block" gap="tight">
                      <s-text variant="body-sm">Font size</s-text>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <input
                          type="number"
                          value={downsell.titleFontSize}
                          onChange={(e) => handleUpdate({ titleFontSize: parseInt(e.target.value) || 13 })}
                          min="8"
                          max="48"
                          style={{
                            width: "80px",
                            padding: "10px 12px",
                            borderRadius: "6px",
                            border: "1px solid #d1d5db",
                            fontSize: "14px",
                          }}
                        />
                        <span>px</span>
                      </div>
                    </s-stack>
                  </div>
                </s-stack>
              </s-box>

              {/* Subtitle Section */}
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="base">
                  <s-stack direction="block" gap="tight">
                    <s-text variant="heading-sm">Subtitle</s-text>
                    <input
                      type="text"
                      value={downsell.subtitle}
                      onChange={(e) => handleUpdate({ subtitle: e.target.value })}
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
                      <s-text variant="body-sm">Subtitle color</s-text>
                      <input
                        type="text"
                        value={downsell.subtitleColor}
                        onChange={(e) => handleUpdate({ subtitleColor: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "6px",
                          border: "1px solid #d1d5db",
                          fontSize: "14px",
                        }}
                      />
                    </s-stack>
                    <s-stack direction="block" gap="tight">
                      <s-text variant="body-sm">Font size</s-text>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <input
                          type="number"
                          value={downsell.subtitleFontSize}
                          onChange={(e) => handleUpdate({ subtitleFontSize: parseInt(e.target.value) || 13 })}
                          min="8"
                          max="48"
                          style={{
                            width: "80px",
                            padding: "10px 12px",
                            borderRadius: "6px",
                            border: "1px solid #d1d5db",
                            fontSize: "14px",
                          }}
                        />
                        <span>px</span>
                      </div>
                    </s-stack>
                  </div>
                </s-stack>
              </s-box>

              {/* Discount Plaque Section */}
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="base">
                  <s-text variant="heading-sm">Discount plaque</s-text>

                  <s-stack direction="block" gap="tight">
                    <s-text variant="body-sm">Text</s-text>
                    <input
                      type="text"
                      value={downsell.plaqueText}
                      onChange={(e) => handleUpdate({ plaqueText: e.target.value })}
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
                      <s-text variant="body-sm">Text color</s-text>
                      <input
                        type="text"
                        value={downsell.plaqueTextColor}
                        onChange={(e) => handleUpdate({ plaqueTextColor: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "6px",
                          border: "1px solid #d1d5db",
                          fontSize: "14px",
                        }}
                      />
                    </s-stack>
                    <s-stack direction="block" gap="tight">
                      <s-text variant="body-sm">Background color</s-text>
                      <input
                        type="text"
                        value={downsell.plaqueBackgroundColor}
                        onChange={(e) => handleUpdate({ plaqueBackgroundColor: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "6px",
                          border: "1px solid #d1d5db",
                          fontSize: "14px",
                        }}
                      />
                    </s-stack>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <s-stack direction="block" gap="tight">
                      <s-text variant="body-sm">Discount color</s-text>
                      <input
                        type="text"
                        value={downsell.plaqueDiscountColor}
                        onChange={(e) => handleUpdate({ plaqueDiscountColor: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "6px",
                          border: "1px solid #d1d5db",
                          fontSize: "14px",
                        }}
                      />
                    </s-stack>
                    <s-stack direction="block" gap="tight">
                      <s-text variant="body-sm">Plaque size</s-text>
                      <input
                        type="range"
                        value={downsell.plaqueSize}
                        onChange={(e) => handleUpdate({ plaqueSize: parseInt(e.target.value) })}
                        min="30"
                        max="100"
                        style={{ width: "100%" }}
                      />
                    </s-stack>
                  </div>
                </s-stack>
              </s-box>

              {/* CTA Text Section */}
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="base">
                  <s-stack direction="block" gap="tight">
                    <s-text variant="body-sm">Text</s-text>
                    <input
                      type="text"
                      value={downsell.ctaText}
                      onChange={(e) => handleUpdate({ ctaText: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "6px",
                        border: "1px solid #d1d5db",
                        fontSize: "14px",
                      }}
                    />
                  </s-stack>

                  <s-stack direction="block" gap="tight">
                    <s-text variant="body-sm">Text color</s-text>
                    <input
                      type="text"
                      value={downsell.ctaTextColor}
                      onChange={(e) => handleUpdate({ ctaTextColor: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "6px",
                        border: "1px solid #d1d5db",
                        fontSize: "14px",
                      }}
                    />
                  </s-stack>
                </s-stack>
              </s-box>

              {/* Complete Order Button Section */}
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="base">
                  <s-text variant="heading-sm">Complete order button</s-text>

                  <s-stack direction="block" gap="tight">
                    <s-text variant="body-sm">Button text</s-text>
                    <input
                      type="text"
                      value={downsell.acceptButtonText}
                      onChange={(e) => handleUpdate({ acceptButtonText: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "6px",
                        border: "1px solid #d1d5db",
                        fontSize: "14px",
                      }}
                    />
                    <s-text variant="body-sm" tone="subdued">
                      Use {"{discount}"} to insert the discount value inside this text field.
                    </s-text>
                  </s-stack>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <s-stack direction="block" gap="tight">
                      <s-text variant="body-sm">Button animation</s-text>
                      <select
                        value={downsell.acceptButtonAnimation}
                        onChange={(e) => handleUpdate({ acceptButtonAnimation: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "6px",
                          border: "1px solid #d1d5db",
                          fontSize: "14px",
                        }}
                      >
                        <option value="none">None</option>
                        <option value="pulse">Pulse</option>
                        <option value="shake">Shake</option>
                        <option value="bounce">Bounce</option>
                      </select>
                    </s-stack>
                    <s-stack direction="block" gap="tight">
                      <s-text variant="body-sm">Button icon</s-text>
                      <select
                        value={downsell.acceptButtonIcon}
                        onChange={(e) => handleUpdate({ acceptButtonIcon: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "6px",
                          border: "1px solid #d1d5db",
                          fontSize: "14px",
                        }}
                      >
                        <option value="none">None</option>
                        <option value="cart">Cart</option>
                        <option value="check">Check</option>
                        <option value="tag">Tag</option>
                      </select>
                    </s-stack>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <s-stack direction="block" gap="tight">
                      <s-text variant="body-sm">Background color</s-text>
                      <input
                        type="text"
                        value={downsell.acceptButtonBgColor}
                        onChange={(e) => handleUpdate({ acceptButtonBgColor: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "6px",
                          border: "1px solid #d1d5db",
                          fontSize: "14px",
                        }}
                      />
                    </s-stack>
                    <s-stack direction="block" gap="tight">
                      <s-text variant="body-sm">Text color</s-text>
                      <input
                        type="text"
                        value={downsell.acceptButtonTextColor}
                        onChange={(e) => handleUpdate({ acceptButtonTextColor: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "6px",
                          border: "1px solid #d1d5db",
                          fontSize: "14px",
                        }}
                      />
                    </s-stack>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <s-stack direction="block" gap="tight">
                      <s-text variant="body-sm">Font size</s-text>
                      <input
                        type="range"
                        value={downsell.acceptButtonFontSize}
                        onChange={(e) => handleUpdate({ acceptButtonFontSize: parseInt(e.target.value) })}
                        min="10"
                        max="24"
                        style={{ width: "100%" }}
                      />
                    </s-stack>
                    <s-stack direction="block" gap="tight">
                      <s-text variant="body-sm">Border radius</s-text>
                      <input
                        type="range"
                        value={downsell.acceptButtonRadius}
                        onChange={(e) => handleUpdate({ acceptButtonRadius: parseInt(e.target.value) })}
                        min="0"
                        max="50"
                        style={{ width: "100%" }}
                      />
                    </s-stack>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <s-stack direction="block" gap="tight">
                      <s-text variant="body-sm">Border width</s-text>
                      <input
                        type="range"
                        value={downsell.acceptButtonBorderWidth}
                        onChange={(e) => handleUpdate({ acceptButtonBorderWidth: parseInt(e.target.value) })}
                        min="0"
                        max="5"
                        style={{ width: "100%" }}
                      />
                    </s-stack>
                    <s-stack direction="block" gap="tight">
                      <s-text variant="body-sm">Border color</s-text>
                      <input
                        type="text"
                        value={downsell.acceptButtonBorderColor}
                        onChange={(e) => handleUpdate({ acceptButtonBorderColor: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "6px",
                          border: "1px solid #d1d5db",
                          fontSize: "14px",
                        }}
                      />
                    </s-stack>
                  </div>

                  <s-stack direction="block" gap="tight">
                    <s-text variant="body-sm">Shadow</s-text>
                    <input
                      type="range"
                      value={downsell.acceptButtonShadow}
                      onChange={(e) => handleUpdate({ acceptButtonShadow: parseInt(e.target.value) })}
                      min="0"
                      max="20"
                      style={{ width: "100%" }}
                    />
                  </s-stack>
                </s-stack>
              </s-box>

              {/* No Thank You Button Section */}
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="base">
                  <s-text variant="heading-sm">No thank you button</s-text>

                  <s-stack direction="block" gap="tight">
                    <s-text variant="body-sm">Button text</s-text>
                    <input
                      type="text"
                      value={downsell.declineButtonText}
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
                      <s-text variant="body-sm">Background color</s-text>
                      <input
                        type="text"
                        value={downsell.declineButtonBgColor}
                        onChange={(e) => handleUpdate({ declineButtonBgColor: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "6px",
                          border: "1px solid #d1d5db",
                          fontSize: "14px",
                        }}
                      />
                    </s-stack>
                    <s-stack direction="block" gap="tight">
                      <s-text variant="body-sm">Text color</s-text>
                      <input
                        type="text"
                        value={downsell.declineButtonTextColor}
                        onChange={(e) => handleUpdate({ declineButtonTextColor: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "6px",
                          border: "1px solid #d1d5db",
                          fontSize: "14px",
                        }}
                      />
                    </s-stack>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <s-stack direction="block" gap="tight">
                      <s-text variant="body-sm">Font size</s-text>
                      <input
                        type="range"
                        value={downsell.declineButtonFontSize}
                        onChange={(e) => handleUpdate({ declineButtonFontSize: parseInt(e.target.value) })}
                        min="10"
                        max="24"
                        style={{ width: "100%" }}
                      />
                    </s-stack>
                    <s-stack direction="block" gap="tight">
                      <s-text variant="body-sm">Border radius</s-text>
                      <input
                        type="range"
                        value={downsell.declineButtonRadius}
                        onChange={(e) => handleUpdate({ declineButtonRadius: parseInt(e.target.value) })}
                        min="0"
                        max="50"
                        style={{ width: "100%" }}
                      />
                    </s-stack>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <s-stack direction="block" gap="tight">
                      <s-text variant="body-sm">Border width</s-text>
                      <input
                        type="range"
                        value={downsell.declineButtonBorderWidth}
                        onChange={(e) => handleUpdate({ declineButtonBorderWidth: parseInt(e.target.value) })}
                        min="0"
                        max="5"
                        style={{ width: "100%" }}
                      />
                    </s-stack>
                    <s-stack direction="block" gap="tight">
                      <s-text variant="body-sm">Border color</s-text>
                      <input
                        type="text"
                        value={downsell.declineButtonBorderColor}
                        onChange={(e) => handleUpdate({ declineButtonBorderColor: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: "6px",
                          border: "1px solid #d1d5db",
                          fontSize: "14px",
                        }}
                      />
                    </s-stack>
                  </div>

                  <s-stack direction="block" gap="tight">
                    <s-text variant="body-sm">Shadow</s-text>
                    <input
                      type="range"
                      value={downsell.declineButtonShadow}
                      onChange={(e) => handleUpdate({ declineButtonShadow: parseInt(e.target.value) })}
                      min="0"
                      max="20"
                      style={{ width: "100%" }}
                    />
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

              {/* Dark modal background */}
              <div
                style={{
                  backgroundColor: "#374151",
                  borderRadius: "12px",
                  padding: "32px",
                  display: "flex",
                  justifyContent: "center",
                  minHeight: "500px",
                  alignItems: "center",
                }}
              >
                {/* Downsell Modal Preview */}
                <div
                  style={{
                    backgroundColor: "#fff",
                    borderRadius: "12px",
                    padding: "32px",
                    maxWidth: "360px",
                    width: "100%",
                    textAlign: "center",
                  }}
                >
                  {/* Title */}
                  <h2
                    style={{
                      fontSize: `${downsell.titleFontSize}px`,
                      fontWeight: "600",
                      marginBottom: "8px",
                      color: downsell.titleColor,
                    }}
                  >
                    {downsell.title}
                  </h2>

                  {/* Subtitle */}
                  <p
                    style={{
                      fontSize: `${downsell.subtitleFontSize}px`,
                      marginBottom: "24px",
                      color: downsell.subtitleColor,
                    }}
                  >
                    {downsell.subtitle}
                  </p>

                  {/* Plaque Text */}
                  <p
                    style={{
                      fontSize: "14px",
                      fontWeight: "600",
                      marginBottom: "16px",
                      color: downsell.plaqueTextColor,
                    }}
                  >
                    {downsell.plaqueText}
                  </p>

                  {/* Discount Plaque (Starburst) */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      marginBottom: "24px",
                    }}
                  >
                    <div
                      style={{
                        width: `${downsell.plaqueSize * 2}px`,
                        height: `${downsell.plaqueSize * 2}px`,
                        background: downsell.plaqueBackgroundColor,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative",
                      }}
                    >
                      {/* Starburst spikes using CSS */}
                      <div
                        style={{
                          position: "absolute",
                          width: "100%",
                          height: "100%",
                          background: downsell.plaqueBackgroundColor,
                          clipPath: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)",
                        }}
                      />
                      <span
                        style={{
                          fontSize: `${Math.max(18, downsell.plaqueSize * 0.6)}px`,
                          fontWeight: "700",
                          color: downsell.plaqueDiscountColor,
                          position: "relative",
                          zIndex: 1,
                        }}
                      >
                        {getDiscountDisplay()}
                      </span>
                    </div>
                  </div>

                  {/* CTA Text */}
                  <p
                    style={{
                      fontSize: "14px",
                      marginBottom: "20px",
                      color: downsell.ctaTextColor,
                    }}
                  >
                    {downsell.ctaText}
                  </p>

                  {/* Accept Button */}
                  <button
                    style={{
                      width: "100%",
                      padding: "14px 20px",
                      borderRadius: `${downsell.acceptButtonRadius}px`,
                      border: downsell.acceptButtonBorderWidth > 0
                        ? `${downsell.acceptButtonBorderWidth}px solid ${downsell.acceptButtonBorderColor}`
                        : "none",
                      background: downsell.acceptButtonBgColor,
                      color: downsell.acceptButtonTextColor,
                      fontSize: `${downsell.acceptButtonFontSize}px`,
                      fontWeight: "600",
                      cursor: "pointer",
                      marginBottom: "12px",
                      boxShadow: downsell.acceptButtonShadow > 0
                        ? `0 ${downsell.acceptButtonShadow}px ${downsell.acceptButtonShadow * 2}px rgba(0,0,0,0.2)`
                        : "none",
                    }}
                  >
                    {getPreviewButtonText()}
                  </button>

                  {/* Decline Button */}
                  <button
                    style={{
                      width: "100%",
                      padding: "14px 20px",
                      borderRadius: `${downsell.declineButtonRadius}px`,
                      border: `${downsell.declineButtonBorderWidth}px solid ${downsell.declineButtonBorderColor}`,
                      backgroundColor: downsell.declineButtonBgColor,
                      color: downsell.declineButtonTextColor,
                      fontSize: `${downsell.declineButtonFontSize}px`,
                      fontWeight: "500",
                      cursor: "pointer",
                      boxShadow: downsell.declineButtonShadow > 0
                        ? `0 ${downsell.declineButtonShadow}px ${downsell.declineButtonShadow * 2}px rgba(0,0,0,0.1)`
                        : "none",
                    }}
                  >
                    {downsell.declineButtonText}
                  </button>
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
