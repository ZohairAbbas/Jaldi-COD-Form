import { isValidPhoneNumber } from 'libphonenumber-js';

// Validate email format
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

// Validate phone using libphonenumber-js for proper E.164 validation
function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  try {
    return isValidPhoneNumber(phone);
  } catch {
    return false;
  }
}

/**
 * Create a Shopify draft order for an abandoned cart
 * Returns { success: false, skipped: true } if no valid contact info
 */
export async function createDraftOrderForAbandonedCart(admin, abandonedCart, shopDomain) {
  try {
    // Validate email and phone
    const validEmail = isValidEmail(abandonedCart.customerEmail)
      ? abandonedCart.customerEmail.trim()
      : null;
    const validPhone = isValidPhone(abandonedCart.customerPhone)
      ? abandonedCart.customerPhone.trim()
      : null;

    // Skip if no valid contact info (can't recover without contact)
    if (!validEmail && !validPhone) {
      return {
        success: false,
        skipped: true,
        error: "No valid contact info (email or phone)",
      };
    }

    // Parse cart items
    const cartItems = JSON.parse(abandonedCart.cartItems);

    // Build line items for draft order
    const lineItems = cartItems.map(item => {
      // Extract variant ID from GID
      const variantId = item.variantId.replace('gid://shopify/ProductVariant/', '');

      return {
        variantId: `gid://shopify/ProductVariant/${variantId}`,
        quantity: item.quantity,
      };
    });

    // Build customer info
    const customer = {};
    if (validEmail) {
      customer.email = validEmail;
    }
    if (abandonedCart.customerFirstName) {
      customer.firstName = abandonedCart.customerFirstName;
    }
    if (abandonedCart.customerLastName) {
      customer.lastName = abandonedCart.customerLastName;
    }

    // GraphQL mutation to create draft order
    const mutation = `
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            name
            invoiceUrl
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        lineItems: lineItems,
        email: validEmail, // Only pass if valid
        phone: validPhone, // Only pass if valid
        note: "",
        tags: ["abandoned_checkout_preventify_cod_form"],
        customAttributes: [
          {
            // Formerly the order note — now surfaced in the order's Additional details.
            key: "Status",
            value: "Abandoned COD Form Checkout - Customer started but didn't complete",
          },
          {
            key: "abandoned_at",
            value: abandonedCart.abandonedAt.toISOString(),
          },
          {
            key: "session_id",
            value: abandonedCart.sessionId,
          },
        ],
      },
    };

    // Add customer info if available
    if (Object.keys(customer).length > 0) {
      variables.input.customAttributes.push({
        key: "customer_info",
        value: JSON.stringify(customer),
      });
    }

    const response = await admin.graphql(mutation, { variables });

    // Detect invalid API token (uninstalled shop)
    if (response.status === 401) {
      return {
        success: false,
        invalidToken: true,
        error: "401 Unauthorized: Invalid API token",
      };
    }

    // Guard against non-JSON responses (Shopify 5xx, rate limit HTML pages)
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return {
        success: false,
        error: `Non-JSON response from Shopify (${response.status})`,
      };
    }

    const data = await response.json();

    if (data.errors) {
      console.error("GraphQL errors:", data.errors);
      return {
        success: false,
        error: data.errors[0]?.message || "GraphQL error",
      };
    }

    const result = data.data.draftOrderCreate;

    if (result.userErrors && result.userErrors.length > 0) {
      console.error("Draft order creation errors:", result.userErrors);
      return {
        success: false,
        error: result.userErrors[0].message,
      };
    }

    const draftOrder = result.draftOrder;
    const draftOrderId = draftOrder.id.replace('gid://shopify/DraftOrder/', '');

    return {
      success: true,
      draftOrderId: draftOrder.id,
      draftOrderName: draftOrder.name,
      draftOrderUrl: `https://${shopDomain}/admin/draft_orders/${draftOrderId}`,
      invoiceUrl: draftOrder.invoiceUrl,
    };
  } catch (error) {
    console.error("Failed to create draft order:", error);
    return {
      success: false,
      error: error.message || "Failed to create draft order",
    };
  }
}
