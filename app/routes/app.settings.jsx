import { useState, useRef, useEffect } from "react";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getOrCreateShop, getPixelsByShop, getBlockedUsers } from "../lib/db.server";
import { COUNTRY_OPTIONS, DEFAULT_THANK_YOU_MESSAGE, getCurrencyCode, getCountryData } from "../lib/constants";
import prisma from "../db.server";
import { FIELD_CATALOG, COLUMN_PRESETS } from "../lib/google-sheets.server";
import GoogleSheetsIntegration from "../components/Settings/GoogleSheetsIntegration";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);
  const pixels = await getPixelsByShop(shop.id);
  const blockedUsers = await getBlockedUsers(shop.id);

  const gsRow = await prisma.googleSheetsIntegration.findUnique({
    where: { shopId: shop.id },
  });
  const googleSheets = gsRow
    ? (() => {
        const connected = Boolean(gsRow.refreshToken);
        const safe = { ...gsRow };
        delete safe.accessToken;
        delete safe.refreshToken;
        return { ...safe, connected };
      })()
    : null;

  return {
    settings: shop.settings,
    shop: {
      id: shop.id,
      country: shop.country,
      currencyCode: shop.currencyCode || null,
      enableMultiCountry: shop.enableMultiCountry || false,
      supportedCountries: shop.supportedCountries || [],
    },
    shopDomain: session.shop,
    pixels,
    blockedUsers,
    googleSheets,
    googleSheetsFieldCatalog: FIELD_CATALOG,
    googleSheetsPresets: COLUMN_PRESETS,
  };
};

export default function Settings() {
  const { settings: initialSettings, shop: initialShop, pixels: initialPixels, blockedUsers: initialBlockedUsers, googleSheets, googleSheetsFieldCatalog, googleSheetsPresets } = useLoaderData();
  const shopify = useAppBridge();
  const saveButtonRef = useRef(null);

  const initialTab = (typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("tab")
    : null) || "general";
  const [activeTab, setActiveTab] = useState(initialTab);
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

  // Country-restriction allow-list search (separate from multi-country pricing)
  const [allowedSearch, setAllowedSearch] = useState('');
  const [showAllowedDropdown, setShowAllowedDropdown] = useState(false);
  const allowedSearchRef = useRef(null);
  const [nativeBundleSearch, setNativeBundleSearch] = useState('');
  const [showNativeBundleDropdown, setShowNativeBundleDropdown] = useState(false);
  const nativeBundleSearchRef = useRef(null);

  // Fraud prevention state
  const [blockedEmails, setBlockedEmails] = useState(
    (initialBlockedUsers || []).filter(b => b.type === 'email').map(b => b.value).join('\n')
  );
  const [blockedPhones, setBlockedPhones] = useState(
    (initialBlockedUsers || []).filter(b => b.type === 'phone').map(b => b.value).join('\n')
  );

  const handleUpdate = (updates) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  };

  const handleShopUpdate = (updates) => {
    setShop((prev) => ({ ...prev, ...updates }));
  };

  const handleSelectSpecificProducts = async () => {
    try {
      const selected = await shopify.resourcePicker({
        type: "product",
        multiple: true,
        selectionIds: (settings.specificProductIds || []).map((id) => ({ id })),
      });
      if (selected) {
        handleUpdate({
          specificProductIds: selected.map((p) => p.id),
          specificProductTitles: selected.map((p) => p.title),
        });
      }
    } catch (e) {
      // User cancelled — no-op
    }
  };

  const handleSelectDisabledProducts = async () => {
    try {
      const selected = await shopify.resourcePicker({
        type: "product",
        multiple: true,
        selectionIds: (settings.disabledProductIds || []).map((id) => ({ id })),
      });
      if (selected) {
        handleUpdate({
          disabledProductIds: selected.map((p) => p.id),
          disabledProductTitles: selected.map((p) => p.title),
        });
      }
    } catch (e) {
      // User cancelled — no-op
    }
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      // Save settings, shop data, and blocked users
      const promises = [
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
      ];

      // Save blocked users if feature is enabled
      if (settings.enableUserBlocking) {
        promises.push(
          fetch("/api/blocked-users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              blockedEmails: blockedEmails.split('\n').filter(e => e.trim()),
              blockedPhones: blockedPhones.split('\n').filter(p => p.trim()),
            }),
          })
        );
      }

      const responses = await Promise.all(promises);
      const results = await Promise.all(responses.map(r => r.json()));
      const allOk = responses.every(r => r.ok) && results.every(r => r.success);

      if (allOk) {
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
      if (allowedSearchRef.current && !allowedSearchRef.current.contains(event.target)) {
        setShowAllowedDropdown(false);
      }
      if (nativeBundleSearchRef.current && !nativeBundleSearchRef.current.contains(event.target)) {
        setShowNativeBundleDropdown(false);
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
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: "24px",
        padding: "16px 0",
      }}>
        <div style={{
          display: "inline-flex",
          gap: "8px",
          backgroundColor: "#F6F6F7",
          padding: "4px",
          borderRadius: "12px",
          border: "1px solid #E1E3E5",
        }}>
          <button
            onClick={() => setActiveTab("general")}
            style={{
              padding: "10px 20px",
              border: "none",
              backgroundColor: activeTab === "general" ? "#FFFFFF" : "transparent",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "500",
              color: activeTab === "general" ? "#000000" : "#6b7280",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.2s ease",
              boxShadow: activeTab === "general" ? "0 1px 3px rgba(0, 0, 0, 0.1)" : "none",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            General
          </button>
          <button
            onClick={() => setActiveTab("visibility")}
            style={{
              padding: "10px 20px",
              border: "none",
              backgroundColor: activeTab === "visibility" ? "#FFFFFF" : "transparent",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "500",
              color: activeTab === "visibility" ? "#000000" : "#6b7280",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.2s ease",
              boxShadow: activeTab === "visibility" ? "0 1px 3px rgba(0, 0, 0, 0.1)" : "none",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Visibility
          </button>
          <button
            onClick={() => setActiveTab("pixels")}
            style={{
              padding: "10px 20px",
              border: "none",
              backgroundColor: activeTab === "pixels" ? "#FFFFFF" : "transparent",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "500",
              color: activeTab === "pixels" ? "#000000" : "#6b7280",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.2s ease",
              boxShadow: activeTab === "pixels" ? "0 1px 3px rgba(0, 0, 0, 0.1)" : "none",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            Pixels
          </button>
          <button
            onClick={() => setActiveTab("fraud")}
            style={{
              padding: "10px 20px",
              border: "none",
              backgroundColor: activeTab === "fraud" ? "#FFFFFF" : "transparent",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "500",
              color: activeTab === "fraud" ? "#000000" : "#6b7280",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.2s ease",
              boxShadow: activeTab === "fraud" ? "0 1px 3px rgba(0, 0, 0, 0.1)" : "none",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            User Blocking
          </button>
          <button
            onClick={() => setActiveTab("google-sheets")}
            style={{
              padding: "10px 20px",
              border: "none",
              backgroundColor: activeTab === "google-sheets" ? "#FFFFFF" : "transparent",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "500",
              color: activeTab === "google-sheets" ? "#000000" : "#6b7280",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.2s ease",
              boxShadow: activeTab === "google-sheets" ? "0 1px 3px rgba(0, 0, 0, 0.1)" : "none",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="3" y1="15" x2="21" y2="15" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
            Google Sheets
          </button>
        </div>
      </div>

      {/* General Tab */}
      {activeTab === "general" && (
        <>
          {/* Manage Redirection */}
          <s-section>
            <s-stack direction="block" gap="base">
              <s-heading>Manage redirection</s-heading>
              <s-paragraph>Select where you want to redirect customers after placing the order.</s-paragraph>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                {[
                  { value: "shopify", label: "Redirect customers to Shopify default Thank you page" },
                  { value: "custom_page", label: "Redirect customers to specific page" },
                  { value: "whatsapp", label: "Redirect customers to WhatsApp to chat with you" },
                  { value: "none", label: "No redirection (Show thank you message only)" },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "12px 14px",
                      border: (settings.redirectMode || "shopify") === opt.value ? "2px solid #000" : "1px solid #D1D5DB",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    <input
                      type="radio"
                      name="redirectMode"
                      checked={(settings.redirectMode || "shopify") === opt.value}
                      onChange={() => {
                        const updates = { redirectMode: opt.value };
                        // Seed the editable default message the first time "none" is chosen
                        if (opt.value === "none" && !settings.thankYouMessage) {
                          updates.thankYouMessage = DEFAULT_THANK_YOU_MESSAGE;
                        }
                        handleUpdate(updates);
                      }}
                      style={{ width: "16px", height: "16px", accentColor: "#000" }}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>

              {/* Specific page URL */}
              {settings.redirectMode === "custom_page" && (
                <s-stack direction="block" gap="tight" style={{ marginTop: "8px" }}>
                  <s-text variant="heading-sm">Redirect URL</s-text>
                  <input
                    type="url"
                    value={settings.redirectUrl || ""}
                    onChange={(e) => handleUpdate({ redirectUrl: e.target.value })}
                    placeholder="https://example.com/thank-you"
                    style={{ width: "100%", padding: "10px 12px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "14px", boxSizing: "border-box" }}
                  />
                  <s-text tone="subdued">Link where to redirect customers after submitting the form.</s-text>
                </s-stack>
              )}

              {/* WhatsApp */}
              {settings.redirectMode === "whatsapp" && (
                <s-stack direction="block" gap="base" style={{ marginTop: "8px" }}>
                  <s-stack direction="block" gap="tight">
                    <s-text variant="heading-sm">Your WhatsApp phone number</s-text>
                    <input
                      type="text"
                      value={settings.redirectWhatsappNumber || ""}
                      onChange={(e) => handleUpdate({ redirectWhatsappNumber: e.target.value })}
                      placeholder="+571234567890"
                      style={{ width: "100%", padding: "10px 12px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "14px", boxSizing: "border-box" }}
                    />
                    <s-text tone="subdued">Please include the country code.</s-text>
                  </s-stack>
                  <s-stack direction="block" gap="tight">
                    <s-text variant="heading-sm">WhatsApp message</s-text>
                    <textarea
                      value={settings.redirectWhatsappMessage || ""}
                      onChange={(e) => handleUpdate({ redirectWhatsappMessage: e.target.value })}
                      placeholder="Hi! I just placed order {{order.number}}."
                      rows={3}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "14px", boxSizing: "border-box", resize: "vertical" }}
                    />
                    <s-text tone="subdued">Variables: {"{{customer.name}}, {{order.number}}, {{order.total}}, {{order.products}}, {{order.quantity}}"}</s-text>
                  </s-stack>
                </s-stack>
              )}

              {/* No redirection — thank you message */}
              {settings.redirectMode === "none" && (
                <s-stack direction="block" gap="tight" style={{ marginTop: "8px" }}>
                  <s-text variant="heading-sm">Message to show after submitting the form</s-text>
                  <textarea
                    value={settings.thankYouMessage || ""}
                    onChange={(e) => handleUpdate({ thankYouMessage: e.target.value })}
                    placeholder={DEFAULT_THANK_YOU_MESSAGE}
                    rows={8}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "14px", boxSizing: "border-box", resize: "vertical", fontFamily: "monospace" }}
                  />
                  <s-text tone="subdued">
                    HTML is supported. Variables: {"{{customer.name}}, {{customer.first_name}}, {{customer.phone}}, {{customer.email}}, {{customer.address1}}, {{customer.city}}, {{order.number}}, {{order.total}}, {{order.products}}, {{order.quantity}}"}
                  </s-text>
                </s-stack>
              )}
            </s-stack>
          </s-section>

          {/* Country Selection */}
          <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Operating Country</s-heading>

          {/* This setting drives form defaults, not the store's currency. When the
              two disagree the merchant should know, because it is otherwise
              invisible until ad-platform revenue looks wrong. */}
          {shop.currencyCode && getCurrencyCode(shop.country) !== shop.currencyCode && (
            <s-banner tone="warning">
              <s-text>
                Your Shopify store sells in <strong>{shop.currencyCode}</strong>, but the country
                selected here ({getCountryData(shop.country).name}) uses{' '}
                <strong>{getCurrencyCode(shop.country)}</strong>. This setting controls form
                defaults such as phone code and provinces — your prices and conversion tracking
                already use {shop.currencyCode}. Pick the country matching how you sell if this
                looks wrong.
              </s-text>
            </s-banner>
          )}

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
              </s-stack>

              <s-stack direction="block" gap="tight" style={{ marginTop: '16px' }}>
                <s-text variant="heading-sm">Do you sell in multiple countries?</s-text>
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
                    marginTop: '8px',
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
              </s-stack>

              {/* Selected countries as tags */}
              {shop.supportedCountries?.length > 0 && (
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
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
                When enabled, customers can choose to buy the current product only or include their cart items. When disabled, both the current product and cart items are automatically included in the form (customers can remove items they don't want).
              </s-text>
            </s-stack>
          </label>

          {settings.allowCartItems ? (
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-text variant="body-sm">
                ℹ️ Customers will see a dropdown to choose between "Current product only" or "Current product + cart items"
              </s-text>
            </s-box>
          ) : (
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-text variant="body-sm">
                ℹ️ Both current product and cart items will be included by default. Customers can remove items using the X button if they don't want them.
              </s-text>
            </s-box>
          )}
        </s-stack>
      </s-section>

      {/* Free Shipping Progress Nudge */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Free shipping nudge</s-heading>
          <s-paragraph>
            Encourage bigger carts. When a free-shipping rate is gated behind an order-total or quantity threshold, show buyers how much more they need to add to unlock free delivery.
          </s-paragraph>

          <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={settings.freeShippingNudgeEnabled || false}
              onChange={(e) => handleUpdate({ freeShippingNudgeEnabled: e.target.checked })}
              style={{ width: "16px", height: "16px", accentColor: "#000" }}
            />
            Show free shipping progress nudge
          </label>

          {settings.freeShippingNudgeEnabled && (
            <>
              <s-stack direction="block" gap="tight" style={{ marginTop: "8px" }}>
                <s-text variant="heading-sm">Amount-based message</s-text>
                <input
                  type="text"
                  value={settings.freeShippingNudgeAmountText || ""}
                  onChange={(e) => handleUpdate({ freeShippingNudgeAmountText: e.target.value })}
                  placeholder="🚚 Add {{amount}} more to get free delivery"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "14px", boxSizing: "border-box" }}
                />
                <s-text tone="subdued">Shown for order-total thresholds. Use {"{{amount}}"} for the remaining amount.</s-text>
              </s-stack>

              <s-stack direction="block" gap="tight">
                <s-text variant="heading-sm">Quantity-based message</s-text>
                <input
                  type="text"
                  value={settings.freeShippingNudgeQtyText || ""}
                  onChange={(e) => handleUpdate({ freeShippingNudgeQtyText: e.target.value })}
                  placeholder="🚚 Add {{count}} more item(s) to get free delivery"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "14px", boxSizing: "border-box" }}
                />
                <s-text tone="subdued">Shown for quantity thresholds. Use {"{{count}}"} for the remaining item count.</s-text>
              </s-stack>

              <s-stack direction="block" gap="tight">
                <s-text variant="heading-sm">Unlocked message</s-text>
                <input
                  type="text"
                  value={settings.freeShippingNudgeSuccessText || ""}
                  onChange={(e) => handleUpdate({ freeShippingNudgeSuccessText: e.target.value })}
                  placeholder="🎉 You've unlocked free delivery!"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "14px", boxSizing: "border-box" }}
                />
                <s-text tone="subdued">Shown once the buyer qualifies for free delivery.</s-text>
              </s-stack>
            </>
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
              onChange={(e) => {
                const updates = { enableCartPermalink: e.target.checked };
                if (!e.target.checked) {
                  updates.hideCompleteOrderButton = false;
                }
                handleUpdate(updates);
              }}
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
            <>
              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                <s-text variant="body-sm">
                  ℹ️ Customers who choose "Pay with Card" will be redirected to Shopify's standard checkout. Their name, phone, and address will be pre-filled. Orders completed through card payment will be tracked separately in your database.
                </s-text>
              </s-box>

              <label style={{ display: "flex", gap: "12px", alignItems: "flex-start", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={settings.hideCompleteOrderButton || false}
                  onChange={(e) => handleUpdate({ hideCompleteOrderButton: e.target.checked })}
                  style={{ width: "18px", height: "18px", marginTop: "3px", flexShrink: 0, cursor: "pointer" }}
                />
                <s-stack direction="block" gap="tight" style={{ flex: 1 }}>
                  <s-text variant="heading-sm">Hide Complete Order (COD) button</s-text>
                  <s-text variant="body-sm" tone="subdued">
                    When enabled, only the "Pay with Card" button will be shown. The COD "Complete Order" button will be hidden.
                  </s-text>
                </s-stack>
              </label>

              <label style={{ display: "flex", gap: "12px", alignItems: "flex-start", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={settings.cardDiscountEnabled || false}
                  onChange={(e) => {
                    const updates = { cardDiscountEnabled: e.target.checked };
                    if (!e.target.checked) {
                      updates.cardDiscountType = "percentage";
                      updates.cardDiscountValue = 0;
                    }
                    handleUpdate(updates);
                  }}
                  style={{ width: "18px", height: "18px", marginTop: "3px", flexShrink: 0, cursor: "pointer" }}
                />
                <s-stack direction="block" gap="tight" style={{ flex: 1 }}>
                  <s-text variant="heading-sm">Enable discount on Pay with Card</s-text>
                  <s-text variant="body-sm" tone="subdued">
                    Offer a discount to customers who choose to pay with card instead of COD.
                  </s-text>
                </s-stack>
              </label>

              {settings.cardDiscountEnabled && (
                <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                  <s-stack direction="block" gap="base">
                    <div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
                      <div style={{ flex: 1 }}>
                        <s-text variant="body-sm" style={{ marginBottom: "4px" }}>Discount Type</s-text>
                        <select
                          value={settings.cardDiscountType || "percentage"}
                          onChange={(e) => handleUpdate({ cardDiscountType: e.target.value })}
                          style={{
                            width: "100%",
                            padding: "8px",
                            borderRadius: "6px",
                            border: "1px solid #ccc",
                            fontSize: "14px",
                          }}
                        >
                          <option value="percentage">Percentage (%)</option>
                          <option value="fixed">Fixed Amount</option>
                        </select>
                      </div>
                      <div style={{ flex: 1 }}>
                        <s-text variant="body-sm" style={{ marginBottom: "4px" }}>
                          {(settings.cardDiscountType || "percentage") === "percentage" ? "Discount (%)" : "Discount Amount"}
                        </s-text>
                        <input
                          type="number"
                          min="0"
                          max={settings.cardDiscountType === "percentage" ? 100 : undefined}
                          step="any"
                          value={settings.cardDiscountValue || ""}
                          onChange={(e) => handleUpdate({ cardDiscountValue: parseFloat(e.target.value) || 0 })}
                          placeholder={settings.cardDiscountType === "percentage" ? "e.g. 10" : "e.g. 50"}
                          style={{
                            width: "100%",
                            padding: "8px",
                            borderRadius: "6px",
                            border: "1px solid #ccc",
                            fontSize: "14px",
                          }}
                        />
                      </div>
                    </div>
                  </s-stack>
                </s-box>
              )}
            </>
          )}

          {!settings.enableCartPermalink && settings.hideCompleteOrderButton && (
            <s-box padding="base" borderWidth="base" borderRadius="base" background="critical-subdued">
              <s-text variant="body-sm" tone="critical">
                ⚠️ "Hide Complete Order button" is enabled but "Pay with Card" is disabled. The COD button will remain visible until Pay with Card is enabled.
              </s-text>
            </s-box>
          )}
        </s-stack>
      </s-section>

      {/* PayFast Setting */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>PayFast (Online Payment)</s-heading>
          <s-paragraph>
            Enable PayFast to let customers pay online directly from the Preventify form using their debit/credit card. Enter your PayFast Merchant ID and Secured Key from your PayFast merchant dashboard.
          </s-paragraph>

          <label style={{ display: "flex", gap: "12px", alignItems: "flex-start", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={settings.payfastEnabled || false}
              onChange={(e) => handleUpdate({ payfastEnabled: e.target.checked })}
              style={{ width: "18px", height: "18px", marginTop: "3px", flexShrink: 0, cursor: "pointer" }}
            />
            <s-stack direction="block" gap="tight" style={{ flex: 1 }}>
              <s-text variant="heading-sm">Enable PayFast payments</s-text>
              <s-text variant="body-sm" tone="subdued">
                When enabled, a "Pay with PayFast" button will appear below the COD button. Customers can pay online using their card without leaving your store.
              </s-text>
            </s-stack>
          </label>

          {settings.payfastEnabled && (
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-stack direction="block" gap="base">
                <div>
                  <s-text variant="heading-sm">PayFast Merchant ID</s-text>
                  <input
                    type="text"
                    value={settings.payfastMerchantId || ""}
                    onChange={(e) => handleUpdate({ payfastMerchantId: e.target.value })}
                    placeholder="Enter your PayFast Merchant ID"
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #ccc", marginTop: "6px", fontSize: "14px", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <s-text variant="heading-sm">PayFast Secured Key</s-text>
                  <input
                    type="password"
                    value={settings.payfastSecuredKey || ""}
                    onChange={(e) => handleUpdate({ payfastSecuredKey: e.target.value })}
                    placeholder="Enter your PayFast Secured Key"
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #ccc", marginTop: "6px", fontSize: "14px", boxSizing: "border-box" }}
                  />
                </div>

                <div style={{ borderTop: "1px solid #e0e0e0", paddingTop: "12px" }}>
                  <s-text variant="heading-sm">Button Customization</s-text>
                </div>

                <div>
                  <s-text variant="body-sm" tone="subdued">Button Text</s-text>
                  <input
                    type="text"
                    value={settings.payfastButtonText || "PAY WITH PAYFAST"}
                    onChange={(e) => handleUpdate({ payfastButtonText: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #ccc", marginTop: "6px", fontSize: "14px", boxSizing: "border-box" }}
                  />
                </div>

                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: "120px" }}>
                    <s-text variant="body-sm" tone="subdued">Button Color</s-text>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px" }}>
                      <input
                        type="color"
                        value={settings.payfastButtonBgColor || "#00B140"}
                        onChange={(e) => handleUpdate({ payfastButtonBgColor: e.target.value })}
                        style={{ width: "36px", height: "36px", border: "none", padding: "0", cursor: "pointer", borderRadius: "4px" }}
                      />
                      <span style={{ fontSize: "13px", color: "#666" }}>{settings.payfastButtonBgColor || "#00B140"}</span>
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: "120px" }}>
                    <s-text variant="body-sm" tone="subdued">Text Color</s-text>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px" }}>
                      <input
                        type="color"
                        value={settings.payfastButtonTextColor || "#FFFFFF"}
                        onChange={(e) => handleUpdate({ payfastButtonTextColor: e.target.value })}
                        style={{ width: "36px", height: "36px", border: "none", padding: "0", cursor: "pointer", borderRadius: "4px" }}
                      />
                      <span style={{ fontSize: "13px", color: "#666" }}>{settings.payfastButtonTextColor || "#FFFFFF"}</span>
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: "120px" }}>
                    <s-text variant="body-sm" tone="subdued">Font Size (px)</s-text>
                    <input
                      type="number"
                      value={settings.payfastButtonFontSize || 14}
                      onChange={(e) => handleUpdate({ payfastButtonFontSize: parseInt(e.target.value) || 14 })}
                      min="10"
                      max="24"
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #ccc", marginTop: "6px", fontSize: "14px", boxSizing: "border-box" }}
                    />
                  </div>
                </div>

                <s-box padding="base" borderWidth="base" borderRadius="base" background="info-subdued">
                  <s-text variant="body-sm">
                    ℹ️ Your PayFast credentials are stored securely and never exposed to the storefront. Obtain your Merchant ID and Secured Key from your PayFast merchant dashboard.
                  </s-text>
                </s-box>
              </s-stack>
            </s-box>
          )}
        </s-stack>
      </s-section>

      {/* Discount on Bundles Setting */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Discount Codes on Bundles</s-heading>
          <s-paragraph>
            Control whether customers can apply discount codes when they have bundle items in their cart.
          </s-paragraph>

          <label style={{ display: "flex", gap: "12px", alignItems: "flex-start", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={settings.allowDiscountOnBundles !== false}
              onChange={(e) => handleUpdate({ allowDiscountOnBundles: e.target.checked })}
              style={{ width: "18px", height: "18px", marginTop: "3px", flexShrink: 0, cursor: "pointer" }}
            />
            <s-stack direction="block" gap="tight" style={{ flex: 1 }}>
              <s-text variant="heading-sm">Allow discount codes on bundle orders</s-text>
              <s-text variant="body-sm" tone="subdued">
                When disabled, customers will not be able to apply discount codes if they have a bundle selected or bundle items in their cart. The recovery (downsell) discount will still work.
              </s-text>
            </s-stack>
          </label>
        </s-stack>
      </s-section>

      {/* Native Bundle Checkout Setting */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Native Bundle Checkout</s-heading>
          <s-paragraph>
            Use Preventify bundles as a full bundle platform. When enabled, on products
            with a bundle the COD button is hidden and customers add the selected tier
            through your theme's own Add to Cart, checking out via Shopify's native
            checkout. The tier discount is applied automatically by the bundle discount.
          </s-paragraph>

          <label style={{ display: "flex", gap: "12px", alignItems: "flex-start", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={settings.nativeBundleCheckout || false}
              onChange={(e) => handleUpdate({ nativeBundleCheckout: e.target.checked })}
              style={{ width: "18px", height: "18px", marginTop: "3px", flexShrink: 0, cursor: "pointer" }}
            />
            <s-stack direction="block" gap="tight" style={{ flex: 1 }}>
              <s-text variant="heading-sm">Enable native bundle checkout</s-text>
              <s-text variant="body-sm" tone="subdued">
                Requires a published bundle. The COD form is only hidden on products that
                have a bundle — other products keep the COD button. Note: variant-mix
                bundles are not yet supported in this mode and should use the COD form.
              </s-text>
            </s-stack>
          </label>

          {settings.nativeBundleCheckout && (
            <>
              <s-stack direction="block" gap="tight">
                <s-text variant="heading-sm">Countries using native bundle checkout</s-text>
                <s-text variant="body-sm" tone="subdued">
                  Leave empty to apply everywhere. Add countries to use native bundle
                  checkout only there — visitors from other countries keep the COD form
                  on bundle products. Native mode and the COD form never both appear.
                </s-text>
                <div style={{ position: 'relative' }} ref={nativeBundleSearchRef}>
                  <input
                    type="text"
                    value={nativeBundleSearch}
                    onChange={(e) => setNativeBundleSearch(e.target.value)}
                    onFocus={() => setShowNativeBundleDropdown(true)}
                    placeholder="Search countries (leave empty for all)"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                  {showNativeBundleDropdown && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0,
                      backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '6px',
                      marginTop: '4px', maxHeight: '200px', overflowY: 'auto', zIndex: 100,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    }}>
                      {COUNTRY_OPTIONS
                        .filter(c =>
                          c.label.toLowerCase().includes(nativeBundleSearch.toLowerCase()) &&
                          !(settings.nativeBundleCountries || []).includes(c.value)
                        )
                        .map(country => (
                          <div
                            key={country.value}
                            onClick={() => {
                              handleUpdate({ nativeBundleCountries: [...(settings.nativeBundleCountries || []), country.value] });
                              setNativeBundleSearch('');
                              setShowNativeBundleDropdown(false);
                            }}
                            style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                            onMouseEnter={(e) => e.target.style.backgroundColor = '#f5f5f5'}
                            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                          >
                            {country.label}
                          </div>
                        ))}
                      {COUNTRY_OPTIONS.filter(c =>
                        c.label.toLowerCase().includes(nativeBundleSearch.toLowerCase()) &&
                        !(settings.nativeBundleCountries || []).includes(c.value)
                      ).length === 0 && (
                        <div style={{ padding: '10px 12px', color: '#999' }}>No countries found</div>
                      )}
                    </div>
                  )}
                </div>
              </s-stack>

              {(settings.nativeBundleCountries || []).length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {settings.nativeBundleCountries.map(code => {
                    const country = COUNTRY_OPTIONS.find(c => c.value === code);
                    return (
                      <div key={code} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', backgroundColor: '#f5f5f5', borderRadius: '20px', fontSize: '14px' }}>
                        <span>{country?.label || code}</span>
                        <button
                          onClick={() => handleUpdate({ nativeBundleCountries: settings.nativeBundleCountries.filter(c => c !== code) })}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280', fontSize: '16px', lineHeight: 1, padding: 0 }}
                          aria-label={`Remove ${country?.label || code}`}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                  <s-text variant="body-sm">No countries selected — native bundle checkout applies in all countries.</s-text>
                </s-box>
              )}
            </>
          )}
        </s-stack>
      </s-section>

      {/* Smart Checkout Setting */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Smart Checkout</s-heading>
          <s-paragraph>
            Enable a 2-step checkout experience with device recognition, returning buyer detection, and address auto-fill for trusted customers.
          </s-paragraph>

          <label style={{ display: "flex", gap: "12px", alignItems: "flex-start", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={settings.enableSmartCheckout || false}
              onChange={(e) => handleUpdate({ enableSmartCheckout: e.target.checked })}
              style={{ width: "18px", height: "18px", marginTop: "3px", flexShrink: 0, cursor: "pointer" }}
            />
            <s-stack direction="block" gap="tight" style={{ flex: 1 }}>
              <s-text variant="heading-sm">Enable Smart Checkout</s-text>
              <s-text variant="body-sm" tone="subdued">
                When enabled, customers first enter their phone number, then see a personalized checkout with saved addresses and one-tap ordering. When disabled, all fields are shown at once (standard 1-step form).
              </s-text>
            </s-stack>
          </label>
        </s-stack>
      </s-section>

      {/* OTP Verification Setting */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>OTP Verification</s-heading>
          <s-paragraph>
            Require customers to verify their phone number via SMS OTP before placing a COD order. This helps reduce fake orders and RTOs.
          </s-paragraph>

          <label style={{ display: "flex", gap: "12px", alignItems: "flex-start", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={settings.enableOTP || false}
              onChange={(e) => handleUpdate({ enableOTP: e.target.checked })}
              style={{ width: "18px", height: "18px", marginTop: "3px", flexShrink: 0, cursor: "pointer" }}
            />
            <s-stack direction="block" gap="tight" style={{ flex: 1 }}>
              <s-text variant="heading-sm">Enable OTP Verification</s-text>
              <s-text variant="body-sm" tone="subdued">
                When enabled, customers must verify their phone number with a 6-digit code sent via SMS before their order is placed. Returning customers will have their address auto-filled.
              </s-text>
            </s-stack>
          </label>

          {settings.enableOTP && (
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-text variant="body-sm">
                ℹ️ OTP is sent via SMS when the customer clicks "Complete Order". They must enter the 6-digit code to confirm. Rate limited to 3 OTPs per phone every 15 minutes. OTP expires after 5 minutes.
              </s-text>
            </s-box>
          )}
        </s-stack>
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

          {/* Sticky Bar (mobile) */}
          <s-section>
            <s-stack direction="block" gap="base">
              <s-heading>Sticky Order Bar (Mobile)</s-heading>
              <s-paragraph>
                Show a sticky bar on mobile that stays in view as the customer scrolls, so they can open the COD form without scrolling back to the button. Uses your COD button's text, icon, and colors.
              </s-paragraph>

              <label style={{ display: "flex", gap: "12px", alignItems: "flex-start", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={settings.stickyBarEnabled || false}
                  onChange={(e) => handleUpdate({ stickyBarEnabled: e.target.checked })}
                  style={{ width: "18px", height: "18px", marginTop: "3px", flexShrink: 0, cursor: "pointer" }}
                />
                <div>
                  <div style={{ fontWeight: "600", fontSize: "14px" }}>Enable sticky bar on mobile</div>
                  <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "2px" }}>
                    Appears on mobile devices only. Tapping it opens the COD form.
                  </div>
                </div>
              </label>

              {settings.stickyBarEnabled && (
                <s-box padding="base" borderWidth="base" borderRadius="base">
                  <s-stack direction="block" gap="base">
                    {/* Position */}
                    <s-stack direction="block" gap="tight">
                      <s-text variant="heading-sm">Position</s-text>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {["bottom", "top"].map((pos) => (
                          <button
                            key={pos}
                            type="button"
                            onClick={() => handleUpdate({ stickyBarPosition: pos })}
                            style={{
                              flex: 1,
                              padding: "8px",
                              textTransform: "capitalize",
                              borderRadius: "6px",
                              border: (settings.stickyBarPosition || "bottom") === pos ? "2px solid #000" : "1px solid #d1d5db",
                              backgroundColor: (settings.stickyBarPosition || "bottom") === pos ? "#f5f5f5" : "#fff",
                              cursor: "pointer",
                              fontSize: "13px",
                              fontWeight: (settings.stickyBarPosition || "bottom") === pos ? "600" : "400",
                            }}
                          >
                            {pos}
                          </button>
                        ))}
                      </div>
                    </s-stack>

                    {/* Visibility behavior */}
                    <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={settings.stickyBarAlwaysVisible !== false}
                        onChange={(e) => handleUpdate({ stickyBarAlwaysVisible: e.target.checked })}
                        style={{ width: "18px", height: "18px" }}
                      />
                      <span style={{ fontSize: "14px" }}>
                        Always visible
                        <span style={{ display: "block", fontSize: "12px", color: "#6b7280" }}>
                          When off, the bar appears only after the customer scrolls down the page.
                        </span>
                      </span>
                    </label>
                  </s-stack>
                </s-box>
              )}
            </s-stack>
          </s-section>

          {/* Country Restriction */}
          <s-section>
            <s-stack direction="block" gap="base">
              <s-heading>Restrict by Country</s-heading>
              <s-text variant="body-sm" tone="subdued">
                Only show the COD form to visitors from the countries you choose (detected by IP). Visitors from other countries see your normal Shopify checkout. If a visitor&apos;s country can&apos;t be determined, the form is shown.
              </s-text>

              <label style={{ display: "flex", gap: "12px", alignItems: "flex-start", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={settings.enableCountryRestriction || false}
                  onChange={(e) => handleUpdate({ enableCountryRestriction: e.target.checked })}
                  style={{ width: "18px", height: "18px", marginTop: "3px", flexShrink: 0, cursor: "pointer" }}
                />
                <div>
                  <div style={{ fontWeight: "600", fontSize: "14px" }}>Enable country restriction</div>
                  <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "2px" }}>
                    When enabled, the COD form only appears for the allowed countries below.
                  </div>
                </div>
              </label>

              {settings.enableCountryRestriction && (
                <>
                  <s-stack direction="block" gap="tight">
                    <s-text variant="heading-sm">Allowed countries</s-text>
                    <div style={{ position: 'relative' }} ref={allowedSearchRef}>
                      <input
                        type="text"
                        value={allowedSearch}
                        onChange={(e) => setAllowedSearch(e.target.value)}
                        onFocus={() => setShowAllowedDropdown(true)}
                        placeholder="Search countries to allow"
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px', boxSizing: 'border-box' }}
                      />
                      {showAllowedDropdown && (
                        <div style={{
                          position: 'absolute', top: '100%', left: 0, right: 0,
                          backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '6px',
                          marginTop: '4px', maxHeight: '200px', overflowY: 'auto', zIndex: 100,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        }}>
                          {COUNTRY_OPTIONS
                            .filter(c =>
                              c.label.toLowerCase().includes(allowedSearch.toLowerCase()) &&
                              !(settings.allowedCountries || []).includes(c.value)
                            )
                            .map(country => (
                              <div
                                key={country.value}
                                onClick={() => {
                                  handleUpdate({ allowedCountries: [...(settings.allowedCountries || []), country.value] });
                                  setAllowedSearch('');
                                  setShowAllowedDropdown(false);
                                }}
                                style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                                onMouseEnter={(e) => e.target.style.backgroundColor = '#f5f5f5'}
                                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                              >
                                {country.label}
                              </div>
                            ))}
                          {COUNTRY_OPTIONS.filter(c =>
                            c.label.toLowerCase().includes(allowedSearch.toLowerCase()) &&
                            !(settings.allowedCountries || []).includes(c.value)
                          ).length === 0 && (
                            <div style={{ padding: '10px 12px', color: '#999' }}>No countries found</div>
                          )}
                        </div>
                      )}
                    </div>
                  </s-stack>

                  {(settings.allowedCountries || []).length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {settings.allowedCountries.map(code => {
                        const country = COUNTRY_OPTIONS.find(c => c.value === code);
                        return (
                          <div key={code} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', backgroundColor: '#f5f5f5', borderRadius: '20px', fontSize: '14px' }}>
                            <span>{country?.label || code}</span>
                            <button
                              onClick={() => handleUpdate({ allowedCountries: settings.allowedCountries.filter(c => c !== code) })}
                              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280', fontSize: '16px', lineHeight: 1, padding: 0 }}
                              aria-label={`Remove ${country?.label || code}`}
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                      <s-text variant="body-sm">No countries selected — with restriction enabled and no allowed countries, the COD form is hidden everywhere. Add at least one country.</s-text>
                    </s-box>
                  )}
                </>
              )}
            </s-stack>
          </s-section>

          {/* Disable on Specific Products */}
          <s-section>
            <s-stack direction="block" gap="base">
              <s-heading>Disable on Specific Products</s-heading>

              {settings.enableSpecificProducts && (
                <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                  <s-text variant="body-sm">Cannot be used together with "Enable on Specific Products". Disable that feature first.</s-text>
                </s-box>
              )}

              <label style={{ display: "flex", gap: "12px", alignItems: "flex-start", cursor: settings.enableSpecificProducts ? "not-allowed" : "pointer", opacity: settings.enableSpecificProducts ? 0.5 : 1 }}>
                <input
                  type="checkbox"
                  checked={settings.disableSpecificProducts || false}
                  disabled={settings.enableSpecificProducts || false}
                  onChange={(e) => handleUpdate({ disableSpecificProducts: e.target.checked })}
                  style={{ width: "18px", height: "18px", marginTop: "3px", flexShrink: 0, cursor: settings.enableSpecificProducts ? "not-allowed" : "pointer" }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", color: "#6B7280" }}>
                    Hide the COD button on specific product pages and when those products are in the cart. All other products will still show the button.
                  </div>
                </div>
              </label>

              {settings.disableSpecificProducts && !settings.enableSpecificProducts && (
                <s-box padding="base" borderWidth="base" borderRadius="base">
                  <s-stack direction="block" gap="base">
                    <button
                      type="button"
                      onClick={handleSelectDisabledProducts}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "6px",
                        border: "1px solid #D1D5DB",
                        background: "#fff",
                        cursor: "pointer",
                        fontSize: "14px",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                      </svg>
                      {(settings.disabledProductTitles || []).length > 0 ? "Change products" : "Select products"}
                    </button>

                    {(settings.disabledProductTitles || []).length === 0 ? (
                      <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                        <s-text variant="body-sm">
                          No products selected. The COD button will show on all products until you select at least one to block.
                        </s-text>
                      </s-box>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {(settings.disabledProductTitles || []).map((title, i) => (
                          <span
                            key={i}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "4px 10px",
                              borderRadius: "20px",
                              background: "#FEE2E2",
                              color: "#991B1B",
                              fontSize: "13px",
                              fontWeight: 500,
                            }}
                          >
                            {title}
                            <button
                              type="button"
                              onClick={() => {
                                const ids = [...(settings.disabledProductIds || [])];
                                ids.splice(i, 1);
                                const titles = [...(settings.disabledProductTitles || [])];
                                titles.splice(i, 1);
                                handleUpdate({ disabledProductIds: ids, disabledProductTitles: titles });
                              }}
                              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "15px", lineHeight: "1", padding: "0 0 0 2px", color: "#991B1B" }}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </s-stack>
                </s-box>
              )}
            </s-stack>
          </s-section>

          {/* Enable on Specific Products */}
          <s-section>
            <s-stack direction="block" gap="base">
              <s-heading>Enable on Specific Products</s-heading>

              {settings.disableSpecificProducts && (
                <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                  <s-text variant="body-sm">Cannot be used together with "Disable on Specific Products". Disable that feature first.</s-text>
                </s-box>
              )}

              <label style={{ display: "flex", gap: "12px", alignItems: "flex-start", cursor: settings.disableSpecificProducts ? "not-allowed" : "pointer", opacity: settings.disableSpecificProducts ? 0.5 : 1 }}>
                <input
                  type="checkbox"
                  checked={settings.enableSpecificProducts || false}
                  disabled={settings.disableSpecificProducts || false}
                  onChange={(e) => handleUpdate({ enableSpecificProducts: e.target.checked })}
                  style={{ width: "18px", height: "18px", marginTop: "3px", flexShrink: 0, cursor: settings.disableSpecificProducts ? "not-allowed" : "pointer" }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", color: "#6B7280" }}>
                    Restrict the COD button to specific products only. When enabled, the button will appear only on the selected product pages and when those products are in the cart.
                  </div>
                </div>
              </label>

              {settings.enableSpecificProducts && (
                <s-box padding="base" borderWidth="base" borderRadius="base">
                  <s-stack direction="block" gap="base">
                    <button
                      type="button"
                      onClick={handleSelectSpecificProducts}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "6px",
                        border: "1px solid #D1D5DB",
                        backgroundColor: "#FFFFFF",
                        cursor: "pointer",
                        fontSize: "14px",
                        fontWeight: "500",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                      </svg>
                      {(settings.specificProductTitles || []).length > 0 ? "Change products" : "Select products"}
                    </button>

                    {(settings.specificProductTitles || []).length === 0 ? (
                      <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                        <s-text variant="body-sm">
                          No products selected. The COD button will be hidden on all pages until you select at least one product.
                        </s-text>
                      </s-box>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {(settings.specificProductTitles || []).map((title, i) => (
                          <span
                            key={i}
                            style={{
                              padding: "4px 10px",
                              backgroundColor: "#F3F4F6",
                              border: "1px solid #E5E7EB",
                              borderRadius: "16px",
                              fontSize: "13px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            {title}
                            <button
                              type="button"
                              onClick={() => {
                                const ids = [...(settings.specificProductIds || [])];
                                ids.splice(i, 1);
                                const titles = [...(settings.specificProductTitles || [])];
                                titles.splice(i, 1);
                                handleUpdate({ specificProductIds: ids, specificProductTitles: titles });
                              }}
                              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "15px", lineHeight: "1", padding: "0 0 0 2px", color: "#6B7280" }}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </s-stack>
                </s-box>
              )}
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

      {/* User Blocking Tab */}
      {activeTab === "fraud" && (
        <>
          {/* Order rate limit */}
          <s-section>
            <s-stack direction="block" gap="base">
              <label style={{ display: "flex", gap: "12px", alignItems: "flex-start", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={settings.limitOrdersEnabled || false}
                  onChange={(e) => handleUpdate({ limitOrdersEnabled: e.target.checked })}
                  style={{ width: "18px", height: "18px", marginTop: "3px", flexShrink: 0, cursor: "pointer" }}
                />
                <div>
                  <div style={{ fontWeight: "600", fontSize: "14px" }}>Limit orders made from the same customer in a time window</div>
                  <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "2px" }}>
                    To determine the customer we use a combination of email and phone number.
                  </div>
                </div>
              </label>

              {settings.limitOrdersEnabled && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "14px" }}>Allow only 1 order from the same customer in</span>
                  <select
                    value={settings.limitOrdersWindowMinutes || 1440}
                    onChange={(e) => handleUpdate({ limitOrdersWindowMinutes: parseInt(e.target.value, 10) })}
                    style={{ padding: "8px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "14px" }}
                  >
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={60}>1 hour</option>
                    <option value={120}>2 hours</option>
                    <option value={360}>6 hours</option>
                    <option value={720}>12 hours</option>
                    <option value={1440}>24 hours</option>
                    <option value={2880}>2 days</option>
                    <option value={4320}>3 days</option>
                    <option value={10080}>1 week</option>
                  </select>
                </div>
              )}
            </s-stack>
          </s-section>

          {/* High quantity block */}
          <s-section>
            <s-stack direction="block" gap="base">
              <label style={{ display: "flex", gap: "12px", alignItems: "flex-start", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={settings.blockHighQuantityEnabled || false}
                  onChange={(e) => handleUpdate({ blockHighQuantityEnabled: e.target.checked })}
                  style={{ width: "18px", height: "18px", marginTop: "3px", flexShrink: 0, cursor: "pointer" }}
                />
                <div>
                  <div style={{ fontWeight: "600", fontSize: "14px" }}>Block orders if they contain more than X quantity of products</div>
                </div>
              </label>

              {settings.blockHighQuantityEnabled && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "14px" }}>Orders will be blocked if the products quantity in the order is above:</span>
                  <input
                    type="number"
                    min={1}
                    value={settings.maxQuantityPerOrder ?? 10}
                    onChange={(e) => handleUpdate({ maxQuantityPerOrder: e.target.value === "" ? "" : parseInt(e.target.value, 10) })}
                    style={{ width: "90px", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "14px" }}
                  />
                </div>
              )}
            </s-stack>
          </s-section>

          <s-section>
            <s-stack direction="block" gap="base">
              <s-heading>User Blocking</s-heading>
              <s-text variant="body-sm" tone="subdued">
                Block specific emails and phone numbers from placing COD orders.
                Blocked users will see a custom message instead of completing their order.
              </s-text>

              <label style={{ display: "flex", gap: "12px", alignItems: "flex-start", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={settings.enableUserBlocking || false}
                  onChange={(e) => handleUpdate({ enableUserBlocking: e.target.checked })}
                  style={{ width: "18px", height: "18px", marginTop: "3px", flexShrink: 0, cursor: "pointer" }}
                />
                <div>
                  <div style={{ fontWeight: "600", fontSize: "14px" }}>Enable User Blocking</div>
                  <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "2px" }}>
                    When enabled, orders from blocked emails and phone numbers will be rejected.
                  </div>
                </div>
              </label>
            </s-stack>
          </s-section>

          {settings.enableUserBlocking && (
            <>
              <s-section>
                <s-stack direction="block" gap="base">
                  <s-heading>Block Message</s-heading>
                  <s-text variant="body-sm" tone="subdued">
                    This message is shown to blocked users when they try to place an order.
                  </s-text>
                  <input
                    type="text"
                    value={settings.blockedUserMessage || "You are not allowed to place orders. Please contact support."}
                    onChange={(e) => handleUpdate({ blockedUserMessage: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "6px",
                      border: "1px solid #ccc",
                      fontSize: "14px",
                      boxSizing: "border-box",
                    }}
                  />
                </s-stack>
              </s-section>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <s-section>
                  <s-stack direction="block" gap="base">
                    <s-heading>Emails to block</s-heading>
                    <s-text variant="body-sm" tone="subdued">
                      Enter email addresses to block, one per line.
                    </s-text>
                    <textarea
                      value={blockedEmails}
                      onChange={(e) => setBlockedEmails(e.target.value)}
                      placeholder={"spam@example.com\nfraud@test.com"}
                      rows={8}
                      style={{
                        width: "100%",
                        padding: "10px",
                        borderRadius: "6px",
                        border: "1px solid #ccc",
                        fontSize: "14px",
                        fontFamily: "monospace",
                        resize: "vertical",
                        boxSizing: "border-box",
                      }}
                    />
                    <s-text variant="body-sm" tone="subdued">
                      {blockedEmails.split('\n').filter(e => e.trim()).length} email(s) blocked
                    </s-text>
                  </s-stack>
                </s-section>

                <s-section>
                  <s-stack direction="block" gap="base">
                    <s-heading>Phone numbers to block</s-heading>
                    <s-text variant="body-sm" tone="subdued">
                      Enter phone numbers to block, one per line. Enter without country code.
                    </s-text>
                    <textarea
                      value={blockedPhones}
                      onChange={(e) => setBlockedPhones(e.target.value)}
                      placeholder={"03001234567\n03009876543"}
                      rows={8}
                      style={{
                        width: "100%",
                        padding: "10px",
                        borderRadius: "6px",
                        border: "1px solid #ccc",
                        fontSize: "14px",
                        fontFamily: "monospace",
                        resize: "vertical",
                        boxSizing: "border-box",
                      }}
                    />
                    <s-text variant="body-sm" tone="subdued">
                      {blockedPhones.split('\n').filter(p => p.trim()).length} phone number(s) blocked
                    </s-text>
                  </s-stack>
                </s-section>
              </div>
            </>
          )}
        </>
      )}

      {/* Google Sheets Tab */}
      {activeTab === "google-sheets" && (
        <GoogleSheetsIntegration
          initialIntegration={googleSheets}
          fieldCatalog={googleSheetsFieldCatalog}
          columnPresets={googleSheetsPresets}
        />
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

            {(pixelFormData.type === 'facebook_capi' || pixelFormData.type === 'tiktok_events_api') && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>Access Token</label>
                <input
                  type="password"
                  value={pixelFormData.accessToken}
                  onChange={(e) => setPixelFormData({ ...pixelFormData, accessToken: e.target.value })}
                  placeholder="Enter access token"
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                />
                <small style={{ color: '#666' }}>Required for {pixelFormData.type === 'facebook_capi' ? 'Conversions API' : 'TikTok Events API'}</small>
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
