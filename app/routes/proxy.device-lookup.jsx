import prisma from "../db.server";
import { lookupGlobalBuyer } from "../lib/buyer.server";

/**
 * Device-based buyer lookup (Layer 2 fallback when localStorage is empty)
 *
 * POST /proxy/device-lookup
 * Body: { fingerprintId: string }
 * Returns: { phone: string, buyer: {...} } | { phone: null }
 */
export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { fingerprintId } = await request.json();

    if (!fingerprintId || typeof fingerprintId !== "string") {
      return Response.json({ phone: null });
    }

    const deviceRecord = await prisma.deviceFingerprint.findFirst({
      where: { fingerprintId },
      orderBy: { lastSeenAt: "desc" },
    });

    if (!deviceRecord) {
      return Response.json({ phone: null });
    }

    // Update lastSeenAt non-blocking
    prisma.deviceFingerprint
      .update({
        where: { id: deviceRecord.id },
        data: { lastSeenAt: new Date() },
      })
      .catch((err) =>
        console.error("[device-lookup] Failed to update lastSeenAt:", err)
      );

    const buyer = await lookupGlobalBuyer(deviceRecord.phone);

    if (!buyer) {
      return Response.json({ phone: deviceRecord.phone });
    }

    // Trusted → full data; recognized → phone only for prefill
    if (buyer.trustLevel === "trusted") {
      return Response.json({ phone: deviceRecord.phone, buyer });
    } else {
      return Response.json({ phone: deviceRecord.phone });
    }
  } catch (error) {
    console.error("[device-lookup] Error:", error);
    return Response.json({ phone: null });
  }
};
