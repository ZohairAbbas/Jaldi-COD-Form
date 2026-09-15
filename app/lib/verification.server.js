/**
 * Server-side proof that a phone number was actually verified.
 *
 * The storefront used to send `verificationMethod` (e.g. "whatsapp_otp_verified")
 * and the server stored it on the Order and wrote it as a Shopify tag without
 * checking anything — so the tag recorded what the client claimed, not what
 * happened. A buyer who never verified could be tagged as verified, which is
 * exactly backwards for a fraud-prevention feature.
 *
 * This module answers that question from the database instead. Two things live
 * here because they answer it over different time horizons:
 *
 *   resolveVerificationMethod() — "did this phone verify in the last few
 *     minutes?" Used at order time to set the tag truthfully.
 *
 *   issueVerificationToken() / verifyVerificationToken() — a short-lived bearer
 *     credential proving the same fact, so a *later* request (autofill, address
 *     edit) can be trusted without re-querying and without the client asserting
 *     anything. Stateless and HMAC-signed: no table, no migration.
 *
 * The tag strings are a frozen contract (other tools read them). They are
 * unchanged; only their truthfulness changes.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import prisma from "../db.server.js";
import { normalizePhone } from "./buyer.server.js";

/**
 * How recently a verification must have happened to count at order time.
 *
 * Covers filling in a form after verifying, without being long enough that an
 * abandoned session stays "verified" into someone else's later checkout.
 */
const VERIFICATION_WINDOW_MINUTES = 30;

/** Token lifetime. Long enough for one form fill, short enough that a leaked token is near-worthless. */
const TOKEN_TTL_MS = 30 * 60 * 1000;

/**
 * Order-token lifetime — the post-purchase upsell window.
 *
 * Longer than a verification token because it covers reading the thank-you page
 * and deciding on an offer, but still bounded: after this the order can no
 * longer be edited through the storefront at all.
 */
const ORDER_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * Frozen tag strings. Do not change these values — the Shopify order tags and
 * the analytics page (app.analytics.jsx) both key off them.
 */
export const VERIFICATION_TAGS = {
  WHATSAPP_LOGIN: "whatsapp_verified",
  WHATSAPP_OTP: "whatsapp_otp_verified",
  SMS_OTP: "sms_otp_verified",
  TRUSTED_BUYER: "trusted_buyer_verified",
  SKIPPED: "verification_skipped",
};

/**
 * Determine how a phone was verified, from the database.
 *
 * Checks both channels and returns the strongest evidence found within the
 * window. Returns SKIPPED when there is none — regardless of what the client
 * claimed.
 *
 * `trusted_buyer_verified` is deliberately NOT returned here: that tag means
 * "this buyer was trusted enough to skip verification", which is a different
 * claim from "this buyer verified". See resolveTrustedBypass().
 *
 * @param {string} shopId
 * @param {string} phone Raw phone; normalised internally.
 * @returns {Promise<string>} One of VERIFICATION_TAGS.
 */
export async function resolveVerificationMethod(shopId, phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return VERIFICATION_TAGS.SKIPPED;

  const since = new Date(Date.now() - VERIFICATION_WINDOW_MINUTES * 60 * 1000);

  // Both channels are checked together; a buyer may have tried one then the
  // other, and either is genuine proof.
  const [otpSession, waLogin] = await Promise.all([
    prisma.oTPSession.findFirst({
      where: {
        shopId,
        phone: normalized,
        verified: true,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      select: { channel: true },
    }),
    prisma.whatsAppLoginSession.findFirst({
      where: {
        phone: normalized,
        status: "verified",
        verifiedAt: { gte: since },
      },
      orderBy: { verifiedAt: "desc" },
      select: { id: true },
    }),
  ]);

  // WhatsApp login is the strongest signal: the buyer messaged from the number
  // itself, rather than relaying a code that was sent to it.
  if (waLogin) return VERIFICATION_TAGS.WHATSAPP_LOGIN;

  if (otpSession) {
    return otpSession.channel === "sms"
      ? VERIFICATION_TAGS.SMS_OTP
      : VERIFICATION_TAGS.WHATSAPP_OTP;
  }

  return VERIFICATION_TAGS.SKIPPED;
}

/**
 * Whether a buyer qualifies for the trusted-buyer bypass.
 *
 * Mirrors getTrustLevel() in buyer.server: a buyer with orders who verified
 * within the trust window may skip verification on subsequent orders. Kept
 * server-side so the *decision* is ours even though the storefront also
 * computes it for UI purposes.
 *
 * Note this reads lastVerifiedAt, which until the PRV-2 fix was stamped on
 * every order upsert whether or not anyone verified — making nearly every
 * buyer "trusted". Once that write is corrected this returns true only for
 * buyers who genuinely verified.
 *
 * @returns {Promise<boolean>}
 */
export async function resolveTrustedBypass(phone, trustWindowDays = 90) {
  const normalized = normalizePhone(phone);
  if (!normalized) return false;

  const buyer = await prisma.globalBuyer.findUnique({
    where: { phone: normalized },
    select: { totalOrdersGlobal: true, lastVerifiedAt: true },
  });

  if (!buyer?.lastVerifiedAt || buyer.totalOrdersGlobal < 1) return false;

  const ageDays =
    (Date.now() - new Date(buyer.lastVerifiedAt).getTime()) / (1000 * 60 * 60 * 24);
  return ageDays <= trustWindowDays;
}

/**
 * Resolve the verification tag for an order, server-side.
 *
 * Order of preference: real verification first, then the trusted bypass, then
 * skipped. `clientClaim` is accepted only to be logged when it disagrees —
 * a persistent disagreement means either a bug or someone forging tags.
 *
 * @param {string} shopId
 * @param {string} phone
 * @param {object} [options]
 * @param {string|null} [options.clientClaim] What the storefront asserted.
 * @param {boolean} [options.allowTrustedBypass] Whether the merchant has the bypass enabled.
 * @returns {Promise<string>}
 */
export async function resolveOrderVerification(shopId, phone, options = {}) {
  const { clientClaim = null, allowTrustedBypass = true } = options;

  let resolved = await resolveVerificationMethod(shopId, phone);

  if (resolved === VERIFICATION_TAGS.SKIPPED && allowTrustedBypass) {
    if (await resolveTrustedBypass(phone)) {
      resolved = VERIFICATION_TAGS.TRUSTED_BUYER;
    }
  }

  if (clientClaim && clientClaim !== resolved) {
    // No phone number in the log: these lines are read in bulk.
    console.warn(
      "[verification] " +
        JSON.stringify({
          event: "client_claim_mismatch",
          claimed: clientClaim,
          resolved,
          shopId,
        })
    );
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// Verification tokens
// ---------------------------------------------------------------------------

/**
 * Signing key. Reuses SHOPIFY_API_SECRET rather than introducing another
 * secret to provision and rotate; it is already required for the app to boot,
 * so there is no configuration in which tokens silently stop being signed.
 */
function signingKey() {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) throw new Error("SHOPIFY_API_SECRET is required to sign verification tokens");
  return secret;
}

function sign(payload) {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

/**
 * Issue a token proving `phone` was verified for `shop` just now.
 *
 * Format: base64url(JSON payload).signature — self-contained, so verifying it
 * costs no database round-trip. The payload is readable by the holder, which is
 * fine: it contains only their own phone, and the signature is what matters.
 *
 * @param {object} params
 * @param {string} params.phone
 * @param {string} params.shopDomain Binds the token to one shop.
 * @param {string} params.method A VERIFICATION_TAGS value.
 * @param {number} [params.now] Injectable for tests.
 * @returns {string}
 */
export function issueVerificationToken({ phone, shopDomain, method, now = Date.now() }) {
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error("A phone number is required to issue a verification token");

  const payload = {
    p: normalized,
    s: shopDomain,
    m: method,
    exp: now + TOKEN_TTL_MS,
  };

  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

/**
 * Verify a token and return its payload, or null.
 *
 * Returns null for every failure mode — bad format, bad signature, expired,
 * wrong shop, wrong phone — rather than distinguishing them, so a caller
 * cannot use the error to learn which part was wrong.
 *
 * @param {string|null} token
 * @param {object} [expectations]
 * @param {string} [expectations.phone] Token must be for this phone.
 * @param {string} [expectations.shopDomain] Token must be for this shop.
 * @param {number} [expectations.now] Injectable for tests.
 * @returns {{phone: string, shopDomain: string, method: string}|null}
 */
export function verifyVerificationToken(token, expectations = {}) {
  const { phone, shopDomain, now = Date.now() } = expectations;

  if (!token || typeof token !== "string") return null;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const encoded = token.slice(0, separator);
  const provided = token.slice(separator + 1);

  // Constant-time comparison so the signature can't be recovered from timing.
  const expected = sign(encoded);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!payload?.p || !payload?.exp) return null;
  if (now > payload.exp) return null;

  if (shopDomain && payload.s !== shopDomain) return null;

  if (phone) {
    const normalized = normalizePhone(phone);
    if (!normalized || normalized !== payload.p) return null;
  }

  return { phone: payload.p, shopDomain: payload.s, method: payload.m };
}

// ---------------------------------------------------------------------------
// Order tokens
// ---------------------------------------------------------------------------

/**
 * Issue a token proving the holder just placed `shopifyOrderId` at `shopDomain`.
 *
 * Returned in the order-creation response and required by proxy/order-upsell.
 * The app-proxy signature alone proves a request came through a shop, not that
 * the caller placed the order it names — without this, any buyer on a store
 * could add line items to any other order of that same store.
 *
 * Same HMAC construction as verification tokens, with a `k` (kind) field so an
 * order token can never be presented where a verification token is expected,
 * or the reverse.
 *
 * @param {object} params
 * @param {string} params.shopifyOrderId
 * @param {string} params.shopDomain
 * @param {number} [params.now] Injectable for tests.
 * @returns {string}
 */
export function issueOrderToken({ shopifyOrderId, shopDomain, now = Date.now() }) {
  if (!shopifyOrderId) throw new Error("An order id is required to issue an order token");

  const payload = {
    k: "order",
    o: String(shopifyOrderId),
    s: shopDomain,
    exp: now + ORDER_TOKEN_TTL_MS,
  };

  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

/**
 * Verify an order token against the order and shop it claims to authorise.
 *
 * Both are required: a token is only meaningful for the exact order it was
 * issued for. Returns false for every failure mode without distinguishing them.
 *
 * @param {string|null} token
 * @param {object} expectations
 * @param {string} expectations.shopifyOrderId
 * @param {string} expectations.shopDomain
 * @param {number} [expectations.now] Injectable for tests.
 * @returns {boolean}
 */
export function verifyOrderToken(token, expectations = {}) {
  const { shopifyOrderId, shopDomain, now = Date.now() } = expectations;

  if (!token || typeof token !== "string") return false;
  if (!shopifyOrderId || !shopDomain) return false;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return false;

  const encoded = token.slice(0, separator);
  const provided = token.slice(separator + 1);

  const expected = sign(encoded);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return false;
  }

  // Reject a verification token presented here, even though it is validly signed.
  if (payload?.k !== "order") return false;
  if (!payload.exp || now > payload.exp) return false;
  if (payload.o !== String(shopifyOrderId)) return false;
  if (payload.s !== shopDomain) return false;

  return true;
}
