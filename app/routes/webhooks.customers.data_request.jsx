import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * Mandatory compliance webhook: customers/data_request
 * When a customer requests their data under GDPR/privacy laws
 */
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log("Customer data request payload:", JSON.stringify(payload));

  // Extract customer info from the payload
  const { customer, orders_requested } = payload;

  if (customer && customer.email) {
    // Find all orders for this customer in our database
    const shopRecord = await db.shop.findUnique({
      where: { shopifyDomain: shop },
    });

    if (shopRecord) {
      const customerOrders = await db.order.findMany({
        where: {
          shopId: shopRecord.id,
          email: customer.email,
        },
      });

      // Log the data we have (in production, you'd send this to the merchant)
      console.log(`Found ${customerOrders.length} orders for customer ${customer.email}`);

      // The merchant is responsible for providing this data to the customer
      // This webhook is just to notify you that a request was made
    }
  }

  // Return 200 to acknowledge receipt
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
