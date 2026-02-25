import { useState, useEffect, useRef, useCallback } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  getOrCreateShop,
  getBundleById,
  createBundle,
  updateBundle,
  getDefaultBundle,
} from "../lib/db.server";
import { getCurrencySymbol } from "../lib/constants";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);
  const currencySymbol = getCurrencySymbol(shop.country);

  if (params.id === "new") {
    const defaultBundle = getDefaultBundle();
    return { bundle: defaultBundle, isNew: true, shopId: shop.id, currencySymbol };
  }

  const bundle = await getBundleById(params.id);
  if (!bundle || bundle.shopId !== shop.id) {
    throw new Response("Bundle not found", { status: 404 });
  }

  // Parse JSON fields
  const parsed = {
    ...bundle,
    tiers: typeof bundle.tiers === "string" ? JSON.parse(bundle.tiers) : bundle.tiers,
    styling: typeof bundle.styling === "string" ? JSON.parse(bundle.styling) : bundle.styling,
    productIds: typeof bundle.productIds === "string" ? JSON.parse(bundle.productIds) : bundle.productIds,
    productTitles: typeof bundle.productTitles === "string" ? JSON.parse(bundle.productTitles) : bundle.productTitles,
    collectionIds: typeof bundle.collectionIds === "string" ? JSON.parse(bundle.collectionIds) : bundle.collectionIds,
    collectionTitles: typeof bundle.collectionTitles === "string" ? JSON.parse(bundle.collectionTitles) : bundle.collectionTitles,
  };

  return { bundle: parsed, isNew: false, shopId: shop.id, currencySymbol };
};

export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  const bundleData = await request.json();
  const saveAction = bundleData._action;
  delete bundleData._action;

  // Remove non-saveable fields
  delete bundleData.id;
  delete bundleData.shopId;
  delete bundleData.createdAt;
  delete bundleData.updatedAt;
  delete bundleData.impressions;
  delete bundleData.accepts;

  // Stringify JSON fields for storage
  if (bundleData.tiers && typeof bundleData.tiers !== "string") {
    bundleData.tiers = JSON.stringify(bundleData.tiers);
  }
  if (bundleData.styling && typeof bundleData.styling !== "string") {
    bundleData.styling = JSON.stringify(bundleData.styling);
  }
  if (bundleData.productIds && typeof bundleData.productIds !== "string") {
    bundleData.productIds = JSON.stringify(bundleData.productIds);
  }
  if (bundleData.productTitles && typeof bundleData.productTitles !== "string") {
    bundleData.productTitles = JSON.stringify(bundleData.productTitles);
  }
  if (bundleData.collectionIds && typeof bundleData.collectionIds !== "string") {
    bundleData.collectionIds = JSON.stringify(bundleData.collectionIds);
  }
  if (bundleData.collectionTitles && typeof bundleData.collectionTitles !== "string") {
    bundleData.collectionTitles = JSON.stringify(bundleData.collectionTitles);
  }

  // Set status based on action
  if (saveAction === "publish") {
    bundleData.status = "published";
    bundleData.enabled = true;
  } else {
    bundleData.status = "draft";
    bundleData.enabled = false;
  }

  if (params.id === "new") {
    const newBundle = await createBundle(shop.id, bundleData);
    return Response.json({ success: true, bundle: newBundle });
  } else {
    const existing = await getBundleById(params.id);
    if (!existing || existing.shopId !== shop.id) {
      return Response.json({ error: "Bundle not found" }, { status: 404 });
    }
    const updated = await updateBundle(params.id, bundleData);
    return Response.json({ success: true, bundle: updated });
  }
};

// ============================================
// Tier price calculation (shared with storefront)
// ============================================
function calculateTierPrice(productPrice, tier) {
  const fullPrice = productPrice * tier.quantity;
  let discounted;
  switch (tier.discountType) {
    case "percentage": discounted = fullPrice * (1 - tier.discountValue / 100); break;
    case "flat": discounted = Math.max(0, fullPrice - tier.discountValue); break;
    case "specific": discounted = tier.discountValue; break;
    case "bogo": discounted = productPrice * (tier.quantity - 1); break;
    case "none": default: discounted = fullPrice;
  }
  if (tier.priceRounding) discounted = Math.floor(discounted) + (tier.priceRoundingValue || 0.99);
  return { fullPrice, discountedPrice: discounted, hasDiscount: discounted < fullPrice };
}

// ============================================
// COLOR PALETTES
// ============================================
const COLOR_PALETTES = [
  {
    id: "default",
    label: "Default",
    swatch: "#000000",
    colors: {
      headerText: { color: "#000000", fontSize: 16 },
      tierTitle: { color: "#000000", fontSize: 14 },
      badge: { bgColor: "#000000", textColor: "#ffffff", fontSize: 12 },
      price: { color: "#000000", fontSize: 16 },
      strikethroughPrice: { color: "#999999", fontSize: 14 },
      mostPopularTag: { bgColor: "#ff0000", textColor: "#ffffff", fontSize: 11 },
      selectedTier: { borderColor: "#000000", bgColor: "#f5f5f5" },
      unselectedTier: { borderColor: "#e0e0e0", bgColor: "#ffffff" },
    },
  },
  {
    id: "ocean",
    label: "Ocean",
    swatch: "#0077b6",
    colors: {
      headerText: { color: "#023e8a", fontSize: 16 },
      tierTitle: { color: "#023e8a", fontSize: 14 },
      badge: { bgColor: "#0077b6", textColor: "#ffffff", fontSize: 12 },
      price: { color: "#023e8a", fontSize: 16 },
      strikethroughPrice: { color: "#90e0ef", fontSize: 14 },
      mostPopularTag: { bgColor: "#00b4d8", textColor: "#ffffff", fontSize: 11 },
      selectedTier: { borderColor: "#0077b6", bgColor: "#caf0f8" },
      unselectedTier: { borderColor: "#90e0ef", bgColor: "#ffffff" },
    },
  },
  {
    id: "sunset",
    label: "Sunset",
    swatch: "#e63946",
    colors: {
      headerText: { color: "#1d3557", fontSize: 16 },
      tierTitle: { color: "#1d3557", fontSize: 14 },
      badge: { bgColor: "#e63946", textColor: "#ffffff", fontSize: 12 },
      price: { color: "#1d3557", fontSize: 16 },
      strikethroughPrice: { color: "#a8dadc", fontSize: 14 },
      mostPopularTag: { bgColor: "#e63946", textColor: "#ffffff", fontSize: 11 },
      selectedTier: { borderColor: "#e63946", bgColor: "#f1faee" },
      unselectedTier: { borderColor: "#a8dadc", bgColor: "#ffffff" },
    },
  },
  {
    id: "forest",
    label: "Forest",
    swatch: "#2d6a4f",
    colors: {
      headerText: { color: "#1b4332", fontSize: 16 },
      tierTitle: { color: "#1b4332", fontSize: 14 },
      badge: { bgColor: "#2d6a4f", textColor: "#ffffff", fontSize: 12 },
      price: { color: "#1b4332", fontSize: 16 },
      strikethroughPrice: { color: "#95d5b2", fontSize: 14 },
      mostPopularTag: { bgColor: "#40916c", textColor: "#ffffff", fontSize: 11 },
      selectedTier: { borderColor: "#2d6a4f", bgColor: "#d8f3dc" },
      unselectedTier: { borderColor: "#95d5b2", bgColor: "#ffffff" },
    },
  },
  {
    id: "purple",
    label: "Purple",
    swatch: "#7209b7",
    colors: {
      headerText: { color: "#3c096c", fontSize: 16 },
      tierTitle: { color: "#3c096c", fontSize: 14 },
      badge: { bgColor: "#7209b7", textColor: "#ffffff", fontSize: 12 },
      price: { color: "#3c096c", fontSize: 16 },
      strikethroughPrice: { color: "#c77dff", fontSize: 14 },
      mostPopularTag: { bgColor: "#9d4edd", textColor: "#ffffff", fontSize: 11 },
      selectedTier: { borderColor: "#7209b7", bgColor: "#e0aaff" },
      unselectedTier: { borderColor: "#c77dff", bgColor: "#ffffff" },
    },
  },
];

// ============================================
// COMPONENT
// ============================================
export default function BundleEditor() {
  const { bundle: initialBundle, isNew, currencySymbol } = useLoaderData();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const [bundle, setBundle] = useState(initialBundle);
  const [expandedSection, setExpandedSection] = useState(0);
  const [expandedTier, setExpandedTier] = useState(0);
  const [selectedPreviewTier, setSelectedPreviewTier] = useState(null);
  const [customizeSubTab, setCustomizeSubTab] = useState("style");

  const saveButtonRef = useRef(null);
  const publishButtonRef = useRef(null);
  const backButtonRef = useRef(null);

  const isSaving = fetcher.state === "submitting";

  // Handle successful save
  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(isNew ? "Bundle created!" : "Bundle saved!");
      navigate("/app/sales-booster/bundle");
    }
  }, [fetcher.data]);

  const handleSave = useCallback((action) => {
    fetcher.submit(
      JSON.stringify({ ...bundle, _action: action }),
      { method: "POST", encType: "application/json" }
    );
  }, [bundle, fetcher]);

  const handleSaveDraft = useCallback(() => handleSave("draft"), [handleSave]);
  const handlePublish = useCallback(() => handleSave("publish"), [handleSave]);
  const handleBack = useCallback(() => navigate("/app/sales-booster/bundle"), [navigate]);

  useEffect(() => {
    const saveBtn = saveButtonRef.current;
    const publishBtn = publishButtonRef.current;
    const backBtn = backButtonRef.current;

    if (saveBtn) saveBtn.addEventListener("click", handleSaveDraft);
    if (publishBtn) publishBtn.addEventListener("click", handlePublish);
    if (backBtn) backBtn.addEventListener("click", handleBack);

    return () => {
      if (saveBtn) saveBtn.removeEventListener("click", handleSaveDraft);
      if (publishBtn) publishBtn.removeEventListener("click", handlePublish);
      if (backBtn) backBtn.removeEventListener("click", handleBack);
    };
  }, [handleSaveDraft, handlePublish, handleBack]);

  // Helper to update bundle state
  const updateField = (field, value) => {
    setBundle((prev) => ({ ...prev, [field]: value }));
  };

  const updateTier = (tierIdx, field, value) => {
    setBundle((prev) => {
      const tiers = [...prev.tiers];
      tiers[tierIdx] = { ...tiers[tierIdx], [field]: value };
      return { ...prev, tiers };
    });
  };

  const addTier = () => {
    setBundle((prev) => {
      const newTier = {
        id: `tier-${Date.now()}`,
        order: prev.tiers.length,
        discountType: "percentage",
        discountValue: 10,
        quantity: prev.tiers.length + 1,
        priceRounding: false,
        priceRoundingValue: 0.99,
        titleText: `${prev.tiers.length + 1} Pair`,
        badgeText: "10% OFF",
        subtitle: "",
        showSubtitle: false,
        showBadge: true,
        showMostPopular: false,
        preselectTier: false,
      };
      return { ...prev, tiers: [...prev.tiers, newTier] };
    });
  };

  const removeTier = (tierIdx) => {
    if (bundle.tiers.length <= 1) return;
    setBundle((prev) => ({
      ...prev,
      tiers: prev.tiers.filter((_, i) => i !== tierIdx).map((t, i) => ({ ...t, order: i })),
    }));
    if (expandedTier >= bundle.tiers.length - 1) {
      setExpandedTier(Math.max(0, bundle.tiers.length - 2));
    }
  };

  const duplicateTier = (tierIdx) => {
    setBundle((prev) => {
      const source = prev.tiers[tierIdx];
      const newTier = { ...source, id: `tier-${Date.now()}`, order: prev.tiers.length };
      return { ...prev, tiers: [...prev.tiers, newTier] };
    });
  };

  const moveTier = (tierIdx, direction) => {
    const newIdx = tierIdx + direction;
    if (newIdx < 0 || newIdx >= bundle.tiers.length) return;
    setBundle((prev) => {
      const tiers = [...prev.tiers];
      [tiers[tierIdx], tiers[newIdx]] = [tiers[newIdx], tiers[tierIdx]];
      return { ...prev, tiers: tiers.map((t, i) => ({ ...t, order: i })) };
    });
    setExpandedTier(newIdx);
  };

  const updateStyling = (field, value) => {
    setBundle((prev) => ({
      ...prev,
      styling: { ...prev.styling, [field]: value },
    }));
  };

  const updateStylingColor = (group, field, value) => {
    setBundle((prev) => ({
      ...prev,
      styling: {
        ...prev.styling,
        colors: {
          ...prev.styling.colors,
          [group]: { ...prev.styling.colors[group], [field]: value },
        },
      },
    }));
  };

  const applyColorPalette = (palette) => {
    setBundle((prev) => ({
      ...prev,
      styling: {
        ...prev.styling,
        colorPalette: palette.id,
        colors: { ...palette.colors },
      },
    }));
  };

  // Resource picker for products
  const handleSelectProducts = async () => {
    try {
      const selected = await shopify.resourcePicker({
        type: "product",
        multiple: true,
        selectionIds: (bundle.productIds || []).map((id) => ({ id })),
      });
      if (selected) {
        updateField("productIds", selected.map((p) => p.id));
        updateField("productTitles", selected.map((p) => p.title));
      }
    } catch (e) {
      // User cancelled
    }
  };

  const handleSelectCollections = async () => {
    try {
      const selected = await shopify.resourcePicker({
        type: "collection",
        multiple: true,
        selectionIds: (bundle.collectionIds || []).map((id) => ({ id })),
      });
      if (selected) {
        updateField("collectionIds", selected.map((c) => c.id));
        updateField("collectionTitles", selected.map((c) => c.title));
      }
    } catch (e) {
      // User cancelled
    }
  };

  const styling = bundle.styling || {};
  const colors = styling.colors || {};
  const samplePrice = 100;

  // Discount type options
  const discountTypes = [
    { id: "percentage", label: "% Off" },
    { id: "flat", label: "Flat" },
    { id: "specific", label: "Specific" },
    { id: "bogo", label: "BOGO" },
    { id: "none", label: "None" },
  ];

  const sections = [
    { title: "Select Product & Basic Setup", icon: "📦" },
    { title: "Edit Tier Deals", icon: "🏷️" },
    { title: "Cherries on Top", icon: "🎨" },
  ];

  return (
    <s-page heading={isNew ? "Create Bundle Offer" : "Edit Bundle Offer"}>
      <s-button ref={backButtonRef} slot="secondary-action" variant="tertiary">
        ← Back
      </s-button>

      <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
        {/* Left Column: Config */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Section 1: Product & Basic Setup */}
          <s-section>
            <s-box padding="loose" borderRadius="base">
              <button
                type="button"
                onClick={() => setExpandedSection(expandedSection === 0 ? -1 : 0)}
                style={{
                  width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                  background: "none", border: "none", cursor: "pointer", padding: "0",
                }}
              >
                <s-text variant="heading-md">{sections[0].icon} {sections[0].title}</s-text>
                <span>{expandedSection === 0 ? "▲" : "▼"}</span>
              </button>

              {expandedSection === 0 && (
                <div style={{ marginTop: "16px" }}>
                  <s-stack direction="block" gap="base">
                    {/* Deal Name */}
                    <div>
                      <label style={{ display: "block", fontWeight: "500", marginBottom: "4px", fontSize: "14px" }}>
                        Deal Name
                      </label>
                      <input
                        type="text"
                        value={bundle.name}
                        onChange={(e) => updateField("name", e.target.value)}
                        style={{
                          width: "100%", padding: "10px 12px", borderRadius: "6px",
                          border: "1px solid #d1d5db", fontSize: "14px", boxSizing: "border-box",
                        }}
                      />
                    </div>

                    {/* Header Text */}
                    <div>
                      <label style={{ display: "block", fontWeight: "500", marginBottom: "4px", fontSize: "14px" }}>
                        Header Text
                      </label>
                      <input
                        type="text"
                        value={bundle.headerText}
                        onChange={(e) => updateField("headerText", e.target.value)}
                        style={{
                          width: "100%", padding: "10px 12px", borderRadius: "6px",
                          border: "1px solid #d1d5db", fontSize: "14px", boxSizing: "border-box",
                        }}
                      />
                    </div>

                    {/* Hide Header Lines */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <input
                        type="checkbox"
                        checked={bundle.hideHeaderLines}
                        onChange={(e) => updateField("hideHeaderLines", e.target.checked)}
                      />
                      <label style={{ fontSize: "14px" }}>Hide lines around header text</label>
                    </div>

                    {/* Apply Deal On */}
                    <div>
                      <label style={{ display: "block", fontWeight: "500", marginBottom: "8px", fontSize: "14px" }}>
                        Apply Deal on
                      </label>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {[
                          { value: "all", label: "All Products" },
                          { value: "specific", label: "Specific selected product(s)" },
                          { value: "collections", label: "Products in selected collections" },
                        ].map((opt) => (
                          <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
                            <input
                              type="radio"
                              name="applyOn"
                              value={opt.value}
                              checked={bundle.applyOn === opt.value}
                              onChange={(e) => updateField("applyOn", e.target.value)}
                            />
                            {opt.label}
                          </label>
                        ))}
                      </div>

                      {/* Product picker */}
                      {bundle.applyOn === "specific" && (
                        <div style={{ marginTop: "12px" }}>
                          <button
                            type="button"
                            onClick={handleSelectProducts}
                            style={{
                              padding: "8px 16px", borderRadius: "6px", border: "1px solid #d1d5db",
                              backgroundColor: "#fff", cursor: "pointer", fontSize: "14px",
                            }}
                          >
                            Select Products
                          </button>
                          {(bundle.productTitles || []).length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                              {bundle.productTitles.map((title, i) => (
                                <span
                                  key={i}
                                  style={{
                                    padding: "4px 10px", backgroundColor: "#f3f4f6", borderRadius: "16px",
                                    fontSize: "13px", display: "flex", alignItems: "center", gap: "4px",
                                  }}
                                >
                                  {title}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const ids = [...bundle.productIds]; ids.splice(i, 1);
                                      const titles = [...bundle.productTitles]; titles.splice(i, 1);
                                      updateField("productIds", ids);
                                      updateField("productTitles", titles);
                                    }}
                                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", padding: "0 2px" }}
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Collection picker */}
                      {bundle.applyOn === "collections" && (
                        <div style={{ marginTop: "12px" }}>
                          <button
                            type="button"
                            onClick={handleSelectCollections}
                            style={{
                              padding: "8px 16px", borderRadius: "6px", border: "1px solid #d1d5db",
                              backgroundColor: "#fff", cursor: "pointer", fontSize: "14px",
                            }}
                          >
                            Select Collections
                          </button>
                          {(bundle.collectionTitles || []).length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                              {bundle.collectionTitles.map((title, i) => (
                                <span
                                  key={i}
                                  style={{
                                    padding: "4px 10px", backgroundColor: "#f3f4f6", borderRadius: "16px",
                                    fontSize: "13px", display: "flex", alignItems: "center", gap: "4px",
                                  }}
                                >
                                  {title}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const ids = [...bundle.collectionIds]; ids.splice(i, 1);
                                      const titles = [...bundle.collectionTitles]; titles.splice(i, 1);
                                      updateField("collectionIds", ids);
                                      updateField("collectionTitles", titles);
                                    }}
                                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", padding: "0 2px" }}
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Basic Setup Toggles */}
                    <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "16px", marginTop: "8px" }}>
                      <label style={{ display: "block", fontWeight: "500", marginBottom: "12px", fontSize: "14px" }}>
                        Basic Setup
                      </label>
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
                          <input type="checkbox" checked={bundle.allowVariantMix} onChange={(e) => updateField("allowVariantMix", e.target.checked)} />
                          Let customers choose different variants for each item
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
                          <input type="checkbox" checked={bundle.hideThemeVariants} onChange={(e) => updateField("hideThemeVariants", e.target.checked)} />
                          Hide Theme Variants
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
                          <input type="checkbox" checked={bundle.volumeDiscount} onChange={(e) => updateField("volumeDiscount", e.target.checked)} />
                          Volume Discount (Extend Max Discount to All Quantities)
                        </label>
                      </div>
                    </div>
                  </s-stack>
                </div>
              )}
            </s-box>
          </s-section>

          {/* Section 2: Tier Deals */}
          <div style={{ marginTop: "16px" }} />
          <s-section>
            <s-box padding="loose" borderRadius="base">
              <button
                type="button"
                onClick={() => setExpandedSection(expandedSection === 1 ? -1 : 1)}
                style={{
                  width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                  background: "none", border: "none", cursor: "pointer", padding: "0",
                }}
              >
                <s-text variant="heading-md">{sections[1].icon} {sections[1].title}</s-text>
                <span>{expandedSection === 1 ? "▲" : "▼"}</span>
              </button>

              {expandedSection === 1 && (
                <div style={{ marginTop: "16px" }}>
                  <s-stack direction="block" gap="base">
                    {bundle.tiers.map((tier, idx) => (
                      <div
                        key={tier.id}
                        style={{
                          border: "1px solid #e5e7eb",
                          borderRadius: "8px",
                          overflow: "hidden",
                        }}
                      >
                        {/* Tier header */}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "12px 16px",
                            backgroundColor: expandedTier === idx ? "#f9fafb" : "#fff",
                            cursor: "pointer",
                          }}
                          onClick={() => setExpandedTier(expandedTier === idx ? -1 : idx)}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ cursor: "grab", color: "#9ca3af" }}>⠿</span>
                            <s-text variant="heading-sm">Tier {idx + 1}: {tier.titleText}</s-text>
                          </div>
                          <div style={{ display: "flex", gap: "4px" }}>
                            <button type="button" onClick={(e) => { e.stopPropagation(); duplicateTier(idx); }} title="Duplicate" style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px" }}>📋</button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); moveTier(idx, -1); }} title="Move Up" style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", opacity: idx === 0 ? 0.3 : 1 }}>↑</button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); moveTier(idx, 1); }} title="Move Down" style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", opacity: idx === bundle.tiers.length - 1 ? 0.3 : 1 }}>↓</button>
                            {bundle.tiers.length > 1 && (
                              <button type="button" onClick={(e) => { e.stopPropagation(); removeTier(idx); }} title="Delete" style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", color: "#ef4444" }}>🗑️</button>
                            )}
                            <span>{expandedTier === idx ? "▲" : "▼"}</span>
                          </div>
                        </div>

                        {/* Tier body */}
                        {expandedTier === idx && (
                          <div style={{ padding: "16px", borderTop: "1px solid #e5e7eb" }}>
                            <s-stack direction="block" gap="base">
                              {/* Discount Type */}
                              <div>
                                <label style={{ display: "block", fontWeight: "500", marginBottom: "8px", fontSize: "14px" }}>
                                  Select Discount Type
                                </label>
                                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                                  {discountTypes.map((dt) => (
                                    <button
                                      key={dt.id}
                                      type="button"
                                      onClick={() => updateTier(idx, "discountType", dt.id)}
                                      style={{
                                        padding: "6px 14px",
                                        borderRadius: "20px",
                                        border: tier.discountType === dt.id ? "2px solid #000" : "1px solid #d1d5db",
                                        backgroundColor: tier.discountType === dt.id ? "#000" : "#fff",
                                        color: tier.discountType === dt.id ? "#fff" : "#374151",
                                        cursor: "pointer",
                                        fontSize: "13px",
                                        fontWeight: "500",
                                      }}
                                    >
                                      {dt.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Discount Value + Quantity */}
                              <div style={{ display: "flex", gap: "12px" }}>
                                {tier.discountType !== "none" && tier.discountType !== "bogo" && (
                                  <div style={{ flex: 1 }}>
                                    <label style={{ display: "block", fontWeight: "500", marginBottom: "4px", fontSize: "14px" }}>
                                      {tier.discountType === "percentage" ? "Discount in %" : tier.discountType === "flat" ? "Flat Discount" : "Specific Price"}
                                    </label>
                                    <input
                                      type="number"
                                      value={tier.discountValue}
                                      onChange={(e) => updateTier(idx, "discountValue", parseFloat(e.target.value) || 0)}
                                      style={{ width: "100%", padding: "10px 12px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px", boxSizing: "border-box" }}
                                    />
                                  </div>
                                )}
                                <div style={{ flex: 1 }}>
                                  <label style={{ display: "block", fontWeight: "500", marginBottom: "4px", fontSize: "14px" }}>Total Quantity</label>
                                  <input
                                    type="number"
                                    min="1"
                                    value={tier.quantity}
                                    onChange={(e) => updateTier(idx, "quantity", parseInt(e.target.value) || 1)}
                                    style={{ width: "100%", padding: "10px 12px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px", boxSizing: "border-box" }}
                                  />
                                </div>
                              </div>

                              {/* Price Rounding */}
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <input type="checkbox" checked={tier.priceRounding} onChange={(e) => updateTier(idx, "priceRounding", e.target.checked)} />
                                <label style={{ fontSize: "14px" }}>Price Rounding (.99)</label>
                                {tier.priceRounding && (
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={tier.priceRoundingValue}
                                    onChange={(e) => updateTier(idx, "priceRoundingValue", parseFloat(e.target.value) || 0.99)}
                                    style={{ width: "80px", padding: "6px 8px", borderRadius: "4px", border: "1px solid #d1d5db", fontSize: "13px" }}
                                  />
                                )}
                              </div>

                              {/* Title Text */}
                              <div>
                                <label style={{ display: "block", fontWeight: "500", marginBottom: "4px", fontSize: "14px" }}>Title Text</label>
                                <input
                                  type="text"
                                  value={tier.titleText}
                                  onChange={(e) => updateTier(idx, "titleText", e.target.value)}
                                  style={{ width: "100%", padding: "10px 12px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px", boxSizing: "border-box" }}
                                />
                              </div>

                              {/* Badge */}
                              <div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
                                <div style={{ flex: 1 }}>
                                  <label style={{ display: "block", fontWeight: "500", marginBottom: "4px", fontSize: "14px" }}>Badge Text</label>
                                  <input
                                    type="text"
                                    value={tier.badgeText}
                                    onChange={(e) => updateTier(idx, "badgeText", e.target.value)}
                                    style={{ width: "100%", padding: "10px 12px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px", boxSizing: "border-box" }}
                                  />
                                </div>
                                <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "14px", paddingBottom: "10px" }}>
                                  <input type="checkbox" checked={tier.showBadge} onChange={(e) => updateTier(idx, "showBadge", e.target.checked)} />
                                  Show
                                </label>
                              </div>

                              {/* Subtitle */}
                              <div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
                                <div style={{ flex: 1 }}>
                                  <label style={{ display: "block", fontWeight: "500", marginBottom: "4px", fontSize: "14px" }}>Subtitle</label>
                                  <input
                                    type="text"
                                    value={tier.subtitle}
                                    onChange={(e) => updateTier(idx, "subtitle", e.target.value)}
                                    style={{ width: "100%", padding: "10px 12px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px", boxSizing: "border-box" }}
                                  />
                                </div>
                                <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "14px", paddingBottom: "10px" }}>
                                  <input type="checkbox" checked={tier.showSubtitle} onChange={(e) => updateTier(idx, "showSubtitle", e.target.checked)} />
                                  Show
                                </label>
                              </div>

                              {/* Most Popular */}
                              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
                                <input type="checkbox" checked={tier.showMostPopular} onChange={(e) => updateTier(idx, "showMostPopular", e.target.checked)} />
                                Show "Most Popular" tag
                              </label>

                              {/* Pre-select tier */}
                              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
                                <input
                                  type="checkbox"
                                  checked={tier.preselectTier || false}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      // Unset all other tiers first
                                      setBundle((prev) => ({
                                        ...prev,
                                        tiers: prev.tiers.map((t, i) => ({
                                          ...t,
                                          preselectTier: i === idx,
                                        })),
                                      }));
                                    } else {
                                      updateTier(idx, "preselectTier", false);
                                    }
                                  }}
                                />
                                Pre-select this tier by default
                              </label>
                            </s-stack>
                          </div>
                        )}
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={addTier}
                      style={{
                        padding: "10px", border: "2px dashed #d1d5db", borderRadius: "8px",
                        backgroundColor: "#fff", cursor: "pointer", fontSize: "14px", fontWeight: "500",
                        color: "#6b7280", textAlign: "center",
                      }}
                    >
                      + Add Tier
                    </button>
                  </s-stack>
                </div>
              )}
            </s-box>
          </s-section>

          {/* Section 3: Cherries on Top */}
          <div style={{ marginTop: "16px" }} />
          <s-section>
            <s-box padding="loose" borderRadius="base">
              <button
                type="button"
                onClick={() => setExpandedSection(expandedSection === 2 ? -1 : 2)}
                style={{
                  width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                  background: "none", border: "none", cursor: "pointer", padding: "0",
                }}
              >
                <s-text variant="heading-md">{sections[2].icon} {sections[2].title}</s-text>
                <span>{expandedSection === 2 ? "▲" : "▼"}</span>
              </button>

              {expandedSection === 2 && (
                <div style={{ marginTop: "16px" }}>
                  {/* Sub-tabs */}
                  <div style={{ display: "flex", gap: "4px", marginBottom: "16px", borderBottom: "1px solid #e5e7eb" }}>
                    {[
                      { id: "settings", label: "⚙️ Settings" },
                      { id: "style", label: "🎨 Color & Style" },
                      { id: "customize", label: "📐 Customize" },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setCustomizeSubTab(tab.id)}
                        style={{
                          padding: "8px 16px", border: "none",
                          borderBottom: customizeSubTab === tab.id ? "2px solid #000" : "2px solid transparent",
                          backgroundColor: "transparent", fontWeight: customizeSubTab === tab.id ? "600" : "400",
                          cursor: "pointer", fontSize: "14px", color: customizeSubTab === tab.id ? "#000" : "#6b7280",
                        }}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Settings sub-tab */}
                  {customizeSubTab === "settings" && (
                    <div style={{ padding: "20px", textAlign: "center", color: "#9ca3af" }}>
                      <s-text tone="subdued">No advanced settings yet.</s-text>
                    </div>
                  )}

                  {/* Color & Style sub-tab */}
                  {customizeSubTab === "style" && (
                    <s-stack direction="block" gap="base">
                      {/* Layout */}
                      <div>
                        <label style={{ display: "block", fontWeight: "500", marginBottom: "8px", fontSize: "14px" }}>Template Layout</label>
                        <div style={{ display: "flex", gap: "8px" }}>
                          {["vertical", "horizontal"].map((layout) => (
                            <button
                              key={layout}
                              type="button"
                              onClick={() => updateStyling("layout", layout)}
                              style={{
                                padding: "10px 20px", borderRadius: "8px",
                                border: styling.layout === layout ? "2px solid #000" : "1px solid #d1d5db",
                                backgroundColor: styling.layout === layout ? "#f5f5f5" : "#fff",
                                cursor: "pointer", fontSize: "14px", fontWeight: "500",
                                textTransform: "capitalize",
                              }}
                            >
                              {layout}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Corner Roundness */}
                      <div>
                        <label style={{ display: "block", fontWeight: "500", marginBottom: "4px", fontSize: "14px" }}>
                          All corner roundness: {styling.cornerRoundness || 12}px
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="50"
                          value={styling.cornerRoundness || 12}
                          onChange={(e) => updateStyling("cornerRoundness", parseInt(e.target.value))}
                          style={{ width: "100%" }}
                        />
                      </div>

                      {/* Breathing Space */}
                      <div>
                        <label style={{ display: "block", fontWeight: "500", marginBottom: "4px", fontSize: "14px" }}>
                          Breathing space: {styling.breathingSpace || 12}px
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="24"
                          value={styling.breathingSpace || 12}
                          onChange={(e) => updateStyling("breathingSpace", parseInt(e.target.value))}
                          style={{ width: "100%" }}
                        />
                      </div>

                      {/* Color Palettes */}
                      <div>
                        <label style={{ display: "block", fontWeight: "500", marginBottom: "8px", fontSize: "14px" }}>Color Palettes</label>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          {COLOR_PALETTES.map((palette) => (
                            <button
                              key={palette.id}
                              type="button"
                              onClick={() => applyColorPalette(palette)}
                              title={palette.label}
                              style={{
                                width: "40px", height: "40px", borderRadius: "8px",
                                backgroundColor: palette.swatch, border: styling.colorPalette === palette.id ? "3px solid #000" : "2px solid #e5e7eb",
                                cursor: "pointer", transition: "border 0.2s",
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </s-stack>
                  )}

                  {/* Customize sub-tab */}
                  {customizeSubTab === "customize" && (
                    <s-stack direction="block" gap="base">
                      {[
                        { label: "Header Text", group: "headerText", fields: [{ f: "color", l: "Color", type: "color" }, { f: "fontSize", l: "Font Size", type: "number" }] },
                        { label: "Tier Title", group: "tierTitle", fields: [{ f: "color", l: "Color", type: "color" }, { f: "fontSize", l: "Font Size", type: "number" }] },
                        { label: "Badge", group: "badge", fields: [{ f: "bgColor", l: "Background", type: "color" }, { f: "textColor", l: "Text", type: "color" }, { f: "fontSize", l: "Font Size", type: "number" }] },
                        { label: "Price", group: "price", fields: [{ f: "color", l: "Color", type: "color" }, { f: "fontSize", l: "Font Size", type: "number" }] },
                        { label: "Strikethrough Price", group: "strikethroughPrice", fields: [{ f: "color", l: "Color", type: "color" }, { f: "fontSize", l: "Font Size", type: "number" }] },
                        { label: "Most Popular Tag", group: "mostPopularTag", fields: [{ f: "bgColor", l: "Background", type: "color" }, { f: "textColor", l: "Text", type: "color" }, { f: "fontSize", l: "Font Size", type: "number" }] },
                        { label: "Selected Tier", group: "selectedTier", fields: [{ f: "borderColor", l: "Border", type: "color" }, { f: "bgColor", l: "Background", type: "color" }] },
                        { label: "Unselected Tier", group: "unselectedTier", fields: [{ f: "borderColor", l: "Border", type: "color" }, { f: "bgColor", l: "Background", type: "color" }] },
                      ].map(({ label, group, fields }) => (
                        <div key={group} style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: "12px" }}>
                          <label style={{ display: "block", fontWeight: "500", marginBottom: "8px", fontSize: "14px" }}>{label}</label>
                          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                            {fields.map(({ f, l, type }) => (
                              <div key={f} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <label style={{ fontSize: "12px", color: "#6b7280" }}>{l}</label>
                                {type === "color" ? (
                                  <input
                                    type="color"
                                    value={colors[group]?.[f] || "#000000"}
                                    onChange={(e) => updateStylingColor(group, f, e.target.value)}
                                    style={{ width: "32px", height: "32px", border: "1px solid #d1d5db", borderRadius: "4px", cursor: "pointer", padding: "0" }}
                                  />
                                ) : (
                                  <input
                                    type="number"
                                    value={colors[group]?.[f] || 14}
                                    onChange={(e) => updateStylingColor(group, f, parseInt(e.target.value) || 14)}
                                    style={{ width: "60px", padding: "4px 6px", borderRadius: "4px", border: "1px solid #d1d5db", fontSize: "13px" }}
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </s-stack>
                  )}
                </div>
              )}
            </s-box>
          </s-section>

          {/* Bottom Action Bar */}
          <div style={{
            display: "flex",
            gap: "12px",
            justifyContent: "flex-end",
            padding: "16px 0",
          }}>
            <s-button ref={saveButtonRef} variant="secondary" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save as draft"}
            </s-button>
            <s-button ref={publishButtonRef} variant="primary" disabled={isSaving}>
              {isSaving ? "Publishing..." : "Publish"}
            </s-button>
          </div>
        </div>

        {/* Right Column: Live Preview */}
        <div style={{
          width: "360px",
          flexShrink: 0,
          position: "sticky",
          top: "20px",
        }}>
          <s-box padding="loose" borderRadius="base">
            <s-text variant="heading-sm">Live Preview</s-text>
            <div style={{ marginTop: "12px" }}>
              <BundlePreview
                bundle={bundle}
                currencySymbol={currencySymbol}
                samplePrice={samplePrice}
                selectedTierId={selectedPreviewTier}
                onTierSelect={setSelectedPreviewTier}
              />
            </div>
          </s-box>
        </div>
      </div>
    </s-page>
  );
}

// ============================================
// LIVE PREVIEW COMPONENT
// ============================================
function BundlePreview({ bundle, currencySymbol, samplePrice, selectedTierId, onTierSelect }) {
  const styling = bundle.styling || {};
  const colors = styling.colors || {};
  const tiers = bundle.tiers || [];
  const isHorizontal = styling.layout === "horizontal";
  const radius = styling.cornerRoundness || 12;
  const space = styling.breathingSpace || 12;

  // Use preselected tier as default if nothing is manually selected
  const preselectedTier = tiers.find(t => t.preselectTier);
  const effectiveSelectedId = selectedTierId || (preselectedTier ? preselectedTier.id : null);

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Header */}
      {bundle.headerText && (
        <div style={{
          textAlign: "center",
          marginBottom: `${space}px`,
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}>
          {!bundle.hideHeaderLines && <div style={{ flex: 1, height: "1px", backgroundColor: "#e5e7eb" }} />}
          <span style={{
            color: colors.headerText?.color || "#000",
            fontSize: `${colors.headerText?.fontSize || 16}px`,
            fontWeight: "600",
            whiteSpace: "nowrap",
          }}>
            {bundle.headerText}
          </span>
          {!bundle.hideHeaderLines && <div style={{ flex: 1, height: "1px", backgroundColor: "#e5e7eb" }} />}
        </div>
      )}

      {/* Tiers */}
      <div style={{
        display: "flex",
        flexDirection: isHorizontal ? "row" : "column",
        gap: `${space}px`,
        marginTop: isHorizontal && tiers.some(t => t.showMostPopular) ? "35px" : "0",
      }}>
        {tiers.map((tier) => {
          const isSelected = effectiveSelectedId === tier.id;
          const tierColors = isSelected ? colors.selectedTier : colors.unselectedTier;
          const { fullPrice, discountedPrice, hasDiscount } = calculateTierPrice(samplePrice, tier);

          return (
            <div
              key={tier.id}
              onClick={() => onTierSelect(tier.id)}
              style={{
                flex: isHorizontal ? 1 : "none",
                border: `2px solid ${tierColors?.borderColor || "#e0e0e0"}`,
                borderRadius: `${radius}px`,
                backgroundColor: tierColors?.bgColor || "#fff",
                padding: `${space}px`,
                paddingTop: isHorizontal && tier.showMostPopular ? `${space + 14}px` : `${space}px`,
                cursor: "pointer",
                position: "relative",
                transition: "all 0.2s",
              }}
            >
              {/* Most Popular Tag */}
              {tier.showMostPopular && (
                <div style={{
                  position: "absolute",
                  ...(isHorizontal
                    ? {
                        top: "-1px",
                        left: "50%",
                        transform: "translate(-50%, -100%)",
                        borderRadius: `${Math.min(radius, 8)}px ${Math.min(radius, 8)}px 0 0`,
                        padding: "4px 14px",
                      }
                    : {
                        top: "-10px",
                        right: "10px",
                        borderRadius: "4px",
                        padding: "2px 8px",
                      }),
                  backgroundColor: colors.mostPopularTag?.bgColor || "#ff0000",
                  color: colors.mostPopularTag?.textColor || "#fff",
                  fontSize: `${colors.mostPopularTag?.fontSize || 11}px`,
                  fontWeight: "600",
                  whiteSpace: "nowrap",
                }}>
                  Most Popular
                </div>
              )}

              {isHorizontal ? (
                /* Horizontal layout: vertically stacked card content */
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  textAlign: "center",
                }}>
                  {/* Radio circle */}
                  <div style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    border: `2px solid ${isSelected ? (colors.selectedTier?.borderColor || "#000") : "#ccc"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {isSelected && (
                      <div style={{
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        backgroundColor: colors.selectedTier?.borderColor || "#000",
                      }} />
                    )}
                  </div>

                  {/* Title */}
                  <span style={{
                    color: colors.tierTitle?.color || "#000",
                    fontSize: `${colors.tierTitle?.fontSize || 14}px`,
                    fontWeight: "600",
                  }}>
                    {tier.titleText}
                  </span>

                  {/* Badge */}
                  {tier.showBadge && tier.badgeText && (
                    <span style={{
                      backgroundColor: colors.badge?.bgColor || "#000",
                      color: colors.badge?.textColor || "#fff",
                      fontSize: `${colors.badge?.fontSize || 12}px`,
                      padding: "2px 8px",
                      borderRadius: "4px",
                      fontWeight: "500",
                    }}>
                      {tier.badgeText}
                    </span>
                  )}

                  {/* Subtitle */}
                  {tier.showSubtitle && tier.subtitle && (
                    <div style={{ fontSize: "12px", color: "#666" }}>
                      {tier.subtitle}
                    </div>
                  )}

                  {/* Price */}
                  <div>
                    <div style={{
                      color: colors.price?.color || "#000",
                      fontSize: `${colors.price?.fontSize || 16}px`,
                      fontWeight: "700",
                    }}>
                      {currencySymbol}{discountedPrice.toFixed(2)}
                    </div>
                    {hasDiscount && (
                      <div style={{
                        color: colors.strikethroughPrice?.color || "#999",
                        fontSize: `${colors.strikethroughPrice?.fontSize || 14}px`,
                        textDecoration: "line-through",
                      }}>
                        {currencySymbol}{fullPrice.toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Vertical layout: horizontal row content */
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}>
                  {/* Radio circle */}
                  <div style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    border: `2px solid ${isSelected ? (colors.selectedTier?.borderColor || "#000") : "#ccc"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {isSelected && (
                      <div style={{
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        backgroundColor: colors.selectedTier?.borderColor || "#000",
                      }} />
                    )}
                  </div>

                  {/* Tier content */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{
                        color: colors.tierTitle?.color || "#000",
                        fontSize: `${colors.tierTitle?.fontSize || 14}px`,
                        fontWeight: "600",
                      }}>
                        {tier.titleText}
                      </span>

                      {tier.showBadge && tier.badgeText && (
                        <span style={{
                          backgroundColor: colors.badge?.bgColor || "#000",
                          color: colors.badge?.textColor || "#fff",
                          fontSize: `${colors.badge?.fontSize || 12}px`,
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontWeight: "500",
                        }}>
                          {tier.badgeText}
                        </span>
                      )}
                    </div>

                    {tier.showSubtitle && tier.subtitle && (
                      <div style={{ fontSize: "12px", color: "#666", marginTop: "2px" }}>
                        {tier.subtitle}
                      </div>
                    )}
                  </div>

                  {/* Price */}
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{
                      color: colors.price?.color || "#000",
                      fontSize: `${colors.price?.fontSize || 16}px`,
                      fontWeight: "700",
                    }}>
                      {currencySymbol}{discountedPrice.toFixed(2)}
                    </div>
                    {hasDiscount && (
                      <div style={{
                        color: colors.strikethroughPrice?.color || "#999",
                        fontSize: `${colors.strikethroughPrice?.fontSize || 14}px`,
                        textDecoration: "line-through",
                      }}>
                        {currencySymbol}{fullPrice.toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
