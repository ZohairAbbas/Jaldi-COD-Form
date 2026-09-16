import prisma from "../db.server";
import { normalizePhone } from "../lib/buyer.server";
import { authenticateJsonProxyRequest } from "../lib/proxy-auth.server";
import { verifyVerificationToken } from "../lib/verification.server";

/**
 * Delete a saved BuyerAddress.
 *
 * POST /proxy/address-delete
 * Body: { phone, addressId }
 * Returns: { success: boolean }
 *
 * Security: requires phone to confirm ownership — address must belong to the
 * GlobalBuyer with that phone.
 */
export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    // Ownership was established by knowing the phone number alone, which anyone
    // can guess — and this one deletes. It now requires a verification token
    // for that same number, issued only after WhatsApp login or an OTP.
    const { data, shopDomain, errorResponse } =
      await authenticateJsonProxyRequest(request);
    if (errorResponse) return errorResponse;

    const { phone, addressId } = data;

    if (!addressId || !phone) {
      return Response.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    if (!verifyVerificationToken(data.verificationToken, { phone, shopDomain })) {
      return Response.json(
        { success: false, error: "Verification required" },
        { status: 401 }
      );
    }

    const normalized = normalizePhone(phone);
    if (!normalized) {
      return Response.json({ success: false, error: "Invalid phone" }, { status: 400 });
    }

    // Verify ownership: address must belong to this buyer's phone
    const buyerAddress = await prisma.buyerAddress.findFirst({
      where: {
        id: addressId,
        buyer: { phone: normalized },
      },
    });

    if (!buyerAddress) {
      return Response.json({ success: false, error: "Address not found" }, { status: 404 });
    }

    await prisma.buyerAddress.delete({
      where: { id: addressId },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("[address-delete] Error:", error);
    return Response.json({ success: false, error: "Failed to delete address" }, { status: 500 });
  }
};
