// Shared native-bundle-mode resolution used by BOTH the storefront bootstrap
// (index.jsx) and the React app (App.jsx), so the decision never drifts between
// them.
//
// Native bundle mode is active for a visitor when:
//   - the master toggle `nativeBundleCheckout` is on, AND
//   - either the country list is empty (applies everywhere), OR the visitor's
//     REAL country (mapped internal code, e.g. PAK) is in `nativeBundleCountries`.
//
// The visitor's real country comes from the shared sessionStorage cache written
// by App.jsx's detectCountry (`preventify_real_country_<shopDomain>`), which is
// derived from the proxy's isoCountry (NOT the shop-default country).
//
// On a product page, a product in the "Enable on specific products" list is the
// exception: it keeps the COD form (and its offers) while every other product
// stays native. That lets a native-checkout store sell a chosen few by COD.

const REAL_COUNTRY_TTL_MS = 3600000; // 1 hour, matches App.jsx

// Picker ids are `gid://shopify/Product/123`; the theme gives the bare `123`.
function listHasProduct(ids, productId) {
  if (productId == null || productId === '') return false;
  return (Array.isArray(ids) ? ids : []).some(
    (pid) => String(pid).replace(/\D/g, '') === String(productId),
  );
}

/**
 * Whether the "Disable on" / "Enable on specific products" lists let the COD
 * form show for this product. With the allow list on, a missing product id or
 * an empty list means no.
 */
export function isCodAllowedForProduct(settings, productId) {
  const s = settings || {};
  if (s.disableSpecificProducts && listHasProduct(s.disabledProductIds, productId)) return false;
  if (!s.enableSpecificProducts) return true;
  return listHasProduct(s.specificProductIds, productId);
}

export function getCachedRealCountry(shopDomain) {
  try {
    const cached = sessionStorage.getItem(`preventify_real_country_${shopDomain}`);
    if (cached) {
      const data = JSON.parse(cached);
      if (Date.now() - data.timestamp < REAL_COUNTRY_TTL_MS) return data.country;
    }
  } catch (e) { /* sessionStorage unavailable */ }
  return null;
}

/**
 * @param {object} config     Storefront config (with .settings)
 * @param {string} shopDomain Shop domain (for the country cache key)
 * @param {string|null} realCountryOverride  Optional already-resolved country
 *        (e.g. App.jsx's live detected/cached value) to use instead of the cache.
 * @param {string|null} productId  The product page's numeric id. Pass it only
 *        for the main product page instance; other surfaces ignore the list.
 * @returns {boolean}
 */
export function isNativeBundleMode(config, shopDomain, realCountryOverride, productId = null) {
  const s = config?.settings || {};
  if (!s.nativeBundleCheckout) return false;
  if (productId != null && s.enableSpecificProducts && isCodAllowedForProduct(s, productId)) return false;
  const countries = Array.isArray(s.nativeBundleCountries) ? s.nativeBundleCountries : [];
  if (countries.length === 0) return true; // everywhere
  const country = realCountryOverride || getCachedRealCountry(shopDomain);
  return !!country && countries.includes(country);
}

/**
 * Whether native checkout may apply to this visitor, for index.jsx deciding to
 * mount on a product page the COD form is kept off. True while a country list
 * is set but the visitor's country is not known yet: App.jsx detects it after
 * mounting, and renders nothing if the visitor turns out to be on COD.
 */
export function mayUseNativeBundleMode(config, shopDomain) {
  const s = config?.settings || {};
  if (!s.nativeBundleCheckout) return false;
  if (isNativeBundleMode(config, shopDomain)) return true;
  const countries = Array.isArray(s.nativeBundleCountries) ? s.nativeBundleCountries : [];
  return countries.length > 0 && !getCachedRealCountry(shopDomain);
}
