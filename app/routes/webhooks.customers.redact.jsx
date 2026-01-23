import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * Mandatory compliance webhook: customers/redact
 * When a customer requests deletion of their data under GDPR/privacy laws
 */
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log("Customer redact payload:", JSON.stringify(payload));

  // Extract customer info from the payload
  const { customer, orders_to_redact } = payload;

  if (customer && customer.email) {
    // Find the shop in our database
    const shopRecord = await db.shop.findUnique({
      where: { shopifyDomain: shop },
    });

    if (shopRecord) {
      // Delete or anonymize customer data from our orders
      // Option 1: Delete orders entirely
      // Option 2: Anonymize PII (recommended for order history)

      const result = await db.order.updateMany({
        where: {
          shopId: shopRecord.id,
          email: customer.email,
        },
        data: {
          firstName: "REDACTED",
          lastName: "REDACTED",
          email: "redacted@redacted.com",
          phone: "REDACTED",
          address: "REDACTED",
          address2: "",
          city: "REDACTED",
          province: "REDACTED",
          postalCode: "",
        },
      });

      console.log(`Redacted ${result.count} orders for customer ${customer.email}`);
    }
  }

  // Return 200 to acknowledge receipt
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
