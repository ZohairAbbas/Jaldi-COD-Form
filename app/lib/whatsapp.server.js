import prisma from "../db.server.js";
import { normalizePhone, markBuyerVerified } from "./buyer.server.js";
import crypto from "crypto";

/**
 * Generate a random login token for WhatsApp login channel.
 */
function generateToken() {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Generate a 6-digit OTP for WhatsApp OTP fallback.
 */
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ─── WhatsApp Login Channel (FREE) ────────────────────────────────

/**
 * Create a WhatsApp login session. Returns a token and deep link.
 * The user sends a pre-filled message to our business number via WhatsApp.
 * We match the token in the webhook to verify them.
 */
export async function createWhatsAppLoginSession(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error("Invalid phone number");

  // Rate limit: max 5 sessions per phone per 15 minutes
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  const recentSessions = await prisma.whatsAppLoginSession.count({
    where: {
      phone: normalized,
      createdAt: { gte: fifteenMinutesAgo },
    },
  });

  if (recentSessions >= 15) {
    throw new Error("Too many verification requests. Please try again later.");
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  await prisma.whatsAppLoginSession.create({
    data: {
      token,
      phone: normalized,
      status: "pending",
      expiresAt,
    },
  });

  const businessPhone = process.env.WHATSAPP_BUSINESS_PHONE;
  const message = `Hi! Please verify my phone number so I can place my order.`;
  const deepLink = `https://wa.me/${businessPhone}?text=${encodeURIComponent(message)}`;

  return { token, deepLink };
}

/**
 * Check the status of a WhatsApp login session (polled by storefront).
 */
export async function checkWhatsAppLoginStatus(token) {
  if (!token) return { status: "expired" };

  const session = await prisma.whatsAppLoginSession.findUnique({
    where: { token },
  });

  if (!session) return { status: "expired" };

  // Check expiry
  if (session.status === "pending" && new Date() > session.expiresAt) {
    await prisma.whatsAppLoginSession.update({
      where: { id: session.id },
      data: { status: "expired" },
    });
    return { status: "expired" };
  }

  return {
    status: session.status,
    phone: session.status === "verified" ? session.phone : undefined,
  };
}

/**
 * Process an incoming WhatsApp message from the webhook.
 * Matches by sender phone to the latest pending session — no token in message needed.
 * Returns the sender's phone if verified, null otherwise.
 */
export async function verifyWhatsAppLoginMessage(senderPhone) {
  const normalized = normalizePhone(senderPhone);
  if (!normalized) return null;

  // Find the latest pending session for this phone
  const session = await prisma.whatsAppLoginSession.findFirst({
    where: {
      phone: normalized,
      status: "pending",
      expiresAt: { gte: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!session) return null;

  // Mark session as verified
  await prisma.whatsAppLoginSession.update({
    where: { id: session.id },
    data: { status: "verified", verifiedAt: new Date() },
  });

  // Mark buyer as globally verified + whatsappVerified
  try {
    await markBuyerVerified(normalized);
    await prisma.globalBuyer.upsert({
      where: { phone: normalized },
      update: { whatsappVerified: true },
      create: { phone: normalized, whatsappVerified: true },
    });
  } catch (err) {
    // Buyer might not exist yet — that's OK
    console.error("Failed to update buyer after WhatsApp login:", err.message);
  }

  return normalized;
}

/**
 * Send a free-form text reply to a WhatsApp user.
 * Only works within the 24-hour customer service window (after user messages first).
 */
export async function sendWhatsAppReply(phone, message) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) return;

  const waPhone = phone.startsWith("+") ? phone.substring(1) : phone;

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: waPhone,
          type: "text",
          text: { body: message },
        }),
      }
    );
    if (!response.ok) {
      console.error("WhatsApp reply error:", response.status, await response.text());
    }
  } catch (err) {
    console.error("WhatsApp reply send error:", err.message);
  }
}

// ─── WhatsApp OTP (Paid Fallback) ─────────────────────────────────

/**
 * Send an OTP via WhatsApp Cloud API authentication template.
 * Uses the existing OTPSession model for code storage/verification.
 */
export async function sendWhatsAppOTP(shopId, phone) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_AUTH_TEMPLATE_NAME;
  const templateLang = process.env.WHATSAPP_AUTH_TEMPLATE_LANG || "en";

  if (!accessToken || !phoneNumberId) {
    throw new Error("WhatsApp API is not configured");
  }

  if (!templateName) {
    throw new Error("WhatsApp auth template is not configured");
  }

  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error("Invalid phone number");

  // Rate limit: max 3 OTPs per phone per 15 minutes
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  const recentOTPs = await prisma.oTPSession.count({
    where: {
      shopId,
      phone: normalized,
      createdAt: { gte: fifteenMinutesAgo },
    },
  });

  if (recentOTPs >= 3) {
    throw new Error("Too many OTP requests. Please try again later.");
  }

  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  // Store OTP in existing OTPSession model
  const otpSession = await prisma.oTPSession.create({
    data: {
      shopId,
      phone: normalized,
      otp,
      expiresAt,
    },
  });

  // Strip + prefix for WhatsApp API (expects country code without +)
  const waPhone = normalized.startsWith("+") ? normalized.substring(1) : normalized;

  // Send via WhatsApp Cloud API authentication template
  // Template: "This code is for {{1}} your {{2}} account and linking it to {{3}}. Code: {{4}}"
  // Button: "Copy code" URL button with otp code
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: waPhone,
        type: "template",
        template: {
          name: templateName,
          language: { code: templateLang },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: "verifying" },
                { type: "text", text: "Preventify" },
                { type: "text", text: "your order" },
                { type: "text", text: otp },
              ],
            },
            {
              type: "button",
              sub_type: "url",
              index: "0",
              parameters: [{ type: "text", text: otp }],
            },
          ],
        },
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("WhatsApp API error:", response.status, errorBody);
    throw new Error("Failed to send WhatsApp OTP");
  }

  return { success: true, sessionId: otpSession.id };
}

// ─── Webhook Verification ─────────────────────────────────────────

/**
 * Verify the Meta webhook subscription (GET request).
 * Meta sends hub.mode, hub.verify_token, and hub.challenge.
 */
export function verifyWebhookSubscription(mode, verifyToken, challenge) {
  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && verifyToken === expectedToken) {
    return challenge;
  }

  return null;
}

/**
 * Extract message data from a WhatsApp webhook payload.
 * Returns { senderPhone, messageText } or null if not a text message.
 */
export function extractWebhookMessage(body) {
  try {
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.messages?.length) return null;

    const message = value.messages[0];
    if (message.type !== "text") return null;

    // WhatsApp sends phone as country+number without +
    const senderPhone = "+" + message.from;
    const messageText = message.text?.body || "";

    return { senderPhone, messageText };
  } catch {
    return null;
  }
}
