import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  // Mark all unprocessed abandoned carts so the cron stops retrying them
  try {
    const shopData = await db.shop.findUnique({ where: { shopifyDomain: shop } });
    if (shopData) {
      await db.abandonedCart.updateMany({
        where: { shopId: shopData.id, shopifyDraftOrderId: null },
        data: {
          shopifyDraftOrderId: "APP_UNINSTALLED",
          lastError: "App uninstalled",
          lastFailedAt: new Date(),
        },
      });
    }
  } catch (err) {
    console.error("Failed to mark abandoned carts on uninstall:", err.message);
  }

  return new Response();
};
