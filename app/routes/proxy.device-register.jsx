import prisma from "../db.server";
import { normalizePhone } from "../lib/buyer.server";

/**
 * Register a device fingerprint → phone mapping after a successful order.
 *
 * POST /proxy/device-register
 * Body: { fingerprintId: string, phone: string }
 * Returns: { success: boolean }
 */
export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { fingerprintId, phone } = await request.json();

    if (!fingerprintId || typeof fingerprintId !== "string") {
      return Response.json({ success: false, error: "Missing fingerprintId" });
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return Response.json({ success: false, error: "Missing phone" });
    }

    // Upsert: same fingerprintId + phone pair → just update lastSeenAt
    await prisma.deviceFingerprint.upsert({
      where: { fingerprintId_phone: { fingerprintId, phone: normalizedPhone } },
      update: { lastSeenAt: new Date() },
      create: { fingerprintId, phone: normalizedPhone, lastSeenAt: new Date() },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("[device-register] Error:", error);
    return Response.json({ success: false });
  }
};
