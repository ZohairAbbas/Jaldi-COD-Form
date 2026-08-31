import { SHOPIFY_COUNTRY_CODE_MAP, parseJsonColumn } from "./constants";

/**
 * Server-side per-offer country targeting.
 *
 * The storefront counterpart (app/storefront/offer-country.js) matches against
 * the visitor's IP-detected country. This one runs where no IP context exists —
 * post-purchase upsells are chosen during order creation — so it matches against
 * the order's country instead.
 *
 * Mirrors the storefront semantics: "all", or an empty list, means everywhere,
 * and an undeterminable country fails OPEN so an offer is never silently hidden.
 *
 * @param {object} offer          Upsell/Downsell row (raw Prisma model)
 * @param {string|null} countryCode  Country from the order. Accepts either the
 *        internal code ("PAK") or an ISO alpha-2 ("PK").
 * @returns {boolean}
 */
export function matchesOfferCountryServer(offer, countryCode) {
  if (!offer) return false;
  if (offer.countryTargeting !== "specific") return true; // "all" / unset

  const countries = parseJsonColumn(offer.targetCountries, []);
  if (!Array.isArray(countries) || countries.length === 0) return true; // empty = everywhere
  if (!countryCode) return true; // undeterminable → fail open

  const code = String(countryCode).toUpperCase();
  // Raw map access with a `|| code` fallback, NOT mapShopifyCountryCode() —
  // that silently defaults unmapped countries to "PAK", which would match the
  // wrong list. Checks both forms since orders may carry either.
  const internal = SHOPIFY_COUNTRY_CODE_MAP[code] || code;
  return countries.includes(internal) || countries.includes(code);
}
