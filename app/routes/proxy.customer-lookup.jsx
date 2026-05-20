import { getShopByDomain } from "../lib/db.server";
import { lookupCustomer } from "../lib/sms.server";
import { normalizePhone } from "../lib/buyer.server";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { shop, phone } = await request.json();

    if (!shop || !phone) {
      return Response.json({ error: "Shop and phone are required" }, { status: 400 });
    }

    const normalizedPhone = normalizePhone(phone) || phone;
    // Validate phone format (Pakistan: +92 followed by 10 digits)
    if (!normalizedPhone.startsWith("+92") || normalizedPhone.length < 13) {
      return Response.json({ customer: null });
    }

    const shopData = await getShopByDomain(shop);
    if (!shopData) {
      return Response.json({ error: "Shop not found" }, { status: 404 });
    }

    const customer = await lookupCustomer(shopData.id, normalizedPhone);
    return Response.json({ customer });
  } catch (error) {
    console.error("Customer lookup error:", error);
    return Response.json({ customer: null });
  }
};
