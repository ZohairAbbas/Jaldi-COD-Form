import { authenticate } from "../shopify.server";
import { redactCustomer, redactShop } from "../lib/gdpr.server";

/**
 * Shopify's mandatory compliance webhooks.
 *
 * These previously only logged, so Preventify answered 200 — an affirmative
 * claim it had handled the request — while deleting nothing.
 *
 * Error semantics differ by topic on purpose:
 *
 *   shop/redact returns 500 on failure so Shopify retries. A purge that fails
 *     halfway must resume; the work is idempotent, and rows already deleted are
 *     simply not found on the next attempt.
 *
 *   customers/* return 200 even on failure. Shopify's retry would not fix a
 *     malformed payload, and repeated delivery of a request we cannot action
 *     adds nothing. Failures are logged for manual handling.
 */
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  switch (topic) {
    case "CUSTOMERS_REDACT":
      return handleCustomerRedact(shop, payload);
    case "SHOP_REDACT":
      return handleShopRedact(shop);
    case "CUSTOMERS_DATA_REQUEST":
      return handleDataRequest(shop, payload);
    default:
      console.log(`[GDPR] Unhandled topic ${topic} for ${shop}`);
      return new Response();
  }
};

async function handleCustomerRedact(shop, payload) {
  try {
    const result = await redactCustomer({
      shopDomain: shop,
      email: payload?.customer?.email || null,
      phone: payload?.customer?.phone || null,
      orderIds: payload?.orders_to_redact || [],
    });

    // Counts only — naming the customer here would defeat the point.
    console.log(
      "[GDPR] " +
        JSON.stringify({ event: "customers_redact", shop, ...result })
    );
  } catch (error) {
    console.error(
      "[GDPR] customers/redact FAILED — needs manual action: " +
        JSON.stringify({ shop, error: error.message })
    );
  }

  return new Response();
}

async function handleShopRedact(shop) {
  try {
    const result = await redactShop({ shopDomain: shop });
    console.log(
      "[GDPR] " + JSON.stringify({ event: "shop_redact", shop, ...result })
    );
    return new Response();
  } catch (error) {
    console.error(
      "[GDPR] shop/redact FAILED — Shopify will retry: " +
        JSON.stringify({ shop, error: error.message })
    );
    // 500 so the purge resumes rather than being silently abandoned.
    return new Response("Shop redaction failed", { status: 500 });
  }
}

/**
 * Access requests are logged, not fulfilled automatically.
 *
 * Assembling and delivering an export is a larger piece of work than the
 * current request volume justifies — Shopify requires the endpoint to respond,
 * and at this scale the handful of real requests are handled by hand. The log
 * carries what is needed to find the data, and no customer PII.
 */
async function handleDataRequest(shop, payload) {
  console.log(
    "[GDPR] " +
      JSON.stringify({
        event: "customers_data_request",
        action_required: "manual_export",
        shop,
        shopifyCustomerId: payload?.customer?.id || null,
        orderCount: payload?.orders_requested?.length || 0,
      })
  );

  return new Response();
}
