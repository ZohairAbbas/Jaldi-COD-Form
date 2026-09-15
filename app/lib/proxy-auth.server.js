/**
 * App-proxy authentication for storefront-facing routes.
 *
 * Every `proxy.*` route is reachable two ways: through Shopify at
 * `https://<shop>/apps/preventify/proxy/<x>`, and directly at
 * `https://preventify.growzar.com/proxy/<x>`. Only the first carries Shopify's
 * signature. Before this module, no route checked it and the shop was read from
 * the request body — so anyone could act as any installed shop.
 *
 * The rule here: the shop comes from Shopify's verified signature, never from
 * the caller. A `shop` field in the body is ignored outright rather than
 * compared against the verified value, so it cannot be used as an oracle to
 * probe which shops exist.
 *
 * Rollout is staged through PROXY_AUTH_MODE because these routes serve every
 * live COD form. See `resolveMode` below.
 */

import { authenticate } from "../shopify.server";
import { getShopByDomain } from "./db.server";

/**
 * `enforce` rejects unsigned requests. `log` records what *would* have been
 * rejected and lets the request through, so real traffic can be observed before
 * the hole is closed. Default is `log`: a bad deploy that silently rejected
 * every storefront request would take down checkout on every merchant store.
 *
 * Read per-call rather than at module load so the mode can be flipped by
 * restarting with a new env value, without a code change.
 */
function resolveMode() {
  return process.env.PROXY_AUTH_MODE === "enforce" ? "enforce" : "log";
}

/** Thrown on verification failure; carries the Response the route should return. */
export class ProxyAuthError extends Error {
  constructor(response) {
    super("App proxy authentication failed");
    this.name = "ProxyAuthError";
    this.response = response;
  }
}

/**
 * One structured line per failure, greppable during the soak.
 *
 * Deliberately records no phone, email or body content — these routes carry
 * buyer PII and this log is the thing we'll be reading a lot of.
 */
function logFailure({ pathname, reason, mode, claimedShop }) {
  console.warn(
    "[proxy-auth] " +
      JSON.stringify({
        event: "verification_failed",
        path: pathname,
        reason,
        mode,
        // The unverified value the caller asserted. Useful for spotting a
        // legitimate caller we missed; never trusted for authorization.
        claimedShop: claimedShop || null,
      })
  );
}

/**
 * Verify the Shopify app-proxy signature and resolve the calling shop.
 *
 * Returns `{ shopDomain, shop, verified }`. In `log` mode an unverified request
 * still resolves, falling back to `fallbackShopDomain` so existing behaviour is
 * unchanged during the soak; `verified` is false in that case. In `enforce`
 * mode a failure throws ProxyAuthError.
 *
 * @param {Request} request
 * @param {object} [options]
 * @param {string|null} [options.fallbackShopDomain] Caller-supplied shop, used
 *   ONLY in `log` mode to preserve current behaviour. Never used in `enforce`.
 * @param {boolean} [options.requireShopRecord] 404 when the shop has no Shop row.
 */
export async function requireProxyShop(request, options = {}) {
  const { fallbackShopDomain = null, requireShopRecord = true } = options;
  const mode = resolveMode();
  const pathname = new URL(request.url).pathname;

  let verifiedShopDomain = null;
  let reason = null;

  try {
    const { session } = await authenticate.public.appProxy(request);

    if (session?.shop) {
      verifiedShopDomain = session.shop;
    } else {
      // The signature was valid but no offline session exists — the shop
      // uninstalled, or its session was pruned. The signature still proves
      // Shopify forwarded this from that shop, so the `shop` query parameter is
      // trustworthy here even though there's no session to hang it on. Using it
      // keeps a genuine-but-uninstalled shop distinguishable from a forgery.
      const signedShop = new URL(request.url).searchParams.get("shop");
      if (signedShop) {
        verifiedShopDomain = signedShop;
        // Not a failure: authentication succeeded. Downstream still 404s on the
        // missing Shop row, which is the correct outcome for an uninstall.
      } else {
        reason = "valid_signature_no_shop_param";
      }
    }
  } catch (error) {
    // The library throws a bare Response (400 Bad Request) on an invalid or
    // missing signature. Anything else is a genuine fault and shouldn't be
    // flattened into a generic auth failure.
    reason =
      error instanceof Response
        ? `signature_rejected_${error.status}`
        : "signature_error";
  }

  if (!verifiedShopDomain) {
    logFailure({ pathname, reason, mode, claimedShop: fallbackShopDomain });

    if (mode === "enforce") {
      throw new ProxyAuthError(
        Response.json({ error: "Unauthorized" }, { status: 401 })
      );
    }
  }

  // In log mode an unverified request keeps working off the value it claimed.
  const shopDomain = verifiedShopDomain || fallbackShopDomain;

  if (!shopDomain) {
    throw new ProxyAuthError(
      Response.json({ error: "Shop could not be determined" }, { status: 400 })
    );
  }

  let shop = null;
  if (requireShopRecord) {
    shop = await getShopByDomain(shopDomain);
    if (!shop) {
      throw new ProxyAuthError(
        Response.json({ error: "Shop not found" }, { status: 404 })
      );
    }
  }

  return { shopDomain, shop, verified: Boolean(verifiedShopDomain) };
}

/**
 * Read a JSON body and authenticate in one step — the shape almost every
 * storefront route needs.
 *
 * Returns `{ data, shopDomain, shop, verified, errorResponse }`. When
 * `errorResponse` is set the route must return it unchanged and do nothing else;
 * every other field is undefined. Returning the error rather than throwing keeps
 * these routes' existing single-try/catch structure intact, so wiring auth in
 * doesn't force a rewrite of each handler's error handling.
 *
 * The body is parsed before authentication because `authenticate.public.appProxy`
 * verifies the *query string* only and never touches the body — so there's no
 * double-read hazard. `data.shop`, where present, is passed through solely as the
 * log-mode fallback and is never trusted for authorization.
 *
 * @param {Request} request
 * @param {object} [options] Forwarded to requireProxyShop.
 */
export async function authenticateJsonProxyRequest(request, options = {}) {
  let data;
  try {
    data = await request.json();
  } catch {
    return {
      errorResponse: Response.json({ error: "Invalid JSON body" }, { status: 400 }),
    };
  }

  try {
    const auth = await requireProxyShop(request, {
      fallbackShopDomain: data?.shop || null,
      ...options,
    });
    return { data, ...auth };
  } catch (error) {
    if (error instanceof ProxyAuthError) {
      return { errorResponse: error.response };
    }
    throw error;
  }
}

/**
 * Wrap a route handler so ProxyAuthError becomes its Response.
 *
 * Without this each route needs its own try/catch, and one forgotten catch
 * turns a 401 into a 500 that reads as a server bug.
 *
 * @param {(args: object, auth: {shopDomain: string, shop: object|null, verified: boolean}) => Promise<Response>} handler
 */
export function withProxyAuth(handler, options = {}) {
  return async (args) => {
    let auth;
    try {
      auth = await requireProxyShop(args.request, {
        ...options,
        fallbackShopDomain: options.getFallbackShop
          ? await options.getFallbackShop(args)
          : null,
      });
    } catch (error) {
      if (error instanceof ProxyAuthError) return error.response;
      throw error;
    }
    return handler(args, auth);
  };
}
