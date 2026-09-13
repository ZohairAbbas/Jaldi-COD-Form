import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  getOrCreateShop,
  getBundleById,
  createBundle,
  updateBundle,
  getDefaultCombo,
  getShopByDomain,
} from "../lib/db.server";
import { ensureBundleDiscount } from "../lib/bundle-function.server";
import { getCurrencySymbol } from "../lib/constants";
import { syncStorefrontConfigByDomain } from "../lib/storefront-config.server";
import { COLOR_PALETTES, GRADIENT_PALETTES } from "../lib/bundle-palettes";
import {
  calculateComboPricing,
  validateCombo,
  COMBO_DISCOUNT_TYPES,
  COMBO_MIN_PRODUCTS,
  COMBO_MAX_PRODUCTS,
} from "../lib/combo-pricing";
import ComboWidget from "../storefront/ComboWidget";

/**
 * Look up the live price/title/image of each component product.
 *
 * comboItems deliberately stores no price: prices move, and a stale one in the
 * editor preview would not match what the storefront charges. Products that no
 * longer resolve come back missing, which is what surfaces the "this offer is
 * disabled" warning (a deleted component must never silently drop a line).
 */
async function fetchComponentProducts(admin, productIds) {
  if (!productIds.length) return {};

  try {
    const res = await admin.graphql(
      `#graphql
      query comboComponents($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            title
            handle
            status
            featuredImage { url }
            variants(first: 1) {
              nodes { id title price compareAtPrice availableForSale }
            }
          }
        }
      }`,
      { variables: { ids: productIds } },
    );
    const json = await res.json();

    const map = {};
    for (const node of json?.data?.nodes || []) {
      if (!node?.id) continue;
      const variant = node.variants?.nodes?.[0];
      map[node.id] = {
        title: node.title,
        handle: node.handle,
        status: node.status,
        image: node.featuredImage?.url || null,
        unitPrice: variant ? parseFloat(variant.price) : 0,
        compareAtPrice: variant?.compareAtPrice ? parseFloat(variant.compareAtPrice) : null,
        available: variant?.availableForSale ?? true,
      };
    }
    return map;
  } catch {
    // Best-effort: the editor still works, the preview just shows zero prices.
    return {};
  }
}

export const loader = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);
  const currencySymbol = getCurrencySymbol(shop.country);

  if (params.id === "new") {
    return {
      combo: getDefaultCombo(),
      isNew: true,
      shopId: shop.id,
      currencySymbol,
      componentProducts: {},
    };
  }

  const combo = await getBundleById(params.id);
  if (!combo || combo.shopId !== shop.id || combo.bundleType !== "combo") {
    throw new Response("Combo not found", { status: 404 });
  }

  const parseJson = (value, fallback) => {
    if (value == null) return fallback;
    if (typeof value !== "string") return value;
    try { return JSON.parse(value); } catch { return fallback; }
  };

  const parsed = {
    ...combo,
    comboItems: parseJson(combo.comboItems, []),
    comboTargetProductIds: parseJson(combo.comboTargetProductIds, []),
    styling: parseJson(combo.styling, {}),
    tiers: parseJson(combo.tiers, []),
    productIds: parseJson(combo.productIds, []),
    productTitles: parseJson(combo.productTitles, []),
    collectionIds: parseJson(combo.collectionIds, []),
    collectionTitles: parseJson(combo.collectionTitles, []),
  };

  const componentProducts = await fetchComponentProducts(
    admin,
    parsed.comboItems.map((i) => i.productId).filter(Boolean),
  );

  return { combo: parsed, isNew: false, shopId: shop.id, currencySymbol, componentProducts };
};

export const action = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  const comboData = await request.json();
  const saveAction = comboData._action;
  delete comboData._action;

  for (const field of ["id", "shopId", "createdAt", "updatedAt", "impressions", "accepts"]) {
    delete comboData[field];
  }

  // A draft may be incomplete, but publishing an invalid combo would render a
  // broken card on the storefront — so validate the same rules the editor shows.
  if (saveAction === "publish") {
    const errors = validateCombo(comboData);
    if (errors.length) {
      return Response.json({ error: errors.join(" ") }, { status: 400 });
    }
  }

  comboData.bundleType = "combo";
  // Only the products the merchant ticked, and only ones still in the combo.
  const itemIds = (comboData.comboItems || []).map((i) => i.productId);
  comboData.comboTargetProductIds = (comboData.comboTargetProductIds || []).filter((id) =>
    itemIds.includes(id),
  );
  // Mirror the component products into productIds so anything that reads a
  // bundle's targeting generically still sees which products are involved.
  comboData.productIds = itemIds;
  comboData.productTitles = (comboData.comboItems || []).map((i) => i.title);

  for (const field of ["comboItems", "comboTargetProductIds", "styling", "tiers", "productIds", "productTitles", "collectionIds", "collectionTitles"]) {
    if (comboData[field] && typeof comboData[field] !== "string") {
      comboData[field] = JSON.stringify(comboData[field]);
    }
  }

  comboData.comboDiscountValue = Number(comboData.comboDiscountValue) || 0;
  comboData.status = saveAction === "publish" ? "published" : "draft";
  comboData.enabled = saveAction === "publish";

  let result;
  if (params.id === "new") {
    const created = await createBundle(shop.id, comboData);
    result = Response.json({ success: true, combo: created });
  } else {
    const existing = await getBundleById(params.id);
    if (!existing || existing.shopId !== shop.id || existing.bundleType !== "combo") {
      return Response.json({ error: "Combo not found" }, { status: 404 });
    }
    const updated = await updateBundle(params.id, comboData);
    result = Response.json({ success: true, combo: updated });
  }

  await syncStorefrontConfigByDomain(admin, session.shop);

  // Push the combo into the native-checkout Discount Function config too, so a
  // shop running native checkout applies the same discount at Shopify's
  // checkout that the widget advertises. Reloads the shop so the config
  // reflects this save.
  const shopWithOffers = await getShopByDomain(session.shop);
  if (shopWithOffers) {
    await ensureBundleDiscount(admin, shopWithOffers);
  }
  return result;
};

// ============================================
// UI HELPERS
// ============================================
const INPUT_STYLE = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: "6px",
  border: "1px solid #d1d5db",
  fontSize: "14px",
  boxSizing: "border-box",
};

const CARD_STYLE = {
  border: "1px solid #e5e7eb",
  borderRadius: "10px",
  padding: "16px",
  backgroundColor: "#ffffff",
  marginBottom: "16px",
};

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: "14px" }}>
      <label style={{ display: "block", fontSize: "13px", fontWeight: "500", marginBottom: "5px", color: "#374151" }}>
        {label}
      </label>
      {children}
      {hint && (
        <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>{hint}</div>
      )}
    </div>
  );
}

function Checkbox({ checked, onChange, label }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", marginBottom: "10px", fontSize: "14px" }}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

// ============================================
// COMPONENT
// ============================================
export default function ComboEditor() {
  const { combo: initialCombo, isNew, currencySymbol, componentProducts: initialProducts } = useLoaderData();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const [combo, setCombo] = useState(initialCombo);
  // productId -> { title, image, unitPrice, compareAtPrice, available, status }
  // Loaded live; never persisted, so the preview can't drift from real prices.
  const [productData, setProductData] = useState(initialProducts || {});
  const [showErrors, setShowErrors] = useState(false);

  const saveButtonRef = useRef(null);
  const publishButtonRef = useRef(null);
  const backButtonRef = useRef(null);

  const items = useMemo(() => combo.comboItems || [], [combo.comboItems]);
  const errors = useMemo(() => validateCombo(combo), [combo]);

  // Components that no longer resolve (deleted / unpublished in Shopify). The
  // whole offer is withheld on the storefront rather than dropping a line, so
  // the merchant needs to see it here.
  const missingProducts = useMemo(
    () => items.filter((i) => {
      const data = productData[i.productId];
      return !data || data.status === "ARCHIVED";
    }),
    [items, productData],
  );

  const updateField = useCallback((field, value) => {
    setCombo((prev) => ({ ...prev, [field]: value }));
  }, []);

  const updateStyling = useCallback((field, value) => {
    setCombo((prev) => ({ ...prev, styling: { ...prev.styling, [field]: value } }));
  }, []);

  const applyPalette = useCallback((palette) => {
    setCombo((prev) => ({
      ...prev,
      styling: { ...prev.styling, colorPalette: palette.id, colors: { ...palette.colors } },
    }));
  }, []);

  const handleSave = useCallback((action) => {
    if (action === "publish" && errors.length) {
      setShowErrors(true);
      shopify.toast.show("Fix the highlighted problems before publishing", { isError: true });
      return;
    }
    fetcher.submit(
      JSON.stringify({ ...combo, _action: action }),
      { method: "POST", encType: "application/json" },
    );
  }, [combo, errors, fetcher, shopify]);

  const handleSaveDraft = useCallback(() => handleSave("draft"), [handleSave]);
  const handlePublish = useCallback(() => handleSave("publish"), [handleSave]);
  const handleBack = useCallback(() => navigate("/app/sales-booster/combo"), [navigate]);

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

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(isNew ? "Combo created!" : "Combo saved!");
      navigate("/app/sales-booster/combo");
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data]);

  // ---- Product selection -------------------------------------------------
  const handleSelectProducts = async () => {
    try {
      const selected = await shopify.resourcePicker({
        type: "product",
        multiple: COMBO_MAX_PRODUCTS,
        selectionIds: items.map((i) => ({ id: i.productId })),
      });
      if (!selected) return;

      // The picker can't select the same product twice, but a stale selection
      // list could still round-trip duplicates — dedupe defensively.
      const seen = new Set();
      const picked = selected.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      }).slice(0, COMBO_MAX_PRODUCTS);

      const existingById = Object.fromEntries(items.map((i) => [i.productId, i]));
      const nextItems = picked.map((p) => ({
        productId: p.id,
        handle: p.handle,
        title: p.title,
        image: p.images?.[0]?.originalSrc || p.images?.[0]?.src || null,
        // Keep the quantity the merchant already set for a product that stays.
        quantity: existingById[p.id]?.quantity || 1,
      }));

      const nextData = { ...productData };
      for (const p of picked) {
        const variant = p.variants?.[0];
        nextData[p.id] = {
          title: p.title,
          handle: p.handle,
          status: p.status || "ACTIVE",
          image: p.images?.[0]?.originalSrc || p.images?.[0]?.src || null,
          unitPrice: variant?.price != null ? parseFloat(variant.price) : (productData[p.id]?.unitPrice || 0),
          compareAtPrice: variant?.compareAtPrice != null ? parseFloat(variant.compareAtPrice) : null,
          available: variant?.availableForSale ?? true,
        };
      }
      setProductData(nextData);

      setCombo((prev) => {
        const previousTargets = prev.comboTargetProductIds || [];
        // A newly added product defaults to showing the widget on its own page;
        // a product that was already here keeps whatever the merchant chose.
        const nextTargets = nextItems
          .map((i) => i.productId)
          .filter((id) => (existingById[id] ? previousTargets.includes(id) : true));

        return { ...prev, comboItems: nextItems, comboTargetProductIds: nextTargets };
      });
    } catch {
      // Picker cancelled
    }
  };

  const updateItemQuantity = (index, quantity) => {
    setCombo((prev) => {
      const next = [...prev.comboItems];
      next[index] = { ...next[index], quantity: Math.max(1, Math.min(99, Number(quantity) || 1)) };
      return { ...prev, comboItems: next };
    });
  };

  const removeItem = (index) => {
    setCombo((prev) => {
      const removed = prev.comboItems[index];
      const next = prev.comboItems.filter((_, i) => i !== index);
      return {
        ...prev,
        comboItems: next,
        comboTargetProductIds: (prev.comboTargetProductIds || []).filter((id) => id !== removed.productId),
      };
    });
  };

  const moveItem = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    setCombo((prev) => {
      const next = [...prev.comboItems];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, comboItems: next };
    });
  };

  const toggleTarget = (productId, checked) => {
    setCombo((prev) => {
      const current = prev.comboTargetProductIds || [];
      return {
        ...prev,
        comboTargetProductIds: checked
          ? [...new Set([...current, productId])]
          : current.filter((id) => id !== productId),
      };
    });
  };

  // ---- Live preview ------------------------------------------------------
  const previewComponents = items.map((item) => {
    const data = productData[item.productId] || {};
    return {
      productId: item.productId,
      title: data.title || item.title,
      image: data.image || item.image,
      quantity: item.quantity,
      unitPrice: data.unitPrice || 0,
      compareAtPrice: data.compareAtPrice ?? null,
      outOfStock: data.available === false,
      stockMessage: "Product out of stock",
      variants: null,
    };
  });

  const previewPricing = calculateComboPricing(
    previewComponents.map((c) => ({
      unitPrice: c.unitPrice,
      quantity: c.quantity,
      compareAtPrice: c.compareAtPrice,
    })),
    combo.comboDiscountType,
    combo.comboDiscountValue,
  );

  const previewCombo = {
    headerText: combo.headerText,
    hideHeaderLines: combo.hideHeaderLines,
    highlightTag: combo.comboHighlightTag,
    showHighlightTag: combo.showComboHighlightTag,
    footerText: combo.comboFooterText,
    showCompareAt: combo.showComboCompareAt,
    styling: combo.styling,
  };

  const needsValue = combo.comboDiscountType !== "none";

  return (
    <s-page heading={isNew ? "Create Combo Offer" : "Edit Combo Offer"}>
      <s-button ref={backButtonRef} slot="secondary-action" variant="tertiary">← Back</s-button>
      <s-button ref={saveButtonRef} slot="secondary-action">Save as draft</s-button>
      <s-button ref={publishButtonRef} slot="primary-action" variant="primary">Publish</s-button>

      <s-section>
        <div className="pv-combo-editor" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 420px)", gap: "20px", alignItems: "start" }}>
          {/* ------------------------------- Settings ------------------------------- */}
          <div>
            {showErrors && errors.length > 0 && (
              <div style={{
                ...CARD_STYLE,
                borderColor: "#f5c2c0",
                backgroundColor: "#fff1f0",
                color: "#8e1f11",
              }}>
                <strong style={{ display: "block", marginBottom: "6px" }}>Fix these before publishing</strong>
                <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px" }}>
                  {errors.map((e) => <li key={e}>{e}</li>)}
                </ul>
              </div>
            )}

            {missingProducts.length > 0 && (
              <div style={{
                ...CARD_STYLE,
                borderColor: "#f7d9a0",
                backgroundColor: "#fffaf0",
                color: "#8a5a00",
              }}>
                <strong style={{ display: "block", marginBottom: "6px" }}>
                  {missingProducts.length} product{missingProducts.length > 1 ? "s are" : " is"} no longer available
                </strong>
                <div style={{ fontSize: "13px" }}>
                  {missingProducts.map((i) => i.title).join(", ")} could not be found in your store.
                  This combo will not show to customers until you replace {missingProducts.length > 1 ? "them" : "it"}.
                </div>
              </div>
            )}

            {/* General */}
            <div style={CARD_STYLE}>
              <h3 style={{ margin: "0 0 14px", fontSize: "16px", fontWeight: "600" }}>General</h3>

              <Field label="Offer name" hint="Internal only — customers never see this.">
                <input
                  style={INPUT_STYLE}
                  value={combo.name || ""}
                  onChange={(e) => updateField("name", e.target.value)}
                />
              </Field>

              <Field label="Combo title" hint="Shown above the combo card on the product page.">
                <input
                  style={INPUT_STYLE}
                  value={combo.headerText || ""}
                  onChange={(e) => updateField("headerText", e.target.value)}
                />
              </Field>

              <Checkbox
                checked={combo.hideHeaderLines}
                onChange={(v) => updateField("hideHeaderLines", v)}
                label="Hide the lines beside the title"
              />

              <Field
                label={`Products in this combo (${items.length}/${COMBO_MAX_PRODUCTS})`}
                hint={`Pick ${COMBO_MIN_PRODUCTS}–${COMBO_MAX_PRODUCTS} different products. Customers choose the variant on the card.`}
              >
                <button
                  type="button"
                  onClick={handleSelectProducts}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "6px",
                    border: "1px solid #d1d5db",
                    backgroundColor: "#f9fafb",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: "500",
                  }}
                >
                  {items.length ? "Change products" : "Select products"}
                </button>
              </Field>

              {items.length > 0 && (
                <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", overflow: "hidden" }}>
                  {items.map((item, index) => {
                    const data = productData[item.productId] || {};
                    const missing = !data.title;
                    return (
                      <div
                        key={item.productId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "10px",
                          borderBottom: index < items.length - 1 ? "1px solid #e5e7eb" : "none",
                          backgroundColor: missing ? "#fffaf0" : "#ffffff",
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <button
                            type="button"
                            onClick={() => moveItem(index, -1)}
                            disabled={index === 0}
                            aria-label="Move up"
                            style={{ border: "none", background: "none", cursor: index === 0 ? "default" : "pointer", opacity: index === 0 ? 0.3 : 1, fontSize: "11px", padding: 0 }}
                          >▲</button>
                          <button
                            type="button"
                            onClick={() => moveItem(index, 1)}
                            disabled={index === items.length - 1}
                            aria-label="Move down"
                            style={{ border: "none", background: "none", cursor: index === items.length - 1 ? "default" : "pointer", opacity: index === items.length - 1 ? 0.3 : 1, fontSize: "11px", padding: 0 }}
                          >▼</button>
                        </div>

                        <div style={{ width: "40px", height: "40px", flexShrink: 0, borderRadius: "4px", border: "1px solid #e5e7eb", overflow: "hidden", backgroundColor: "#fff" }}>
                          {(data.image || item.image) && (
                            <img src={data.image || item.image} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                          )}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "14px", fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {data.title || item.title}
                          </div>
                          <div style={{ fontSize: "12px", color: missing ? "#8a5a00" : "#6b7280" }}>
                            {missing
                              ? "No longer available in your store"
                              : `${currencySymbol}${(data.unitPrice || 0).toFixed(2)} each`}
                          </div>
                        </div>

                        <input
                          type="number"
                          min="1"
                          max="99"
                          value={item.quantity}
                          onChange={(e) => updateItemQuantity(index, e.target.value)}
                          aria-label={`Quantity of ${item.title}`}
                          style={{ width: "62px", padding: "6px 8px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px" }}
                        />

                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          title="Remove"
                          aria-label={`Remove ${item.title}`}
                          style={{ border: "1px solid #d1d5db", borderRadius: "6px", backgroundColor: "#fff", cursor: "pointer", padding: "6px 8px" }}
                        >
                          🗑️
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Discount */}
            <div style={CARD_STYLE}>
              <h3 style={{ margin: "0 0 14px", fontSize: "16px", fontWeight: "600" }}>Discount</h3>

              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 240px" }}>
                  <Field label="Discount type">
                    <select
                      style={INPUT_STYLE}
                      value={combo.comboDiscountType}
                      onChange={(e) => updateField("comboDiscountType", e.target.value)}
                    >
                      {COMBO_DISCOUNT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div style={{ flex: "1 1 160px" }}>
                  <Field
                    label="Discount value"
                    hint={
                      combo.comboDiscountType === "perUnitFlat"
                        ? "Taken off every unit — a product with quantity 2 gets twice this amount off."
                        : combo.comboDiscountType === "flat"
                          ? "Taken off the bundle total and split across the products."
                          : undefined
                    }
                  >
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={!needsValue}
                      style={{ ...INPUT_STYLE, backgroundColor: needsValue ? "#fff" : "#f3f4f6" }}
                      value={needsValue ? combo.comboDiscountValue : ""}
                      onChange={(e) => updateField("comboDiscountValue", e.target.value)}
                    />
                  </Field>
                </div>
              </div>

              <Checkbox
                checked={combo.showComboCompareAt}
                onChange={(v) => updateField("showComboCompareAt", v)}
                label="Show compare-at price crossed out"
              />
            </div>

            {/* Native checkout */}
            <div style={CARD_STYLE}>
              <h3 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: "600" }}>
                Native checkout
              </h3>
              <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#6b7280" }}>
                Only applies where you run Shopify&apos;s native checkout instead of the
                Cash on Delivery form. On the COD path the combo opens the form instead.
              </p>

              <Field
                label="After the customer adds this combo"
                hint="The discount is applied by Shopify at checkout either way."
              >
                <select
                  style={INPUT_STYLE}
                  value={combo.comboNativeAction || "stay"}
                  onChange={(e) => updateField("comboNativeAction", e.target.value)}
                >
                  <option value="stay">Stay on the page (show &ldquo;Added&rdquo;)</option>
                  <option value="cart">Go to the cart</option>
                  <option value="checkout">Go straight to checkout</option>
                </select>
              </Field>
            </div>

            {/* Where it shows */}
            <div style={CARD_STYLE}>
              <h3 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: "600" }}>
                Show on product page
              </h3>
              <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#6b7280" }}>
                Choose which of these products show the combo on their page. At least one.
              </p>

              {items.length === 0 ? (
                <div style={{ fontSize: "13px", color: "#6b7280" }}>Select products first.</div>
              ) : (
                items.map((item) => (
                  <Checkbox
                    key={item.productId}
                    checked={(combo.comboTargetProductIds || []).includes(item.productId)}
                    onChange={(v) => toggleTarget(item.productId, v)}
                    label={productData[item.productId]?.title || item.title}
                  />
                ))
              )}
            </div>

            {/* Wording */}
            <div style={CARD_STYLE}>
              <h3 style={{ margin: "0 0 14px", fontSize: "16px", fontWeight: "600" }}>Wording</h3>

              <Field
                label="Button text"
                hint="Leave empty to use your Cash on Delivery button text."
              >
                <input
                  style={INPUT_STYLE}
                  placeholder="Same as your COD button"
                  value={combo.comboCtaText || ""}
                  onChange={(e) => updateField("comboCtaText", e.target.value)}
                />
              </Field>

              <Field label="Footer text">
                <input
                  style={INPUT_STYLE}
                  value={combo.comboFooterText || ""}
                  onChange={(e) => updateField("comboFooterText", e.target.value)}
                />
              </Field>

              <Field label="Highlight tag">
                <input
                  style={INPUT_STYLE}
                  value={combo.comboHighlightTag || ""}
                  onChange={(e) => updateField("comboHighlightTag", e.target.value)}
                />
              </Field>

              <Checkbox
                checked={combo.showComboHighlightTag}
                onChange={(v) => updateField("showComboHighlightTag", v)}
                label="Show the highlight tag"
              />
              <Checkbox
                checked={combo.showStockWarning}
                onChange={(v) => updateField("showStockWarning", v)}
                label="Show a message when a product is out of stock"
              />
            </div>

            {/* Style */}
            <div style={CARD_STYLE}>
              <h3 style={{ margin: "0 0 14px", fontSize: "16px", fontWeight: "600" }}>Style</h3>

              <Field label="Colour theme">
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {[...COLOR_PALETTES, ...GRADIENT_PALETTES].map((palette) => {
                    const active = combo.styling?.colorPalette === palette.id;
                    return (
                      <button
                        key={palette.id}
                        type="button"
                        onClick={() => applyPalette(palette)}
                        title={palette.label}
                        aria-label={palette.label}
                        aria-pressed={active}
                        style={{
                          width: "34px",
                          height: "34px",
                          borderRadius: "8px",
                          border: active ? "3px solid #111827" : "1px solid #d1d5db",
                          background: palette.swatch,
                          cursor: "pointer",
                          padding: 0,
                        }}
                      />
                    );
                  })}
                </div>
              </Field>

              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 160px" }}>
                  <Field label={`Corner roundness (${combo.styling?.cornerRoundness ?? 12}px)`}>
                    <input
                      type="range"
                      min="0"
                      max="24"
                      value={combo.styling?.cornerRoundness ?? 12}
                      onChange={(e) => updateStyling("cornerRoundness", Number(e.target.value))}
                      style={{ width: "100%" }}
                    />
                  </Field>
                </div>
                <div style={{ flex: "1 1 160px" }}>
                  <Field label={`Breathing space (${combo.styling?.breathingSpace ?? 12}px)`}>
                    <input
                      type="range"
                      min="4"
                      max="24"
                      value={combo.styling?.breathingSpace ?? 12}
                      onChange={(e) => updateStyling("breathingSpace", Number(e.target.value))}
                      style={{ width: "100%" }}
                    />
                  </Field>
                </div>
              </div>

              <Checkbox
                checked={combo.styling?.showImage !== false}
                onChange={(v) => updateStyling("showImage", v)}
                label="Show product images"
              />
            </div>
          </div>

          {/* ------------------------------- Preview ------------------------------- */}
          <div style={{ position: "sticky", top: "16px" }}>
            <div style={CARD_STYLE}>
              <h3 style={{ margin: "0 0 14px", fontSize: "16px", fontWeight: "600" }}>Preview</h3>

              {items.length === 0 ? (
                <div style={{ padding: "40px 16px", textAlign: "center", color: "#6b7280", fontSize: "14px" }}>
                  Select products to see the preview.
                </div>
              ) : (
                <ComboWidget
                  combo={previewCombo}
                  components={previewComponents}
                  pricing={previewPricing}
                  currencySymbol={currencySymbol}
                  ctaLabel={combo.comboCtaText || "Order Now - Cash on Delivery"}
                  interactive={false}
                />
              )}
            </div>
          </div>
        </div>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
