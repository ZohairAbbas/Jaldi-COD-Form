import { authenticate } from "../shopify.server";
import db from "../db.server";
import { enqueueGrowzarEvent } from "../lib/growzar-outbox.server";
import { UNINSTALLED_SUBSCRIPTION } from "../lib/billing.server";

export const action = async ({ request }) => {
  const { shop, session, topic, webhookId } = await authenticate.webhook(request);

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

  // Shopify cancels the app's subscriptions on uninstall, so the shop is on
  // no plan from here. A reinstall re-syncs from Shopify on first load.
  try {
    await db.subscription.updateMany({
      where: { shop: { shopifyDomain: shop } },
      data: UNINSTALLED_SUBSCRIPTION,
    });
  } catch (err) {
    console.error("Failed to cancel subscription on uninstall:", err.message);
  }

  // Tell Growzar (API-CONTRACT §7, D-17), so it can switch this shop to
  // reconnect mode instead of showing stale data with no explanation. Only the
  // outbox insert is awaited; the send happens after we answer Shopify and is
  // retried from the outbox, because Growzar being down must never make
  // Shopify think this webhook failed.
  try {
    const triggeredAt = request.headers.get("X-Shopify-Triggered-At");
    await enqueueGrowzarEvent({
      topic: "app.uninstalled",
      shop,
      occurredAt: triggeredAt ? new Date(triggeredAt) : new Date(),
      actor: { type: "shopify" },
      data: {},
      sourceId: webhookId,
    });
  } catch (err) {
    console.error("Failed to queue Growzar app.uninstalled:", err.message);
  }

  return new Response();
};
