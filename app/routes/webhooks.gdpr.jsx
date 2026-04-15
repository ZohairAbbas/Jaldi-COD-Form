import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  // GDPR compliance topics: shop/redact, customers/redact, customers/data_request
  // Shopify requires these endpoints to return 200 for App Store compliance.
  console.log(`[GDPR] ${topic} received for shop: ${shop}`, {
    shopId: payload?.shop_id,
    customerId: payload?.customer?.id,
  });

  return new Response();
};
