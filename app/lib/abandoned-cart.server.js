/**
 * Create a Shopify draft order for an abandoned cart
 */
export async function createDraftOrderForAbandonedCart(admin, abandonedCart, shopDomain) {
  try {
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
    if (abandonedCart.customerEmail) {
      customer.email = abandonedCart.customerEmail;
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
        email: abandonedCart.customerEmail,
        phone: abandonedCart.customerPhone,
        note: "Abandoned COD Form Checkout - Customer started but didn't complete",
        tags: ["abandoned_checkout_preventify_cod_form"],
        customAttributes: [
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
