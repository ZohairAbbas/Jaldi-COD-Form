// Shared per-offer country targeting for upsells, downsells and one-tick
// upsells (ticksells), used by BOTH App.jsx and CODForm.jsx so the decision
// never drifts between them.
//
// An offer is shown when:
//   - countryTargeting is "all" (or unset), OR
//   - the target list is empty (applies everywhere — same semantics as
//     nativeBundleCountries), OR
//   - the visitor's REAL country (mapped internal code, e.g. PAK) is in the list.
//
// The visitor's real country comes from the shared sessionStorage cache written
// by App.jsx's detectCountry (`preventify_real_country_<shopDomain>`), which is
// derived from the proxy's isoCountry — NOT the shop-default `country`, and NOT
// the country selected in the COD form's dropdown.
//
// NOTE: this fails OPEN when the country can't be determined, matching
// isCountryAllowed() in index.jsx and the admin help text. This deliberately
// differs from isNativeBundleMode(), which fails closed — there, an unknown
// country should fall back to the COD form; here, an unknown country should not
// silently suppress a merchant's offer.

import { getCachedRealCountry } from './native-bundle';

/**
 * @param {object} offer  Offer from the storefront config (upsell/downsell)
 * @param {string} shopDomain
 * @param {string|null} realCountryOverride  Optional already-resolved country
 *        (e.g. App.jsx's live detected value) to use instead of the cache.
 * @returns {boolean}
 */
export function matchesOfferCountry(offer, shopDomain, realCountryOverride) {
  if (!offer) return false;
  if (offer.countryTargeting !== 'specific') return true; // "all" / unset
  const countries = Array.isArray(offer.targetCountries) ? offer.targetCountries : [];
  if (countries.length === 0) return true; // empty list = everywhere
  const country = realCountryOverride || getCachedRealCountry(shopDomain);
  if (!country) return true; // undetectable → fail open
  return countries.includes(country);
}

/**
 * True when any delivered offer is country-scoped, meaning the storefront needs
 * to resolve the visitor's country for targeting to work at all.
 *
 * @param {object} config Storefront config
 * @returns {boolean}
 */
export function offersNeedCountry(config) {
  return [
    ...(config?.upsells?.prePurchase || []),
    ...(config?.upsells?.oneTick || []),
    ...(config?.downsells || []),
  ].some(o => o?.countryTargeting === 'specific');
}
