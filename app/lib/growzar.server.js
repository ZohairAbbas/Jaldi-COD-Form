import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { execFileSync } from "node:child_process";

/**
 * Everything Preventify says to, and accepts from, Growzar
 * (growzar-kb/contracts/API-CONTRACT.md).
 *
 * One module on purpose: the status endpoint, the claim token and the event
 * relay all use the same secret and the same signature construction, and the
 * R2 read API will reuse `verifyPlatformRequest` as-is rather than growing a
 * second scheme next to it.
 *
 *   X-Growzar-Signature: sha256=HMAC(secret, "<timestamp>.<METHOD> <path+query>.<raw body>")
 *   X-Growzar-Timestamp: ms epoch, 5-minute skew in either direction
 *
 * This must stay byte-for-byte identical to Growzar's
 * app/lib/apps/signing.server.ts. Any difference is a failed request.
 */

export const ISSUER = "preventify";
export const SIGNATURE_SKEW_MS = 5 * 60 * 1000;
export const CLAIM_TOKEN_TTL_SECONDS = 300;
export const EVENTS_PATH = "/api/v1/events";

/**
 * Read at call time, not at module load, so a value filled in on the box is
 * picked up by the next process start without anyone reasoning about import
 * order. Missing configuration returns null and every caller refuses — the
 * Growzar surface never fails open.
 */
export function getGrowzarConfig(env = process.env) {
  const url = (env.GROWZAR_URL || "").trim().replace(/\/+$/, "");
  const platformKey = (env.GROWZAR_PLATFORM_KEY || "").trim();
  const signingSecret = (env.GROWZAR_SIGNING_SECRET || "").trim();
  if (!url || !platformKey || !signingSecret) return null;
  return { url, platformKey, signingSecret };
}

// ---------------------------------------------------------------------------
// Signing (contract §2.1, §2.2)
// ---------------------------------------------------------------------------

export function signingPayload({ timestamp, method, pathWithQuery, body }) {
  return `${timestamp}.${method.toUpperCase()} ${pathWithQuery}.${body}`;
}

export function sign(secret, payload) {
  return `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

/** Constant-time string comparison that does not throw on a length mismatch. */
function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Verify a signature. The timestamp is checked first and in both directions:
 * replaying a genuinely signed request is the cheaper attack, and a far-future
 * timestamp is as wrong as an old one.
 */
export function verifySignature({
  secret,
  signature,
  timestamp,
  method,
  pathWithQuery,
  body,
  now = Date.now(),
}) {
  if (!signature) return { ok: false, reason: "missing_signature" };
  if (!timestamp) return { ok: false, reason: "missing_timestamp" };

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return { ok: false, reason: "timestamp_out_of_range" };
  if (Math.abs(now - sentAt) > SIGNATURE_SKEW_MS) {
    return { ok: false, reason: "timestamp_out_of_range" };
  }

  const expected = sign(
    secret,
    signingPayload({ timestamp: sentAt, method, pathWithQuery, body }),
  );
  if (!safeEqual(expected, signature)) return { ok: false, reason: "bad_signature" };
  return { ok: true };
}

/** §9 error shape. No CORS headers, ever, on an authenticated endpoint. */
export function growzarError(status, errorType, error) {
  return Response.json({ error, errorType }, { status });
}

const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export function normalizeShopDomain(value) {
  const shop = String(value || "").trim().toLowerCase();
  return SHOP_DOMAIN.test(shop) ? shop : null;
}

/**
 * Authenticate a Growzar → Preventify request (§2.1): bearer key AND request
 * signature, both required. The bearer key alone is never sufficient.
 *
 * Returns `{ ok: true, shop, body }` — `body` is the raw text the signature
 * covered, so a caller never has to read the stream a second time — or
 * `{ ok: false, response }` with a §9 error ready to return.
 *
 * Every failure is the same 401 with the same sentence. Telling a caller which
 * half was wrong tells an attacker which half they already have.
 */
export async function verifyPlatformRequest(request, { now = Date.now(), env = process.env } = {}) {
  const config = getGrowzarConfig(env);
  if (!config) {
    console.error("[growzar] GROWZAR_URL / GROWZAR_PLATFORM_KEY / GROWZAR_SIGNING_SECRET not set — refusing platform request");
    return {
      ok: false,
      response: growzarError(503, "internal_error", "Growzar is not configured on this app."),
    };
  }

  const unauthorized = (reason) => {
    console.warn(`[growzar] platform request refused: ${reason}`);
    return {
      ok: false,
      response: growzarError(401, "unauthorized", "This request is not authenticated."),
    };
  };

  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return unauthorized("missing_bearer");
  // Digests rather than raw strings, so the comparison is constant-time and
  // length-independent without leaking the key's length.
  const presented = createHash("sha256").update(match[1].trim()).digest();
  const expected = createHash("sha256").update(config.platformKey).digest();
  if (!timingSafeEqual(presented, expected)) return unauthorized("bad_bearer");

  const url = new URL(request.url);
  const pathWithQuery = `${url.pathname}${url.search}`;
  const body = request.method === "GET" || request.method === "HEAD" ? "" : await request.text();

  const verified = verifySignature({
    secret: config.signingSecret,
    signature: request.headers.get("X-Growzar-Signature"),
    timestamp: request.headers.get("X-Growzar-Timestamp"),
    method: request.method,
    pathWithQuery,
    body,
    now,
  });
  if (!verified.ok) return unauthorized(verified.reason);

  // The tenant is the X-Growzar-Shop header (§2.1). Growzar also sends ?shop=
  // on the status call; it is covered by the signature, and if present it must
  // agree — a request naming two shops names none.
  const shop = normalizeShopDomain(request.headers.get("X-Growzar-Shop"));
  if (!shop) {
    return {
      ok: false,
      response: growzarError(400, "bad_request", "X-Growzar-Shop must be a *.myshopify.com domain."),
    };
  }
  const queryShop = url.searchParams.get("shop");
  if (queryShop != null && normalizeShopDomain(queryShop) !== shop) {
    return {
      ok: false,
      response: growzarError(400, "bad_request", "X-Growzar-Shop and ?shop= name different shops."),
    };
  }

  return { ok: true, shop, body };
}

// ---------------------------------------------------------------------------
// Claim token (contract §10, D-10)
// ---------------------------------------------------------------------------

const base64url = (input) => Buffer.from(input).toString("base64url");

/**
 * HS256 JWT with node:crypto. jose is only a transitive dependency here, and
 * adding a direct one needs an `npm install` this phase cannot run; HS256 is
 * twelve lines and Growzar verifies it with jose, which the tests check.
 */
export function signJwtHs256(claims, secret) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify(claims));
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

/**
 * Mint the "Open in Growzar" token. Call only with facts taken from a Shopify
 * session this request has already verified — see app.growzar-claim.jsx.
 *
 * The token is never logged and never returned inside a query string.
 */
export function mintClaimToken(
  { shop, shopifyUserId, email, isStoreOwner, locale },
  { now = Date.now(), env = process.env } = {},
) {
  const config = getGrowzarConfig(env);
  if (!config) throw new Error("Growzar is not configured");

  const shopDomain = normalizeShopDomain(shop);
  if (!shopDomain) throw new Error("claim token needs a *.myshopify.com shop");
  if (!email) throw new Error("claim token needs the user's email");

  const iat = Math.floor(now / 1000);
  return signJwtHs256(
    {
      iss: ISSUER,
      aud: "growzar",
      shop: shopDomain,
      shopifyUserId: shopifyUserId || null,
      email: String(email).trim().toLowerCase(),
      isStoreOwner: isStoreOwner === true,
      locale: locale || null,
      jti: randomUUID(),
      iat,
      exp: iat + CLAIM_TOKEN_TTL_SECONDS,
    },
    config.signingSecret,
  );
}

/**
 * Where the browser goes. The token rides in the fragment, which browsers
 * never send to a server, so it cannot land in nginx logs, referrers or
 * Growzar's own access log. Growzar's /claim moves it into a POST.
 */
export function claimUrl(token, env = process.env) {
  const config = getGrowzarConfig(env);
  if (!config) throw new Error("Growzar is not configured");
  return `${config.url}/claim#token=${encodeURIComponent(token)}`;
}

// ---------------------------------------------------------------------------
// Events (contract §7)
// ---------------------------------------------------------------------------

/**
 * Backoff after each failed attempt: 1m, 5m, 30m, 2h, 6h, 12h. One first try
 * plus six retries, spread over about 21 hours; after that the event is
 * marked failed and left in the outbox for a human.
 */
export const RETRY_SCHEDULE_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 3_600_000,
  6 * 3_600_000,
  12 * 3_600_000,
];

/** Delay before the next attempt, given how many attempts have failed; null when out of retries. */
export function nextRetryDelayMs(failedAttempts) {
  if (failedAttempts < 1) return 0;
  return RETRY_SCHEDULE_MS[failedAttempts - 1] ?? null;
}

/**
 * A stable event ID derived from Shopify's webhook ID. Shopify redelivers a
 * webhook it thinks failed; deriving the ID means a redelivery is the same
 * event, which the outbox's unique index and Growzar's dedup both absorb,
 * instead of a second uninstall. Without a webhook ID it is simply random.
 */
export function eventIdFor(topic, sourceId) {
  if (!sourceId) return randomUUID();
  const hex = createHash("sha256").update(`${ISSUER}|${topic}|${sourceId}`).digest("hex");
  // UUID-shaped (version nibble 5) so it reads like the IDs around it.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${(
    (parseInt(hex[16], 16) & 0x3) | 0x8
  ).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function buildEnvelope({ topic, shop, occurredAt, actor, data = {}, sourceId }) {
  const shopDomain = normalizeShopDomain(shop);
  if (!shopDomain) throw new Error(`event needs a *.myshopify.com shop, got ${shop}`);
  const when = occurredAt instanceof Date && !Number.isNaN(occurredAt.getTime()) ? occurredAt : new Date();
  return {
    eventId: eventIdFor(topic, sourceId),
    topic,
    occurredAt: when.toISOString(),
    shop: shopDomain,
    actor: actor ?? null,
    data,
  };
}

/**
 * One signed POST to Growzar. Never throws.
 *
 * `body` is the exact serialised envelope. It is stored in the outbox and sent
 * byte for byte on every retry; only the timestamp and signature are fresh.
 *
 * Retryable: network errors, timeouts, 5xx (contract §7) and 429. Any other
 * 4xx is Growzar saying the event itself is wrong, and sending it again will
 * not change the answer.
 */
export async function postEvent(body, { env = process.env, fetchImpl = fetch, now = Date.now() } = {}) {
  const config = getGrowzarConfig(env);
  if (!config) return { ok: false, retryable: true, status: null, error: "growzar_not_configured" };

  const target = new URL(`${config.url}${EVENTS_PATH}`);
  const pathWithQuery = `${target.pathname}${target.search}`;

  try {
    const response = await fetchImpl(target.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Growzar-Timestamp": String(now),
        "X-Growzar-Signature": sign(
          config.signingSecret,
          signingPayload({ timestamp: now, method: "POST", pathWithQuery, body }),
        ),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) return { ok: true, status: response.status };
    return {
      ok: false,
      retryable: response.status >= 500 || response.status === 429,
      status: response.status,
      error: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      retryable: true,
      status: null,
      error: error?.name === "TimeoutError" ? "timeout" : error?.message || "network_error",
    };
  }
}

// ---------------------------------------------------------------------------
// Status (contract §11)
// ---------------------------------------------------------------------------

let cachedVersion;

/**
 * The deployed commit. The human's deploy is `git pull` + build in this same
 * directory, so HEAD is what is running. APP_VERSION overrides it for any
 * deploy that is not a git checkout.
 */
export function appVersion(env = process.env) {
  if (env.APP_VERSION) return env.APP_VERSION;
  if (cachedVersion === undefined) {
    try {
      cachedVersion = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
        cwd: process.cwd(),
        timeout: 2000,
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim() || "unknown";
    } catch {
      cachedVersion = "unknown";
    }
  }
  return cachedVersion;
}
