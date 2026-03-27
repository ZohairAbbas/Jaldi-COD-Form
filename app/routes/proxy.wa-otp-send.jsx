import { getShopByDomain } from "../lib/db.server";
import { sendWhatsAppOTP } from "../lib/whatsapp.server";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { shop, phone } = await request.json();

    if (!shop || !phone) {
      return Response.json(
        { error: "Shop and phone are required" },
        { status: 400 }
      );
    }

    const shopData = await getShopByDomain(shop);
    if (!shopData) {
      return Response.json({ error: "Shop not found" }, { status: 404 });
    }

    const result = await sendWhatsAppOTP(shopData.id, phone);

    return Response.json(result);
  } catch (error) {
    console.error("WhatsApp OTP send error:", error);
    return Response.json(
      { error: error.message || "Failed to send WhatsApp OTP" },
      { status: 500 }
    );
  }
};
