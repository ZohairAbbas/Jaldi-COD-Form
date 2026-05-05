import {
  verifyWebhookSubscription,
  extractWebhookMessage,
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
 */

export const loader = async ({ request }) => {
  // GET request: Meta webhook subscription verification
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const verifyToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  console.log("[WA Webhook] GET verification request:", { mode, verifyToken: verifyToken ? "***" : null, challenge: challenge ? "present" : null });

  const result = verifyWebhookSubscription(mode, verifyToken, challenge);

  if (result) {
    console.log("[WA Webhook] Verification successful, returning challenge");
    // Must return the challenge as plain text, not JSON
    return new Response(result, { status: 200 });
  }

  console.log("[WA Webhook] Verification FAILED");
  return new Response("Forbidden", { status: 403 });
};

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    console.log("[WA Webhook] POST received:", JSON.stringify(body, null, 2));

    // Extract message from webhook payload
    const messageData = extractWebhookMessage(body);
    console.log("[WA Webhook] Extracted message:", messageData);

    if (messageData) {
      const { senderPhone } = messageData;

      console.log("[WA Webhook] Checking pending login session for:", senderPhone);
      const verifiedPhone = await verifyWhatsAppLoginMessage(senderPhone);
      console.log("[WA Webhook] Verification result:", verifiedPhone ? "verified" : "no pending session");

      if (verifiedPhone) {
        console.log(`[WA Webhook] WhatsApp login verified for ${verifiedPhone}`);
        // Reply immediately so the user knows to go back to the store
        await sendWhatsAppReply(
          verifiedPhone,
          "✅ Your phone number has been verified! Please return to the store — your order is being placed now."
        );
      } else {
        // No pending session for this sender — likely a phone mismatch
        // (e.g., friend's WhatsApp doesn't match the phone entered in the order form)
        console.log(`[WA Webhook] No pending session for ${senderPhone} — sending mismatch reply`);
        await sendWhatsAppReply(
          senderPhone,
          "No pending verification found for your number. Please make sure the phone number you entered in the order form matches this WhatsApp account."
        );
      }
    }

    // Always return 200 to Meta (otherwise they retry)
    return Response.json({ status: "ok" });
  } catch (error) {
    console.error("[WA Webhook] Error:", error);
    // Still return 200 — Meta retries on non-2xx
    return Response.json({ status: "ok" });
  }
};
