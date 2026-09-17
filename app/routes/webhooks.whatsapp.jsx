import { createHmac, timingSafeEqual } from "node:crypto";
import {
  verifyWebhookSubscription,
  extractWebhookMessages,
  verifyWhatsAppLoginMessage,
  sendWhatsAppReply,
} from "../lib/whatsapp.server";

/**
 * Meta WhatsApp Cloud API Webhook
 *
 * GET  — Webhook verification handshake (Meta sends hub.verify_token + hub.challenge)
 * POST — Incoming messages (user sends LOGIN-{token} via WhatsApp)
 *
 * This is NOT a Shopify webhook — it's a public endpoint for Meta.
 *
 * Requests arrive via Courierify, which is the single Meta-registered endpoint
 * for the suite and routes by `phone_number_id`. It forwards the raw bytes and
 * the original `X-Hub-Signature-256` header, and all apps share one Meta app
 * secret — so verifying here works on the forwarded request.
 *
 * Courierify verifies the signature before forwarding, so this check is
 * defence in depth rather than the first line: it means a compromised or
 * misconfigured forwarder still cannot make Preventify mark a phone verified.
 */

/**
 * Verify `X-Hub-Signature-256` against the raw body.
 *
 * Without this, a POST with any `from` marked that phone verified and set
 * whatsappVerified — anyone could claim any number. Must run on the raw bytes
 * before JSON parsing: re-serialising changes key order and whitespace, and the
 * HMAC covers the exact bytes Meta signed.
 */
function verifyMetaSignature(rawBody, signatureHeader) {
  const secret = process.env.WA_CLOUD_APP_SECRET;

  if (!secret) {
    // Fail closed. An unset secret previously meant no check at all, which is
    // indistinguishable from a working one until someone forges a request.
    console.error(
      "[WA Webhook] WA_CLOUD_APP_SECRET is not set — rejecting webhook. " +
        "Set it to the same value Courierify uses."
    );
    return false;
  }

  if (!signatureHeader) return false;

  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");

  // Constant-time: a plain === leaks the signature one byte at a time.
  // TextEncoder rather than Buffer to stay within the lint config's declared
  // globals; timingSafeEqual accepts any TypedArray.
  const encoder = new TextEncoder();
  const a = encoder.encode(signatureHeader);
  const b = encoder.encode(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const loader = async ({ request }) => {
  // GET request: Meta webhook subscription verification
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const verifyToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const result = verifyWebhookSubscription(mode, verifyToken, challenge);

  if (result) {
    console.log("[WA Webhook] Subscription verification successful");
    // Must return the challenge as plain text, not JSON
    return new Response(result, { status: 200 });
  }

  console.log("[WA Webhook] Subscription verification failed");
  return new Response("Forbidden", { status: 403 });
};

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    // Read the raw body and verify BEFORE parsing. The signature covers the
    // exact bytes; parsing first and re-serialising would break it.
    const rawBody = await request.text();

    if (!verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
      console.warn("[WA Webhook] Rejected: missing or invalid signature");
      return new Response("Forbidden", { status: 403 });
    }

    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    // Every message in the batch, not just the first.
    const messages = extractWebhookMessages(body);
    console.log(`[WA Webhook] Processing ${messages.length} message(s)`);

    for (const { senderPhone } of messages) {
      const verifiedPhone = await verifyWhatsAppLoginMessage(senderPhone);

      if (verifiedPhone) {
        // Reply so the buyer knows to go back to the store.
        await sendWhatsAppReply(
          verifiedPhone,
          "✅ Your phone number has been verified! Please return to the store — your order is being placed now."
        );
      }
      // Senders with no pending session get no reply. Replying meant any
      // message — forged, misrouted, or a wrong number — made Preventify's
      // business number message a stranger, at Preventify's cost.
    }

    // Always return 200 to Meta (otherwise they retry)
    return Response.json({ status: "ok" });
  } catch (error) {
    // No payload in the log: these carry phone numbers and message bodies.
    console.error("[WA Webhook] Error:", error.message);
    // Still return 200 — Meta retries on non-2xx
    return Response.json({ status: "ok" });
  }
};
