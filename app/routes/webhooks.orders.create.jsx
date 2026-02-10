import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  try {
    // Check if order has our cart attributes indicating it came from Pay with Card
    const noteAttributes = payload.note_attributes || [];
    const preventifySource = noteAttributes.find(
      (attr) => attr.name === "_preventify_source"
    );

    // Only process orders that came from our Pay with Card flow
    if (!preventifySource || preventifySource.value !== "card_checkout") {
      return new Response();
    }

    // Find the shop in our database
    const shopData = await db.shop.findUnique({
      where: { shopifyDomain: shop },
    });

    if (!shopData) {
      console.error("Shop not found in database:", shop);
      return new Response();
    }

    // Check if order already exists (prevent duplicates)
    const existingOrder = await db.order.findUnique({
      where: { shopifyOrderId: payload.id.toString() },
    });

    if (existingOrder) {
      return new Response();
    }

    // Extract customer info from order
    const shippingAddress = payload.shipping_address || {};
    const customer = payload.customer || {};

    // Extract line items
    const items = (payload.line_items || []).map((item) => ({
      id: item.product_id?.toString(),
      variantId: `gid://shopify/ProductVariant/${item.variant_id}`,
      title: item.title,
      variant: item.variant_title,
      quantity: item.quantity,
      price: parseFloat(item.price),
      image: null, // Not available in webhook payload
    }));

    // Calculate totals
    const subtotal = parseFloat(payload.subtotal_price || 0);
    const shipping = parseFloat(payload.total_shipping_price_set?.shop_money?.amount || 0);
    const total = parseFloat(payload.total_price || 0);

    // Create order in database
    const order = await db.order.create({
      data: {
        shopId: shopData.id,
        shopifyOrderId: payload.id.toString(),
        shopifyOrderNumber: payload.name || payload.order_number?.toString(),
        firstName: shippingAddress.first_name || customer.first_name || "",
        lastName: shippingAddress.last_name || customer.last_name || "",
        email: payload.email || customer.email || null,
        phone: shippingAddress.phone || customer.phone || payload.phone || "",
        address: shippingAddress.address1 || "",
        address2: shippingAddress.address2 || null,
        city: shippingAddress.city || "",
        province: shippingAddress.province || "",
        postalCode: shippingAddress.zip || null,
        country: shippingAddress.country || "Pakistan",
        subtotal,
        shipping,
        total,
        items: JSON.stringify(items),
        paymentMethod: "card",
        status: payload.financial_status === "paid" ? "confirmed" : "pending",
        customFields: JSON.stringify({}),
      },
    });

    return new Response();
  } catch (error) {
    console.error("Error processing orders/create webhook:", error);
    // Return 200 to prevent Shopify from retrying
    return new Response();
  }
};
