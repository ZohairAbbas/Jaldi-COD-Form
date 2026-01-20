import { useState, useRef, useEffect } from "react";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getOrCreateShop } from "../lib/db.server";
import { COUNTRY_OPTIONS } from "../lib/constants";
import FormModeSelector from "../components/Settings/FormModeSelector";
import ButtonCustomizer from "../components/Settings/ButtonCustomizer";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  return {
    settings: shop.settings,
    shop: {
      id: shop.id,
      country: shop.country,
    },
  };
};

export default function Settings() {
  const { settings: initialSettings, shop: initialShop } = useLoaderData();
  const shopify = useAppBridge();
  const saveButtonRef = useRef(null);

  const [settings, setSettings] = useState(initialSettings);
  const [shop, setShop] = useState(initialShop);
  const [isSaving, setIsSaving] = useState(false);

  const handleUpdate = (updates) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  };

  const handleShopUpdate = (updates) => {
    setShop((prev) => ({ ...prev, ...updates }));
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      // Save both settings and shop data
      const [settingsResponse, shopResponse] = await Promise.all([
        fetch("/api/settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(settings),
        }),
        fetch("/api/shop", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ country: shop.country }),
        }),
      ]);

      const settingsData = await settingsResponse.json();
      const shopData = await shopResponse.json();

      if (settingsResponse.ok && settingsData.success && shopResponse.ok && shopData.success) {
        shopify.toast.show("Settings saved successfully!");
      } else {
        throw new Error("Failed to save");
      }
    } catch (error) {
      shopify.toast.show("Error saving settings", { isError: true });
      console.error("Save error:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Attach event listener to save button (web components don't support React's onClick)                                                   
  useEffect(() => {                                                                                                                        
    const button = saveButtonRef.current;                                                                                                  
    if (button) {                                                                                                                          
      button.addEventListener("click", handleSave);                                                                                        
      return () => {                                                                                                                       
        button.removeEventListener("click", handleSave);                                                                                   
      };                                                                                                                                   
    }                                                                                                                                      
  }, [handleSave]);

  return (
    <s-page heading="Settings">
      <s-button
        slot="primary-action"
        ref={saveButtonRef}
        {...(isSaving ? { loading: true } : {})}
        variant="primary"
      >
        Save Settings
      </s-button>

      {/* Country Selection */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Operating Country</s-heading>
          <s-paragraph>
            Select the country where your store operates. This will determine the provinces/states shown in the checkout form and the phone number format.
          </s-paragraph>

          <s-stack direction="block" gap="tight">
            <s-text variant="heading-sm">Country</s-text>
            <select
              value={shop.country}
              onChange={(e) => handleShopUpdate({ country: e.target.value })}
              style={{
                width: "100%",
                padding: "8px",
                borderRadius: "4px",
                border: "1px solid #ccc",
              }}
            >
              {COUNTRY_OPTIONS.map((country) => (
                <option key={country.value} value={country.value}>
                  {country.label}
                </option>
              ))}
            </select>
            <s-text variant="body-sm" tone="subdued">
              This determines the provinces/states shown in the form and phone number format
            </s-text>
          </s-stack>
        </s-stack>
      </s-section>

      {/* Cart Items Setting */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Cart Settings</s-heading>
          <s-paragraph>
            Control whether customers can include cart items when ordering through the popup form.
          </s-paragraph>

          <s-stack direction="inline" gap="base" align="space-between">
            <s-stack direction="block" gap="tight">
              <s-text variant="heading-sm">Allow Cart Items in Popup</s-text>
              <s-text variant="body-sm" tone="subdued">
                When enabled, customers can choose to buy the current product only or include their cart items. When disabled, only the current product can be purchased.
              </s-text>
            </s-stack>
            <input
              type="checkbox"
              checked={settings.allowCartItems}
              onChange={(e) => handleUpdate({ allowCartItems: e.target.checked })}
              style={{ width: "20px", height: "20px" }}
            />
          </s-stack>

          {settings.allowCartItems && (
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-text variant="body-sm">
                ℹ️ Customers will see a dropdown to choose between "Current product only" or "Current product + cart items"
              </s-text>
            </s-box>
          )}
        </s-stack>
      </s-section>

      {/* RTL Support Setting */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>RTL Support</s-heading>
          <s-paragraph>
            Enable right-to-left (RTL) layout for Arabic and other RTL languages. This will mirror the form layout and align text to the right.
          </s-paragraph>

          <s-stack direction="inline" gap="base" align="space-between">
            <s-stack direction="block" gap="tight">
              <s-text variant="heading-sm">Enable RTL Layout</s-text>
              <s-text variant="body-sm" tone="subdued">
                When enabled, the checkout form will display in right-to-left layout, suitable for Arabic, Hebrew, and other RTL languages.
              </s-text>
            </s-stack>
            <input
              type="checkbox"
              checked={settings.enableRTL}
              onChange={(e) => handleUpdate({ enableRTL: e.target.checked })}
              style={{ width: "20px", height: "20px" }}
            />
          </s-stack>

          {settings.enableRTL && (
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-text variant="body-sm">
                ℹ️ The form will be mirrored for RTL display. All text alignment, icons, and layout elements will be flipped to support right-to-left reading direction.
              </s-text>
            </s-box>
          )}
        </s-stack>
      </s-section>

      {/* Pay with Card Setting */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Pay with Card</s-heading>
          <s-paragraph>
            Enable a "Pay with Card" option that redirects customers to Shopify's native checkout with pre-filled information.
          </s-paragraph>

          <s-stack direction="inline" gap="base" align="space-between">
            <s-stack direction="block" gap="tight">
              <s-text variant="heading-sm">Enable Pay with Card</s-text>
              <s-text variant="body-sm" tone="subdued">
                When enabled, a "Pay with Card" button will appear below the COD button. Clicking it will redirect customers to Shopify checkout with their information pre-filled.
              </s-text>
            </s-stack>
            <input
              type="checkbox"
              checked={settings.enableCartPermalink || false}
              onChange={(e) => handleUpdate({ enableCartPermalink: e.target.checked })}
              style={{ width: "20px", height: "20px" }}
            />
          </s-stack>

          {settings.enableCartPermalink && (
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-text variant="body-sm">
                ℹ️ Customers who choose "Pay with Card" will be redirected to Shopify's standard checkout. Their name, phone, and address will be pre-filled. Orders completed through card payment will be tracked separately in your database.
              </s-text>
            </s-box>
          )}
        </s-stack>
      </s-section>

      {/* Button Page Visibility Setting */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Button Visibility</s-heading>
          <s-paragraph>
            Control where the COD button appears on your storefront (Popup mode only)
          </s-paragraph>

          {/* Segmented Control */}
          <div style={{
            display: "flex",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            overflow: "hidden",
            backgroundColor: "#f9fafb",
          }}>
            {[
              { value: "disabled", label: "Disabled" },
              { value: "cart", label: "Only cart page" },
              { value: "product", label: "Only product pages" },
              { value: "both", label: "Both cart and product pages" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleUpdate({ buttonPageVisibility: option.value })}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  border: "none",
                  backgroundColor: settings.buttonPageVisibility === option.value ? "#000" : "transparent",
                  color: settings.buttonPageVisibility === option.value ? "#fff" : "#374151",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: settings.buttonPageVisibility === option.value ? "600" : "400",
                  transition: "all 0.2s ease",
                }}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* Cart Page Settings - Show when cart or both is selected */}
          {(settings.buttonPageVisibility === "cart" || settings.buttonPageVisibility === "both") && (
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="base">
                <s-text variant="heading-sm">Cart page settings</s-text>
                <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={settings.hideCheckoutButton || false}
                    onChange={(e) => handleUpdate({ hideCheckoutButton: e.target.checked })}
                    style={{ width: "18px", height: "18px" }}
                  />
                  <span style={{ fontSize: "14px" }}>
                    Hide the <strong>Checkout</strong> button on your cart
                  </span>
                </label>
              </s-stack>
            </s-box>
          )}

          {/* Product Pages Settings - Show when product or both is selected */}
          {(settings.buttonPageVisibility === "product" || settings.buttonPageVisibility === "both") && (
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="base">
                <s-text variant="heading-sm">Product pages settings</s-text>
                <s-stack direction="block" gap="tight">
                  <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={settings.hideAddToCartButton || false}
                      onChange={(e) => handleUpdate({ hideAddToCartButton: e.target.checked })}
                      style={{ width: "18px", height: "18px" }}
                    />
                    <span style={{ fontSize: "14px" }}>
                      Hide the <strong>Add to Cart</strong> button on product pages
                    </span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={settings.hideBuyNowButton || false}
                      onChange={(e) => handleUpdate({ hideBuyNowButton: e.target.checked })}
                      style={{ width: "18px", height: "18px" }}
                    />
                    <span style={{ fontSize: "14px" }}>
                      Hide the <strong>Buy Now</strong> button on product pages
                    </span>
                  </label>
                </s-stack>
              </s-stack>
            </s-box>
          )}

          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-text variant="body-sm">
              ℹ️ This setting only applies to popup mode. In embedded mode, you control placement manually through the theme editor.
            </s-text>
          </s-box>
        </s-stack>
      </s-section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        {/* Left Column - Form Mode */}
        <div>
          <s-section>
            <FormModeSelector settings={settings} onUpdate={handleUpdate} />
          </s-section>
        </div>

        {/* Right Column - Button Customization */}
        <div>
          <s-section>
            <ButtonCustomizer settings={settings} onUpdate={handleUpdate} />
          </s-section>
        </div>
      </div>

      <s-section heading="Setup Instructions">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            After configuring your settings, follow these steps to enable the COD
            form on your storefront:
          </s-paragraph>

          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="tight">
              <s-text variant="heading-sm">Step 1: Enable App Embed (Required)</s-text>
              <s-unordered-list>
                <s-list-item>
                  Go to your Shopify theme editor
                </s-list-item>
                <s-list-item>
                  Click "App embeds" in the left sidebar
                </s-list-item>
                <s-list-item>
                  Enable "Preventify COD Form"
                </s-list-item>
                <s-list-item>
                  Save your theme
                </s-list-item>
              </s-unordered-list>
              <s-text variant="body-sm" tone="subdued">
                This will automatically display the form/button at the end of your product and cart sections based on your selected mode above.
              </s-text>
            </s-stack>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="tight">
              <s-text variant="heading-sm">Step 2: Manual Placement (Optional)</s-text>
              <s-paragraph>
                If you want to place the button or form at a specific location instead of the default position:
              </s-paragraph>
              <s-unordered-list>
                <s-list-item>
                  <strong>For Popup Mode:</strong> Add the "Preventify - COD Button" block to your product page template at your desired location
                </s-list-item>
                <s-list-item>
                  <strong>For Embedded Mode:</strong> Add the "Preventify - COD Form" block to your product or cart page template at your desired location
                </s-list-item>
              </s-unordered-list>
              <s-text variant="body-sm" tone="subdued">
                Manual blocks override the default position. The form/button will appear only where you place the block.
              </s-text>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
