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

const REAL_COUNTRY_TTL_MS = 3600000; // 1 hour, matches App.jsx

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
 * @returns {boolean}
 */
export function isNativeBundleMode(config, shopDomain, realCountryOverride) {
  const s = config?.settings || {};
  if (!s.nativeBundleCheckout) return false;
  const countries = Array.isArray(s.nativeBundleCountries) ? s.nativeBundleCountries : [];
  if (countries.length === 0) return true; // everywhere
  const country = realCountryOverride || getCachedRealCountry(shopDomain);
  return !!country && countries.includes(country);
}
