import prisma from "../db.server.js";

/**
 * Generate cart permalink URL with pre-populated checkout fields
 * @param {string} shopDomain - The shop's myshopify.com domain
 * @param {object} orderData - Order data including items, customerInfo, and address
 * @returns {string} Cart permalink URL
 */
export function generateCartPermalink(shopDomain, orderData) {
  const { items, customerInfo, address } = orderData;

  // Build variant query: variantId:quantity,variantId:quantity
  const variantQuery = items
    .map((item) => {
      // Extract numeric ID from GraphQL ID (gid://shopify/ProductVariant/123456)
      const variantId = item.variantId.split("/").pop();
      return `${variantId}:${item.quantity}`;
    })
    .join(",");

  // Build checkout query params to pre-fill customer data
  // Use email if provided, otherwise use phone number (Shopify accepts phone in email field)
  const params = new URLSearchParams({
    "checkout[email]": customerInfo.email || customerInfo.phone,
    "checkout[shipping_address][first_name]": customerInfo.firstName,
    "checkout[shipping_address][last_name]": customerInfo.lastName,
    "checkout[shipping_address][phone]": customerInfo.phone,
    "checkout[shipping_address][address1]": address.address,
    "checkout[shipping_address][city]": address.city,
    "checkout[shipping_address][province]": address.province,
    "checkout[shipping_address][country]": address.country || "Pakistan",
    "checkout[shipping_address][zip]": address.postalCode || "",
    note: "COD Order - Cash on Delivery",
  });

  // Add address2 if provided
  if (address.address2) {
    params.append("checkout[shipping_address][address2]", address.address2);
  }

  // Build final URL
  return `https://${shopDomain}/cart/${variantQuery}?${params.toString()}`;
}

/**
 * Match incoming webhook order to pending DB order
 * @param {object} webhookOrder - Order data from Shopify webhook
 * @returns {Promise<object|null>} Matching order or null
 */
export async function matchWebhookOrderToDBOrder(webhookOrder) {
  // Match logic based on:
  // 1. Customer phone/email
  // 2. Line items (variant IDs + quantities)
  // 3. Created within last 30 minutes

  // Try to find orders with matching phone number first
  const phone = webhookOrder.customer?.phone;

  if (!phone) {
    console.log("Webhook order has no customer phone, cannot match");
    return null;
  }

  const potentialMatches = await prisma.order.findMany({
    where: {
      status: "pending",
      shopifyOrderId: null,
      phone: phone,
      createdAt: {
        gte: new Date(Date.now() - 30 * 60 * 1000), // Last 30 minutes
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (potentialMatches.length === 0) {
    return null;
  }

  // Compare line items to find exact match
  for (const dbOrder of potentialMatches) {
    try {
      const dbItems = JSON.parse(dbOrder.items);
      if (lineItemsMatch(dbItems, webhookOrder.line_items)) {
        return dbOrder;
      }
    } catch (error) {
      console.error(`Error parsing items for order ${dbOrder.id}:`, error);
    }
  }

  return null;
}

/**
 * Compare line items from DB order with webhook order line items
 * @param {Array} dbItems - Items from database order
 * @param {Array} webhookLineItems - Line items from webhook
 * @returns {boolean} True if items match
 */
function lineItemsMatch(dbItems, webhookLineItems) {
  // Check if item counts match
  if (dbItems.length !== webhookLineItems.length) {
    return false;
  }

  // Create a map of webhook items by variant ID
  const webhookItemMap = new Map();
  webhookLineItems.forEach((item) => {
    // Webhook uses numeric variant_id
    const variantId = item.variant_id?.toString();
    if (variantId) {
      webhookItemMap.set(variantId, item.quantity);
    }
  });

  // Check if all DB items exist in webhook with matching quantities
  for (const dbItem of dbItems) {
    // Extract numeric ID from GraphQL ID (gid://shopify/ProductVariant/123456)
    const variantId = dbItem.variantId.split("/").pop();

    const webhookQuantity = webhookItemMap.get(variantId);

    // If variant not found or quantities don't match, not a match
    if (!webhookQuantity || webhookQuantity !== dbItem.quantity) {
      return false;
    }
  }

  return true;
}
