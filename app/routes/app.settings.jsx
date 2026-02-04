import { useState, useRef, useEffect } from "react";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getOrCreateShop, getPixelsByShop } from "../lib/db.server";
import { COUNTRY_OPTIONS } from "../lib/constants";
import FormModeSelector from "../components/Settings/FormModeSelector";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);
  const pixels = await getPixelsByShop(shop.id);

  return {
    settings: shop.settings,
    shop: {
      id: shop.id,
      country: shop.country,
      enableMultiCountry: shop.enableMultiCountry || false,
      supportedCountries: shop.supportedCountries || [],
    },
    pixels,
  };
};

export default function Settings() {
  const { settings: initialSettings, shop: initialShop, pixels: initialPixels } = useLoaderData();
  const shopify = useAppBridge();
  const saveButtonRef = useRef(null);

  const [activeTab, setActiveTab] = useState("general");
  const [settings, setSettings] = useState(initialSettings);
  const [shop, setShop] = useState(initialShop);
  const [pixels, setPixels] = useState(initialPixels || []);
  const [isSaving, setIsSaving] = useState(false);
  const [showPixelModal, setShowPixelModal] = useState(false);
  const [editingPixel, setEditingPixel] = useState(null);
  const [pixelFormData, setPixelFormData] = useState({
    type: 'facebook_pixel',
    label: '',
    pixelId: '',
    accessToken: '',
    // Facebook events
    enableAddToCart: false,
    enableAddPaymentInfo: false,
    enableInitiateCheckout: true,
    // Snapchat events
    enableStartCheckout: true,
    enablePurchase: true,
    // TikTok events
    enableTikTokInitiateCheckout: true,
    enablePlaceAnOrder: true,
    enableCompletePayment: true,
    testMode: false,
    testEventCode: '',
  });

  // Multi-country search state
  const [countrySearch, setCountrySearch] = useState('');
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const countrySearchRef = useRef(null);

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
          body: JSON.stringify({
            country: shop.country,
            enableMultiCountry: shop.enableMultiCountry,
            supportedCountries: shop.supportedCountries,
          }),
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

  // Pixel management functions
  const handleAddPixel = () => {
    setEditingPixel(null);
    setPixelFormData({
      type: 'facebook_pixel',
      label: '',
      pixelId: '',
      accessToken: '',
      // Facebook events
      enableAddToCart: false,
      enableAddPaymentInfo: false,
      enableInitiateCheckout: true,
      // Snapchat events
      enableStartCheckout: true,
      enablePurchase: true,
      // TikTok events
      enableTikTokInitiateCheckout: true,
      enablePlaceAnOrder: true,
      enableCompletePayment: true,
      testMode: false,
      testEventCode: '',
    });
    setShowPixelModal(true);
  };

  const handleEditPixel = (pixel) => {
    setEditingPixel(pixel);
    setPixelFormData({
      type: pixel.type,
      label: pixel.label || '',
      pixelId: pixel.pixelId,
      accessToken: pixel.accessToken || '',
      // Facebook events
      enableAddToCart: pixel.enableAddToCart || false,
      enableAddPaymentInfo: pixel.enableAddPaymentInfo || false,
      enableInitiateCheckout: pixel.enableInitiateCheckout !== undefined ? pixel.enableInitiateCheckout : true,
      // Snapchat events
      enableStartCheckout: pixel.enableStartCheckout !== undefined ? pixel.enableStartCheckout : true,
      enablePurchase: pixel.enablePurchase !== undefined ? pixel.enablePurchase : true,
      // TikTok events
      enableTikTokInitiateCheckout: pixel.enableTikTokInitiateCheckout !== undefined ? pixel.enableTikTokInitiateCheckout : true,
      enablePlaceAnOrder: pixel.enablePlaceAnOrder !== undefined ? pixel.enablePlaceAnOrder : true,
      enableCompletePayment: pixel.enableCompletePayment !== undefined ? pixel.enableCompletePayment : true,
      testMode: pixel.testMode,
      testEventCode: pixel.testEventCode || '',
    });
    setShowPixelModal(true);
  };

  const handleSavePixel = async () => {
    try {
      const payload = editingPixel
        ? { id: editingPixel.id, ...pixelFormData }
        : pixelFormData;

      const response = await fetch('/api/pixels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.success) {
        // Refresh pixels list
        const pixelsResponse = await fetch('/api/pixels');
        const pixelsData = await pixelsResponse.json();
        setPixels(pixelsData.pixels || []);
        setShowPixelModal(false);
        shopify.toast.show(editingPixel ? 'Pixel updated!' : 'Pixel added!');
      } else {
        shopify.toast.show('Error saving pixel', { isError: true });
      }
    } catch (error) {
      shopify.toast.show('Error saving pixel', { isError: true });
      console.error('Pixel save error:', error);
    }
  };

  const handleDeletePixel = async (pixelId) => {
    if (!confirm('Are you sure you want to delete this pixel?')) return;

    try {
      const response = await fetch('/api/pixels', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pixelId }),
      });

      const data = await response.json();

      if (data.success) {
        setPixels(pixels.filter(p => p.id !== pixelId));
        shopify.toast.show('Pixel deleted!');
      } else {
        shopify.toast.show('Error deleting pixel', { isError: true });
      }
    } catch (error) {
      shopify.toast.show('Error deleting pixel', { isError: true });
      console.error('Pixel delete error:', error);
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

  // Close country dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (countrySearchRef.current && !countrySearchRef.current.contains(event.target)) {
        setShowCountryDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

      {/* Navigation Tabs */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: "0",
        marginBottom: "24px",
        borderBottom: "1px solid #e5e7eb",
      }}>
        <button
          onClick={() => setActiveTab("general")}
          style={{
            padding: "12px 24px",
            border: "none",
            backgroundColor: "transparent",
            borderBottom: activeTab === "general" ? "2px solid #000" : "2px solid transparent",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: activeTab === "general" ? "600" : "400",
            color: activeTab === "general" ? "#000" : "#6b7280",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            transition: "all 0.2s ease",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v6m0 6v6m5.2-13.2l-4.2 4.2m0 6l4.2 4.2M23 12h-6m-6 0H1m18.2 5.2l-4.2-4.2m0-6l4.2-4.2" />
          </svg>
          General
        </button>
        <button
          onClick={() => setActiveTab("visibility")}
          style={{
            padding: "12px 24px",
            border: "none",
            backgroundColor: "transparent",
            borderBottom: activeTab === "visibility" ? "2px solid #000" : "2px solid transparent",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: activeTab === "visibility" ? "600" : "400",
            color: activeTab === "visibility" ? "#000" : "#6b7280",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            transition: "all 0.2s ease",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Visibility
        </button>
        <button
          onClick={() => setActiveTab("pixels")}
          style={{
            padding: "12px 24px",
            border: "none",
            backgroundColor: "transparent",
            borderBottom: activeTab === "pixels" ? "2px solid #000" : "2px solid transparent",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: activeTab === "pixels" ? "600" : "400",
            color: activeTab === "pixels" ? "#000" : "#6b7280",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            transition: "all 0.2s ease",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="12" x2="18" y2="12" />
            <line x1="6" y1="12" x2="2" y2="12" />
            <line x1="12" y1="6" x2="12" y2="2" />
            <line x1="12" y1="22" x2="12" y2="18" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Pixels
        </button>
      </div>

      {/* General Tab */}
      {activeTab === "general" && (
        <>
          {/* Country Selection */}
          <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Operating Country</s-heading>

          {!shop.enableMultiCountry ? (
            // Single country mode
            <>
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
                  All orders placed with the form will be registered with the country you select here. If you can't find your country don't hesitate to contact us, our support team will add your country immediately!
                </s-text>
              </s-stack>

              <s-stack direction="block" gap="tight" style={{ marginTop: '16px' }}>
                <s-text variant="heading-sm">Do you sell in multiple countries?</s-text>
                <s-text variant="body-sm" tone="subdued">
                  Enable multi-country on the form here:
                </s-text>
                <button
                  onClick={() => {
                    // When enabling, pre-populate with current country
                    handleShopUpdate({
                      enableMultiCountry: true,
                      supportedCountries: shop.supportedCountries?.length > 0
                        ? shop.supportedCountries
                        : [shop.country]
                    });
                  }}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#000',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    width: 'fit-content',
                  }}
                >
                  Enable multi-country
                </button>
              </s-stack>
            </>
          ) : (
            // Multi-country mode
            <>
              <s-stack direction="block" gap="tight">
                <s-text variant="heading-sm">Select countries</s-text>
                <div style={{ position: 'relative' }} ref={countrySearchRef}>
                  <input
                    type="text"
                    value={countrySearch}
                    onChange={(e) => setCountrySearch(e.target.value)}
                    onFocus={() => setShowCountryDropdown(true)}
                    placeholder="Search countries"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      paddingLeft: '36px',
                      borderRadius: '6px',
                      border: '1px solid #ccc',
                      fontSize: '14px',
                    }}
                  />
                  <span style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#999',
                  }}>
                    🔍
                  </span>

                  {/* Dropdown for country selection */}
                  {showCountryDropdown && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      backgroundColor: '#fff',
                      border: '1px solid #ccc',
                      borderRadius: '6px',
                      marginTop: '4px',
                      maxHeight: '200px',
                      overflowY: 'auto',
                      zIndex: 100,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    }}>
                      {COUNTRY_OPTIONS
                        .filter(c =>
                          c.label.toLowerCase().includes(countrySearch.toLowerCase()) &&
                          !shop.supportedCountries?.includes(c.value)
                        )
                        .map(country => (
                          <div
                            key={country.value}
                            onClick={() => {
                              handleShopUpdate({
                                supportedCountries: [...(shop.supportedCountries || []), country.value]
                              });
                              setCountrySearch('');
                              setShowCountryDropdown(false);
                            }}
                            style={{
                              padding: '10px 12px',
                              cursor: 'pointer',
                              borderBottom: '1px solid #f0f0f0',
                            }}
                            onMouseEnter={(e) => e.target.style.backgroundColor = '#f5f5f5'}
                            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                          >
                            {country.label}
                          </div>
                        ))
                      }
                      {COUNTRY_OPTIONS.filter(c =>
                        c.label.toLowerCase().includes(countrySearch.toLowerCase()) &&
                        !shop.supportedCountries?.includes(c.value)
                      ).length === 0 && (
                        <div style={{ padding: '10px 12px', color: '#999' }}>
                          No countries found
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <s-text variant="body-sm" tone="subdued">
                  Select here the countries where you sell. If you can't find your country don't hesitate to contact us, our support team will add your country immediately!
                </s-text>
              </s-stack>

              {/* Selected countries as tags */}
              {shop.supportedCountries?.length > 0 && (
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  marginTop: '12px',
                }}>
                  {shop.supportedCountries.map(code => {
                    const country = COUNTRY_OPTIONS.find(c => c.value === code);
                    return (
                      <div
                        key={code}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          backgroundColor: '#f5f5f5',
                          borderRadius: '20px',
                          fontSize: '14px',
                        }}
                      >
                        <span>{country?.label || code}</span>
                        <button
                          onClick={() => {
                            const newCountries = shop.supportedCountries.filter(c => c !== code);
                            // Ensure at least one country remains
                            if (newCountries.length > 0) {
                              handleShopUpdate({ supportedCountries: newCountries });
                            } else {
                              shopify.toast.show('At least one country must be selected', { isError: true });
                            }
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 0,
                            fontSize: '16px',
                            color: '#666',
                            lineHeight: 1,
                          }}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                onClick={() => handleShopUpdate({ enableMultiCountry: false })}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#000',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  width: 'fit-content',
                  marginTop: '16px',
                }}
              >
                Disable multi-country
              </button>
            </>
          )}
        </s-stack>
      </s-section>

      {/* Cart Items Setting */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Cart Settings</s-heading>
          <s-paragraph>
            Control whether customers can include cart items when ordering through the popup form.
          </s-paragraph>

          <label style={{ display: "flex", gap: "12px", alignItems: "flex-start", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={settings.allowCartItems}
              onChange={(e) => handleUpdate({ allowCartItems: e.target.checked })}
              style={{ width: "18px", height: "18px", marginTop: "3px", flexShrink: 0, cursor: "pointer" }}
            />
            <s-stack direction="block" gap="tight" style={{ flex: 1 }}>
              <s-text variant="heading-sm">Allow Cart Items in Popup</s-text>
              <s-text variant="body-sm" tone="subdued">
                When enabled, customers can choose to buy the current product only or include their cart items. When disabled, only the current product can be purchased.
              </s-text>
            </s-stack>
          </label>

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

          <label style={{ display: "flex", gap: "12px", alignItems: "flex-start", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={settings.enableRTL}
              onChange={(e) => handleUpdate({ enableRTL: e.target.checked })}
              style={{ width: "18px", height: "18px", marginTop: "3px", flexShrink: 0, cursor: "pointer" }}
            />
            <s-stack direction="block" gap="tight" style={{ flex: 1 }}>
              <s-text variant="heading-sm">Enable RTL Layout</s-text>
              <s-text variant="body-sm" tone="subdued">
                When enabled, the checkout form will display in right-to-left layout, suitable for Arabic, Hebrew, and other RTL languages.
              </s-text>
            </s-stack>
          </label>

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

          <label style={{ display: "flex", gap: "12px", alignItems: "flex-start", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={settings.enableCartPermalink || false}
              onChange={(e) => handleUpdate({ enableCartPermalink: e.target.checked })}
              style={{ width: "18px", height: "18px", marginTop: "3px", flexShrink: 0, cursor: "pointer" }}
            />
            <s-stack direction="block" gap="tight" style={{ flex: 1 }}>
              <s-text variant="heading-sm">Enable Pay with Card</s-text>
              <s-text variant="body-sm" tone="subdued">
                When enabled, a "Pay with Card" button will appear below the COD button. Clicking it will redirect customers to Shopify checkout with their information pre-filled.
              </s-text>
            </s-stack>
          </label>

          {settings.enableCartPermalink && (
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-text variant="body-sm">
                ℹ️ Customers who choose "Pay with Card" will be redirected to Shopify's standard checkout. Their name, phone, and address will be pre-filled. Orders completed through card payment will be tracked separately in your database.
              </s-text>
            </s-box>
          )}
        </s-stack>
      </s-section>

          <s-section>
            <FormModeSelector settings={settings} onUpdate={handleUpdate} />
          </s-section>
        </>
      )}

      {/* Visibility Tab */}
      {activeTab === "visibility" && (
        <>
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
        </>
      )}

      {/* Pixels Tab */}
      {activeTab === "pixels" && (
        <>
          {/* Pixel Tracking Section */}
          <s-section>
            <s-stack direction="block" gap="base">
              <s-heading>Pixel Tracking</s-heading>
          <s-paragraph>
            Configure analytics pixels to track your COD form purchases and events. Track conversions with Facebook Pixel and Conversions API.
          </s-paragraph>

          <button
            onClick={handleAddPixel}
            style={{
              padding: '8px 16px',
              backgroundColor: '#000',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            + Add Pixel
          </button>

          {pixels.length > 0 && (
            <div style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              overflow: 'hidden',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb' }}>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Type</th>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Label</th>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Pixel ID</th>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Status</th>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pixels.map((pixel) => (
                    <tr key={pixel.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '12px' }}>
                        {pixel.type === 'facebook_pixel' && 'Facebook Pixel'}
                        {pixel.type === 'facebook_capi' && 'Facebook CAPI'}
                        {pixel.type === 'snapchat_pixel' && 'Snapchat Pixel'}
                        {pixel.type === 'tiktok_pixel' && 'TikTok Pixel'}
                        {pixel.type === 'tiktok_events_api' && 'TikTok Events API'}
                      </td>
                      <td style={{ padding: '12px' }}>{pixel.label || '-'}</td>
                      <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '13px' }}>{pixel.pixelId}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          backgroundColor: pixel.enabled ? '#d1fae5' : '#fee2e2',
                          color: pixel.enabled ? '#065f46' : '#991b1b',
                        }}>
                          {pixel.enabled ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => handleEditPixel(pixel)}
                            style={{
                              padding: '4px 12px',
                              backgroundColor: '#f3f4f6',
                              border: '1px solid #d1d5db',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '13px',
                            }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeletePixel(pixel.id)}
                            style={{
                              padding: '4px 12px',
                              backgroundColor: '#fee2e2',
                              border: '1px solid #fecaca',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '13px',
                              color: '#991b1b',
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
          )}

          {pixels.length === 0 && (
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-text variant="body-sm">
                No pixels configured yet. Click "Add Pixel" to get started with tracking.
              </s-text>
            </s-box>
          )}

          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="tight">
              <s-text variant="heading-sm">Events Tracked</s-text>

              <s-text variant="body-sm" style={{ marginTop: '8px' }}>
                <strong>Facebook:</strong>
              </s-text>
              <s-text variant="body-sm">
                • <strong>InitiateCheckout:</strong> Fired when COD form opens
              </s-text>
              <s-text variant="body-sm">
                • <strong>AddPaymentInfo:</strong> Fired when customer enters email/phone
              </s-text>
              <s-text variant="body-sm">
                • <strong>AddToCart:</strong> Fired when one-tick upsell is selected
              </s-text>
              <s-text variant="body-sm">
                • <strong>Purchase:</strong> Fired after successful order
              </s-text>
              <s-text variant="body-sm" style={{ fontSize: '12px', color: '#666', marginLeft: '16px' }}>
                Facebook Pixel: Client-side tracking
              </s-text>
              <s-text variant="body-sm" style={{ fontSize: '12px', color: '#666', marginLeft: '16px' }}>
                Facebook Conversions API: Server-side tracking with hashed user data
              </s-text>

              <s-text variant="body-sm" style={{ marginTop: '12px' }}>
                <strong>Snapchat:</strong>
              </s-text>
              <s-text variant="body-sm">
                • <strong>START_CHECKOUT:</strong> Fired when COD form opens
              </s-text>
              <s-text variant="body-sm">
                • <strong>PURCHASE:</strong> Fired after successful order
              </s-text>
              <s-text variant="body-sm" style={{ fontSize: '12px', color: '#666', marginLeft: '16px' }}>
                Snapchat Pixel: Client-side tracking
              </s-text>

              <s-text variant="body-sm" style={{ marginTop: '12px' }}>
                <strong>TikTok:</strong>
              </s-text>
              <s-text variant="body-sm">
                • <strong>InitiateCheckout:</strong> Fired when COD form opens (pixel only)
              </s-text>
              <s-text variant="body-sm">
                • <strong>PlaceAnOrder:</strong> Fired after successful order
              </s-text>
              <s-text variant="body-sm">
                • <strong>CompletePayment:</strong> Fired after successful order
              </s-text>
              <s-text variant="body-sm" style={{ fontSize: '12px', color: '#666', marginLeft: '16px' }}>
                TikTok Pixel: Client-side tracking
              </s-text>
              <s-text variant="body-sm" style={{ fontSize: '12px', color: '#666', marginLeft: '16px' }}>
                TikTok Events API: Server-side tracking (PlaceAnOrder & CompletePayment only)
              </s-text>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>
        </>
      )}

      {/* Pixel Modal */}
      {showPixelModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto',
          }}>
            <h2 style={{ marginTop: 0 }}>{editingPixel ? 'Edit Pixel' : 'Add Pixel'}</h2>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>Type</label>
              <select
                value={pixelFormData.type}
                onChange={(e) => setPixelFormData({ ...pixelFormData, type: e.target.value })}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
              >
                <option value="facebook_pixel">Facebook Pixel</option>
                <option value="facebook_capi">Facebook Conversions API</option>
                <option value="snapchat_pixel">Snapchat Pixel</option>
                <option value="tiktok_pixel">TikTok Pixel</option>
                <option value="tiktok_events_api">TikTok Events API</option>
              </select>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                Pixel Label <span style={{ color: '#999', fontWeight: 'normal' }}>(optional)</span>
              </label>
              <input
                type="text"
                value={pixelFormData.label}
                onChange={(e) => setPixelFormData({ ...pixelFormData, label: e.target.value })}
                placeholder="e.g., Main Pixel"
                maxLength={50}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
              />
              <small style={{ color: '#666' }}>{pixelFormData.label.length}/50</small>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>Pixel ID</label>
              <input
                type="text"
                value={pixelFormData.pixelId}
                onChange={(e) => setPixelFormData({ ...pixelFormData, pixelId: e.target.value })}
                placeholder="123456789012345"
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
              />
            </div>

            {pixelFormData.type === 'facebook_capi' && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>Access Token</label>
                <input
                  type="password"
                  value={pixelFormData.accessToken}
                  onChange={(e) => setPixelFormData({ ...pixelFormData, accessToken: e.target.value })}
                  placeholder="Enter access token"
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                />
                <small style={{ color: '#666' }}>Required for Conversions API</small>
              </div>
            )}

            {/* Facebook-specific events */}
            {(pixelFormData.type === 'facebook_pixel' || pixelFormData.type === 'facebook_capi') && (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={pixelFormData.enableInitiateCheckout}
                      onChange={(e) => setPixelFormData({ ...pixelFormData, enableInitiateCheckout: e.target.checked })}
                    />
                    <span>Enable InitiateCheckout event</span>
                  </label>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={pixelFormData.enableAddPaymentInfo}
                      onChange={(e) => setPixelFormData({ ...pixelFormData, enableAddPaymentInfo: e.target.checked })}
                    />
                    <span>Enable AddPaymentInfo event</span>
                  </label>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={pixelFormData.enableAddToCart}
                      onChange={(e) => setPixelFormData({ ...pixelFormData, enableAddToCart: e.target.checked })}
                    />
                    <span>Enable AddToCart event (for upsells)</span>
                  </label>
                </div>
              </>
            )}

            {/* Snapchat-specific events */}
            {pixelFormData.type === 'snapchat_pixel' && (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={pixelFormData.enableStartCheckout}
                      onChange={(e) => setPixelFormData({ ...pixelFormData, enableStartCheckout: e.target.checked })}
                    />
                    <span>Enable START_CHECKOUT event</span>
                  </label>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={pixelFormData.enablePurchase}
                      onChange={(e) => setPixelFormData({ ...pixelFormData, enablePurchase: e.target.checked })}
                    />
                    <span>Enable PURCHASE event</span>
                  </label>
                </div>
              </>
            )}

            {/* TikTok-specific events */}
            {(pixelFormData.type === 'tiktok_pixel' || pixelFormData.type === 'tiktok_events_api') && (
              <>
                {pixelFormData.type === 'tiktok_pixel' && (
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={pixelFormData.enableTikTokInitiateCheckout}
                        onChange={(e) => setPixelFormData({ ...pixelFormData, enableTikTokInitiateCheckout: e.target.checked })}
                      />
                      <span>Enable InitiateCheckout event (pixel only)</span>
                    </label>
                  </div>
                )}

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={pixelFormData.enablePlaceAnOrder}
                      onChange={(e) => setPixelFormData({ ...pixelFormData, enablePlaceAnOrder: e.target.checked })}
                    />
                    <span>Enable PlaceAnOrder event</span>
                  </label>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={pixelFormData.enableCompletePayment}
                      onChange={(e) => setPixelFormData({ ...pixelFormData, enableCompletePayment: e.target.checked })}
                    />
                    <span>Enable CompletePayment event</span>
                  </label>
                </div>
              </>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={pixelFormData.testMode}
                  onChange={(e) => setPixelFormData({ ...pixelFormData, testMode: e.target.checked })}
                />
                <span>Enable test mode</span>
              </label>
            </div>

            {pixelFormData.testMode && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>Test Event Code</label>
                <input
                  type="text"
                  value={pixelFormData.testEventCode}
                  onChange={(e) => setPixelFormData({ ...pixelFormData, testEventCode: e.target.value })}
                  placeholder="TEST12345"
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowPixelModal(false)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSavePixel}
                disabled={!pixelFormData.pixelId}
                style={{
                  padding: '8px 16px',
                  backgroundColor: pixelFormData.pixelId ? '#000' : '#ccc',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: pixelFormData.pixelId ? 'pointer' : 'not-allowed',
                }}
              >
                {editingPixel ? 'Update' : 'Add'} Pixel
              </button>
            </div>
          </div>
        </div>
      )}
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
