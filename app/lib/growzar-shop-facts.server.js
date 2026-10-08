import prisma from "../db.server";

/**
 * Envelope facts for the Growzar feeds (API-CONTRACT §5, §6.1): the shop's
 * currency, IANA timezone and ISO alpha-2 country, cached on Shop and read
 * from Shopify at most once a day.
 *
 * Country, in order:
 *   1. the PRIMARY LOCATION's address.countryCode (needs read_locations). Never
 *      the billing address: that is the account holder's, and it returned GB
 *      for Karachi stores in Inventorify and Retainify.
 *   2. Shop.country, only when it is one of the five countries the merchant can
 *      pick in Preventify's settings. Install seeds Shop.country from the
 *      billing address, so any other value (GBR, USA, …) is that same trap.
 *   3. null. Null beats a guess.
 */

export const FACTS_TTL_MS = 24 * 3_600_000;
// After a failed read, try again in an hour rather than on every feed call.
const FAILED_RETRY_MS = 3_600_000;
const SHOPIFY_TIMEOUT_MS = 5_000;
const API_VERSION = "2025-01";

/** The settings dropdown's countries (lib/constants.js COUNTRIES) → ISO alpha-2. */
export const DROPDOWN_COUNTRY_TO_ISO = { PAK: "PK", UAE: "AE", QATAR: "QA", KUWAIT: "KW", KSA: "SA" };

const ISO2 = /^[A-Z]{2}$/;

export function resolveShopCountry({ shopCountryCode, country }) {
  if (shopCountryCode && ISO2.test(shopCountryCode)) return { shopCountry: shopCountryCode, shopCountrySource: "location" };
  const fallback = DROPDOWN_COUNTRY_TO_ISO[country];
  if (fallback) return { shopCountry: fallback, shopCountrySource: "app_setting" };
  return { shopCountry: null, shopCountrySource: null };
}

/** The facts as the envelope and row builders use them. */
export function factsFromShop(shop) {
  return {
    // Shopify's answer; until the first read, the currency install stored.
    shopCurrency: shop.shopCurrency || shop.currencyCode || null,
    shopTimezone: shop.shopTimezone || null,
    ...resolveShopCountry(shop),
  };
}

/**
 * One GraphQL call. The location is read in the same query; a shop that has
 * not granted read_locations answers with data for `shop` and an
 * ACCESS_DENIED error for `location`, which leaves the country unknown rather
 * than failing the whole read.
 */
export async function fetchShopFacts({ shopifyDomain, accessToken }, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`https://${shopifyDomain}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
    body: JSON.stringify({ query: "{ shop { currencyCode ianaTimezone } location { address { countryCode } } }" }),
    signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Shopify answered ${response.status}`);
  const body = await response.json();
  const shop = body?.data?.shop;
  if (!shop) throw new Error(`no shop in response${body?.errors ? `: ${JSON.stringify(body.errors).slice(0, 200)}` : ""}`);
  const countryCode = body?.data?.location?.address?.countryCode;
  return {
    shopCurrency: shop.currencyCode || null,
    shopTimezone: shop.ianaTimezone || null,
    shopCountryCode: countryCode && ISO2.test(countryCode) ? countryCode : null,
  };
}

/**
 * Facts for a Shop row, refreshing them first when the cache is stale. A
 * failed refresh keeps whatever was cached; the feed is never failed for it.
 */
export async function getShopFacts(shop, { db = prisma, now = Date.now(), fetchFacts = fetchShopFacts } = {}) {
  const syncedAt = shop.shopFactsSyncedAt ? new Date(shop.shopFactsSyncedAt).getTime() : 0;
  if (now - syncedAt < FACTS_TTL_MS) return factsFromShop(shop);

  try {
    const fresh = await fetchFacts(shop);
    const data = {
      shopCurrency: fresh.shopCurrency,
      shopTimezone: fresh.shopTimezone,
      shopCountryCode: fresh.shopCountryCode,
      shopFactsSyncedAt: new Date(now),
    };
    await db.shop.update({ where: { id: shop.id }, data });
    return factsFromShop({ ...shop, ...data });
  } catch (error) {
    console.warn(`[growzar] shop facts refresh failed for ${shop.shopifyDomain}: ${error.message}`);
    try {
      await db.shop.update({
        where: { id: shop.id },
        data: { shopFactsSyncedAt: new Date(now - FACTS_TTL_MS + FAILED_RETRY_MS) },
      });
    } catch {
      // Best effort only.
    }
    return factsFromShop(shop);
  }
}
