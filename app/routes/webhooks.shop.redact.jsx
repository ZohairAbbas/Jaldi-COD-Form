import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  // GDPR shop redact: shop has requested erasure of their data.
  // Shopify requires this endpoint to return 200 for App Store compliance.
  console.log(`[GDPR] shop/redact received for shop: ${shop}`, {
    topic,
    shopId: payload?.shop_id,
  });

  return new Response();
};
