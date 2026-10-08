import prisma from "../db.server";
import { growzarError, verifyPlatformRequest } from "./growzar.server";
import { getShopFacts } from "./growzar-shop-facts.server";

/**
 * The plumbing every Growzar read feed shares (API-CONTRACT §6, pack G-PRV5-6).
 *
 *   signed platform request (§2.1, verifyPlatformRequest, unchanged)
 *   → rate limit, 600/min on the platform key, never failing open
 *   → the shop must be installed, else 410 shop_not_connected
 *   → envelope facts (currency, timezone, ISO country)
 *   → the event gate opens for this shop (contract §7)
 *
 * Tables key on Shop.id (a cuid); it is resolved here and never leaves the app.
 */

export const MAX_LIMIT = 500;
export const DEFAULT_LIMIT = 200;
export const TOMBSTONE_CAP = 1000;

// ---------------------------------------------------------------------------
// Rate limit (contract §2.1): one bucket for the platform key, in this process.
// preventify-app runs as a single PM2 fork, so this is the whole app's limit.
// ---------------------------------------------------------------------------

export const RATE_LIMIT_PER_MINUTE = 600;

export function createRateLimiter({ limit = RATE_LIMIT_PER_MINUTE, windowMs = 60_000 } = {}) {
  let windowStart = 0;
  let count = 0;
  return function take(now = Date.now()) {
    if (now - windowStart >= windowMs) {
      windowStart = now;
      count = 0;
    }
    if (count >= limit) return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)) };
    count += 1;
    return { ok: true };
  };
}

const platformLimiter = createRateLimiter();

// ---------------------------------------------------------------------------
// Query and cursor (§6.2)
// ---------------------------------------------------------------------------

/** Opaque cursor: the last row's (updatedAt, id). */
export function encodeCursor(updatedAt, id) {
  return Buffer.from(JSON.stringify({ u: new Date(updatedAt).toISOString(), i: id })).toString("base64url");
}

export function decodeCursor(cursor) {
  try {
    const { u, i } = JSON.parse(Buffer.from(String(cursor), "base64url").toString("utf8"));
    const at = new Date(u);
    if (typeof i !== "string" || !i || Number.isNaN(at.getTime())) return null;
    return { updatedAt: at, id: i };
  } catch {
    return null;
  }
}

/** `{ ok, updatedSince, limit, cursor }` or `{ ok: false, response }` (400). */
export function parseFeedQuery(url) {
  const params = new URL(url).searchParams;
  const bad = (message) => ({ ok: false, response: growzarError(400, "bad_request", message) });

  let updatedSince = null;
  if (params.get("updatedSince")) {
    updatedSince = new Date(params.get("updatedSince"));
    if (Number.isNaN(updatedSince.getTime())) return bad("updatedSince must be an ISO timestamp.");
  }

  let limit = DEFAULT_LIMIT;
  if (params.get("limit") != null && params.get("limit") !== "") {
    limit = Number(params.get("limit"));
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return bad(`limit must be an integer from 1 to ${MAX_LIMIT}.`);
  }

  let cursor = null;
  if (params.get("cursor")) {
    cursor = decodeCursor(params.get("cursor"));
    if (!cursor) return bad("cursor is not valid.");
  }

  return { ok: true, updatedSince, limit, cursor };
}

/**
 * Prisma `where` for one page, ordered by (timeField, id) ascending. The cursor
 * takes precedence over updatedSince (which is inclusive).
 */
export function pageWhere({ updatedSince, cursor }, timeField = "updatedAt") {
  if (cursor) {
    return {
      OR: [
        { [timeField]: { gt: cursor.updatedAt } },
        { [timeField]: cursor.updatedAt, id: { gt: cursor.id } },
      ],
    };
  }
  return updatedSince ? { [timeField]: { gte: updatedSince } } : {};
}

/** Trim the extra row fetched to learn hasMore, and build `pagination`. */
export function paginate(rows, limit, timeField = "updatedAt") {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    page,
    pagination: {
      limit,
      count: page.length,
      hasMore,
      nextCursor: last ? encodeCursor(last[timeField], last.id) : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Tombstones (§6.2): deletions since updatedSince, on every page of an
// incremental sync, capped with a flag so a capped list never looks complete.
// ---------------------------------------------------------------------------

export async function tombstones({ shopId, entity, updatedSince, db = prisma }) {
  if (!updatedSince) return { ids: [], truncated: false };
  const rows = await db.growzarTombstone.findMany({
    where: { shopId, entity, deletedAt: { gte: updatedSince } },
    orderBy: [{ deletedAt: "asc" }, { id: "asc" }],
    take: TOMBSTONE_CAP + 1,
    select: { entityId: true },
  });
  return {
    ids: rows.slice(0, TOMBSTONE_CAP).map((row) => row.entityId),
    truncated: rows.length > TOMBSTONE_CAP,
  };
}

// ---------------------------------------------------------------------------
// The request gate
// ---------------------------------------------------------------------------

/**
 * Installed means an offline session exists and the token is not marked
 * revoked — the same rule as /growzar/status (that frozen route keeps its own
 * copy). The Shop row alone proves nothing: it outlives the install.
 */
export async function findInstalledShop(shopDomain, { db = prisma } = {}) {
  const session = await db.session.findFirst({ where: { shop: shopDomain, isOnline: false }, select: { id: true } });
  if (!session) return null;
  const shop = await db.shop.findUnique({ where: { shopifyDomain: shopDomain } });
  if (!shop || shop.tokenInvalid) return null;
  return shop;
}

/**
 * Run the shared checks. Returns `{ ok: true, shop, facts, query }` or
 * `{ ok: false, response }`.
 */
export async function openFeed(
  request,
  { db = prisma, limiter = platformLimiter, verify = verifyPlatformRequest, shopFacts = getShopFacts } = {},
) {
  let auth;
  try {
    auth = await verify(request);
  } catch (error) {
    console.error("[growzar] platform auth threw:", error.message);
    return { ok: false, response: growzarError(503, "not_configured", "Authentication is unavailable.") };
  }
  if (!auth.ok) return auth;

  let allowed;
  try {
    allowed = limiter();
  } catch (error) {
    console.error("[growzar] rate limiter threw:", error.message);
    return { ok: false, response: growzarError(503, "not_configured", "Rate limiting is unavailable.") };
  }
  if (!allowed.ok) {
    const response = growzarError(429, "rate_limited", "Too many requests.");
    response.headers.set("Retry-After", String(allowed.retryAfterSeconds));
    return { ok: false, response };
  }

  const query = parseFeedQuery(request.url);
  if (!query.ok) return query;

  const shop = await findInstalledShop(auth.shop, { db });
  if (!shop) {
    return { ok: false, response: growzarError(410, "shop_not_connected", "Preventify is not installed on this shop.") };
  }

  const facts = await shopFacts(shop, { db });

  // Open the event gate (contract §7): this shop is now one Growzar syncs.
  // Written only when it changes, not on every poll.
  if (!shop.growzarSeenAt || shop.growzarStoppedAt) {
    try {
      await db.shop.update({ where: { id: shop.id }, data: { growzarSeenAt: new Date(), growzarStoppedAt: null } });
    } catch (error) {
      console.error(`[growzar] could not open the event gate for ${shop.shopifyDomain}:`, error.message);
    }
  }

  return { ok: true, shop, facts, query };
}

/** §6.1 envelope. */
export function envelope({ shop, facts, data, pagination, extra = {} }) {
  return Response.json({
    shop: shop.shopifyDomain,
    shopTimezone: facts.shopTimezone,
    shopCurrency: facts.shopCurrency,
    shopCountry: facts.shopCountry,
    shopCountrySource: facts.shopCountrySource,
    data,
    pagination,
    ...extra,
  });
}

/** Wrap a feed loader so an unexpected error is a §9 500, not a stack trace. */
export function feedLoader(name, handler) {
  return async ({ request }) => {
    try {
      const opened = await openFeed(request);
      if (!opened.ok) return opened.response;
      return await handler(opened);
    } catch (error) {
      console.error(`[growzar] ${name} feed failed:`, error);
      return growzarError(500, "internal_error", "The feed could not be read.");
    }
  };
}

export const feedAction = () => growzarError(405, "bad_request", "Feeds are GET only.");
