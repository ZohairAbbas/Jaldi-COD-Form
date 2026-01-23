import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  try {
    const { topic, shop, session, payload } = await authenticate.webhook(request);

    if (topic !== "ORDERS_CREATE") {
      return new Response("Invalid webhook topic", { status: 400 });
    }

    console.log(`📦 Webhook: Orders/Create for shop ${shop}, order ${payload.name}`);

    // Get shop from database
    const shopData = await prisma.shop.findUnique({
      where: { shopifyDomain: shop },
      include: { settings: true },
    });

    if (!shopData) {
      console.log(`⚠️  Shop ${shop} not found in database`);
      return new Response("Shop not found", { status: 404 });
    }

    // Check if order already exists (avoid duplicates)
    const existingOrder = await prisma.order.findUnique({
      where: { shopifyOrderId: `gid://shopify/Order/${payload.id}` },
    });

    if (existingOrder) {
      console.log(`ℹ️  Order ${payload.name} already exists in database`);
      return new Response("OK", { status: 200 });
    }

    // Check order creation mode
    const orderMode = shopData.settings?.orderCreationMode || "checkout";

    if (orderMode === "checkout") {
      // === CHECKOUT MODE ===
      // Create order in database from webhook data
      // This is the ONLY place orders are created in checkout mode

      const customer = payload.customer || {};
      const shippingAddress = payload.shipping_address || {};
      const lineItems = payload.line_items || [];

      // Calculate totals
      const subtotal = parseFloat(payload.subtotal_price || 0);
      const shipping = parseFloat(payload.total_shipping_price_set?.shop_money?.amount || 0);
      const total = parseFloat(payload.total_price || 0);

      // Prepare items data
      const items = lineItems.map((item) => ({
        variantId: `gid://shopify/ProductVariant/${item.variant_id}`,
        title: item.title,
        variant: item.variant_title,
        quantity: item.quantity,
        price: parseFloat(item.price),
      }));

      // Create order in database
      const dbOrder = await prisma.order.create({
        data: {
          shopId: shopData.id,
          shopifyOrderId: `gid://shopify/Order/${payload.id}`,
          shopifyOrderNumber: payload.name,
          firstName: shippingAddress.first_name || customer.first_name || "",
          lastName: shippingAddress.last_name || customer.last_name || "",
          email: customer.email || "",
          phone: shippingAddress.phone || customer.phone || "",
          address: shippingAddress.address1 || "",
          address2: shippingAddress.address2 || "",
          city: shippingAddress.city || "",
          province: shippingAddress.province || "",
          postalCode: shippingAddress.zip || "",
          country: shippingAddress.country || "",
          subtotal: subtotal,
          shipping: shipping,
          total: total,
          items: JSON.stringify(items),
          status: "completed",
          customFields: JSON.stringify({}),
        },
      });

      console.log(`✅ Order ${payload.name} created in database (ID: ${dbOrder.id})`);
      return new Response("OK", { status: 200 });

    } else {
      // === DRAFT MODE ===
      // Orders are created directly, webhook just logs
      console.log(`ℹ️  Draft mode active - order ${payload.name} was likely created via draft order API`);
      return new Response("OK", { status: 200 });
    }

  } catch (error) {
    console.error("❌ Webhook processing error:", error);
    return new Response("Internal error", { status: 500 });
  }
};
