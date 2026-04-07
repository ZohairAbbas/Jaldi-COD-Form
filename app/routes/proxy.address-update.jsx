import prisma from "../db.server";
import { normalizePhone } from "../lib/buyer.server";

/**
 * Update a saved BuyerAddress (label and/or address fields).
 *
 * POST /proxy/address-update
 * Body: { phone, addressId, label, address, address2, city, province, postalCode }
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
    const { phone, addressId, label, address, address2, city, province, postalCode } =
      await request.json();

    if (!addressId || !phone) {
      return Response.json({ success: false, error: "Missing required fields" }, { status: 400 });
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

    // Build update payload — only include fields that were provided
    const updateData = {};
    if (label !== undefined && label.trim()) updateData.label = label.trim();
    if (address !== undefined) updateData.address = address;
    if (address2 !== undefined) updateData.address2 = address2;
    if (city !== undefined) updateData.city = city;
    if (province !== undefined) updateData.province = province;
    if (postalCode !== undefined) updateData.postalCode = postalCode;

    await prisma.buyerAddress.update({
      where: { id: addressId },
      data: updateData,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("[address-update] Error:", error);
    return Response.json({ success: false, error: "Failed to update address" }, { status: 500 });
  }
};
