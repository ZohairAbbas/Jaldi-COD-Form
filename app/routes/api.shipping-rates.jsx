import { authenticate } from "../shopify.server";
import {
  getOrCreateShop,
  getShippingRates,
  createShippingRate,
  updateShippingRate,
  deleteShippingRate,
  getShippingRateById,
  upsertShopifyShippingRates,
} from "../lib/db.server";
import { normalizePrice } from "../lib/constants";
import { syncStorefrontConfigByDomain } from "../lib/storefront-config.server";

/**
 * GET /api/shipping-rates - List all shipping rates for the shop
 */
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);
  const shippingRates = await getShippingRates(shop.id);
  return Response.json({ shippingRates });
}

/**
 * POST /api/shipping-rates - Create or update shipping rate
 * DELETE /api/shipping-rates - Delete shipping rate
 */
export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  const data = await request.json();
  const method = request.method;

  // Refresh the inlined storefront config metafield after a successful mutation
  // so shipping rates reflect on the storefront's first paint (non-blocking).
  const sync = () => syncStorefrontConfigByDomain(admin, session.shop);

  try {
    if (method === "POST") {
      const { id, action: actionType, ...rateData } = data;

      // Handle Shopify import action
      if (actionType === "import_shopify") {
        const importedRates = await importShippingRatesFromShopify(
          shop.shopifyDomain,
          shop.accessToken
        );
        const savedRates = await upsertShopifyShippingRates(shop.id, importedRates);
        await sync();
        return Response.json({ success: true, imported: savedRates.length, rates: savedRates });
      }

      // Handle sync action (re-import existing Shopify rates)
      if (actionType === "sync_shopify") {
        const importedRates = await importShippingRatesFromShopify(
          shop.shopifyDomain,
          shop.accessToken
        );
        const savedRates = await upsertShopifyShippingRates(shop.id, importedRates);
        await sync();
        return Response.json({ success: true, synced: savedRates.length, rates: savedRates });
      }

      if (id) {
        // Update existing rate
        const rate = await updateShippingRate(id, rateData);
        await sync();
        return Response.json({ success: true, shippingRate: rate });
      } else {
        // Create new rate
        const rate = await createShippingRate(shop.id, rateData);
        await sync();
        return Response.json({ success: true, shippingRate: rate });
      }
    }

    if (method === "DELETE") {
      const { id } = data;
      if (!id) {
        return Response.json({ success: false, error: "Rate ID required" }, { status: 400 });
      }

      const rate = await getShippingRateById(id);
      if (!rate || rate.shopId !== shop.id) {
        return Response.json({ success: false, error: "Rate not found" }, { status: 404 });
      }

      await deleteShippingRate(id);
      await sync();
      return Response.json({ success: true });
    }

    return Response.json({ success: false, error: "Invalid method" }, { status: 405 });
  } catch (error) {
    console.error("Shipping rate API error:", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * Import shipping rates from Shopify Shipping Zones API
 */
async function importShippingRatesFromShopify(shopDomain, accessToken) {
  try {
    // Fetch shipping zones from Shopify REST API
    const response = await fetch(
      `https://${shopDomain}/admin/api/2025-01/shipping_zones.json`,
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Shopify API error:", errorText);
      throw new Error("Failed to fetch shipping zones from Shopify");
    }

    const { shipping_zones } = await response.json();
    const rates = [];

    for (const zone of shipping_zones) {
      // Import weight-based shipping rates
      for (const rate of zone.weight_based_shipping_rates || []) {
        const conditions = [];

        if (rate.weight_low != null && rate.weight_low > 0) {
          conditions.push({ type: "order_weight_gte", value: normalizePrice(rate.weight_low) });
        }

        if (rate.weight_high != null && rate.weight_high < 999999) {
          conditions.push({ type: "order_weight_lt", value: normalizePrice(rate.weight_high) });
        }

        rates.push({
          shopifyShippingRateId: `weight_${rate.id}`,
          name: `${zone.name} - ${rate.name}`,
          description: `Weight-based shipping for ${zone.name}`,
          price: normalizePrice(rate.price),
          conditions: conditions,
        });
      }

      // Import price-based shipping rates
      for (const rate of zone.price_based_shipping_rates || []) {
        const conditions = [];

        if (rate.min_order_subtotal != null) {
          conditions.push({
            type: "order_total_gte",
            value: normalizePrice(rate.min_order_subtotal)
          });
        }

        if (rate.max_order_subtotal != null) {
          conditions.push({
            type: "order_total_lt",
            value: normalizePrice(rate.max_order_subtotal)
          });
        }

        rates.push({
          shopifyShippingRateId: `price_${rate.id}`,
          name: `${zone.name} - ${rate.name}`,
          description: `Price-based shipping for ${zone.name}`,
          price: normalizePrice(rate.price),
          conditions: conditions,
        });
      }
    }

    return rates;
  } catch (error) {
    console.error("Error importing from Shopify:", error);
    throw error;
  }
}
