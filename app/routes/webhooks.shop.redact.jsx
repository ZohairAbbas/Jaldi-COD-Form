import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * Mandatory compliance webhook: shop/redact
 * When a merchant requests deletion of their shop data (48 hours after uninstall)
 */
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log("Shop redact payload:", JSON.stringify(payload));

  // Find and delete all shop data
  const shopRecord = await db.shop.findUnique({
    where: { shopifyDomain: shop },
  });

  if (shopRecord) {
    // Delete all related data (orders, settings, form config)
    // Prisma cascade delete should handle related records if configured

    // Delete orders first
    await db.order.deleteMany({
      where: { shopId: shopRecord.id },
    });

    // Delete settings
    await db.settings.deleteMany({
      where: { shopId: shopRecord.id },
    });

    // Delete form config
    await db.formConfig.deleteMany({
      where: { shopId: shopRecord.id },
    });

    // Delete the shop record
    await db.shop.delete({
      where: { id: shopRecord.id },
    });

    // Delete sessions
    await db.session.deleteMany({
      where: { shop },
    });

    console.log(`Deleted all data for shop ${shop}`);
  }

  // Return 200 to acknowledge receipt
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
