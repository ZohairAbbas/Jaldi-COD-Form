import { getShopByDomain } from "../lib/db.server";
import { verifyOTP } from "../lib/sms.server";
import { markBuyerVerified } from "../lib/buyer.server";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { shop, phone, otp } = await request.json();

    if (!shop || !phone || !otp) {
      return Response.json({ error: "Shop, phone, and OTP are required" }, { status: 400 });
    }

    const shopData = await getShopByDomain(shop);
    if (!shopData) {
      return Response.json({ error: "Shop not found" }, { status: 404 });
    }

    const result = await verifyOTP(shopData.id, phone, otp);

    // On successful OTP verification, mark buyer as globally verified
    if (result.success) {
      try {
        await markBuyerVerified(phone);
      } catch (err) {
        console.error("Failed to mark buyer verified:", err);
      }
    }

    return Response.json(result);
  } catch (error) {
    console.error("OTP verify error:", error);
    return Response.json(
      { error: error.message || "Failed to verify OTP" },
      { status: 500 }
    );
  }
};
