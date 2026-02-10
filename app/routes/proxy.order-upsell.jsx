import { getShopByDomain } from "../lib/db.server";
import { getCurrencyCode } from "../lib/constants";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const data = await request.json();
    const { shop: shopDomain, shopifyOrderId, upsellItem } = data;

    if (!shopDomain || !shopifyOrderId || !upsellItem) {
      return Response.json(
        { error: "Missing required fields: shop, shopifyOrderId, upsellItem" },
        { status: 400 }
      );
    }

    // Get shop from database
    const shop = await getShopByDomain(shopDomain);
    if (!shop) {
      return Response.json({ error: "Shop not found" }, { status: 404 });
    }

    // Extract numeric variant ID from GID
    const variantIdMatch = upsellItem.variantId.match(/ProductVariant\/(\d+)/);
    if (!variantIdMatch) {
      return Response.json({ error: "Invalid variant ID format" }, { status: 400 });
    }
    const numericVariantId = variantIdMatch[1];

    // Use Shopify REST API to add line item to existing order
    // Note: Shopify's GraphQL API doesn't allow editing orders directly,
    // so we use the REST API orderEdit endpoint or create a new order line

    try {
      // First, we need to begin an order edit session
      const beginEditResponse = await fetch(
        `https://${shop.shopifyDomain}/admin/api/2025-01/graphql.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': shop.accessToken,
          },
          body: JSON.stringify({
            query: `
              mutation orderEditBegin($id: ID!) {
                orderEditBegin(id: $id) {
                  calculatedOrder {
                    id
                  }
                  userErrors {
                    field
                    message
                  }
                }
              }
            `,
            variables: {
              id: shopifyOrderId,
            },
          }),
        }
      );

      const beginEditResult = await beginEditResponse.json();

      // Check for GraphQL errors
      if (beginEditResult.errors) {
        console.error("GraphQL errors:", beginEditResult.errors);
        return Response.json({
          success: false,
          error: beginEditResult.errors[0]?.message || "GraphQL error occurred",
        });
      }

      if (beginEditResult.data?.orderEditBegin?.userErrors?.length > 0) {
        console.error("Order edit begin errors:", beginEditResult.data.orderEditBegin.userErrors);
        return Response.json({
          success: false,
          error: beginEditResult.data.orderEditBegin.userErrors[0].message,
        });
      }

      const calculatedOrderId = beginEditResult.data?.orderEditBegin?.calculatedOrder?.id;
      if (!calculatedOrderId) {
        console.error("Failed to get calculated order ID. Full response:", JSON.stringify(beginEditResult, null, 2));
        return Response.json({
          success: false,
          error: "Failed to begin order edit - order may not be editable yet",
        });
      }

      // Add the variant to the order
      const addVariantResponse = await fetch(
        `https://${shop.shopifyDomain}/admin/api/2025-01/graphql.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': shop.accessToken,
          },
          body: JSON.stringify({
            query: `
              mutation orderEditAddVariant($id: ID!, $variantId: ID!, $quantity: Int!) {
                orderEditAddVariant(id: $id, variantId: $variantId, quantity: $quantity) {
                  calculatedOrder {
                    id
                  }
                  calculatedLineItem {
                    id
                  }
                  userErrors {
                    field
                    message
                  }
                }
              }
            `,
            variables: {
              id: calculatedOrderId,
              variantId: `gid://shopify/ProductVariant/${numericVariantId}`,
              quantity: upsellItem.quantity || 1,
            },
          }),
        }
      );

      const addVariantResult = await addVariantResponse.json();

      if (addVariantResult.data?.orderEditAddVariant?.userErrors?.length > 0) {
        console.error("Order edit add variant errors:", addVariantResult.data.orderEditAddVariant.userErrors);
        // Rollback the edit
        await rollbackOrderEdit(shop, calculatedOrderId);
        return Response.json({
          success: false,
          error: addVariantResult.data.orderEditAddVariant.userErrors[0].message,
        });
      }

      // Get the line item ID that was just added
      const lineItemId = addVariantResult.data?.orderEditAddVariant?.calculatedLineItem?.id;

      // If a custom price is provided and different from original, apply a discount
      if (lineItemId && upsellItem.price && upsellItem.price !== upsellItem.originalPrice) {
        const discountAmount = upsellItem.originalPrice - upsellItem.price;

        const applyDiscountResponse = await fetch(
          `https://${shop.shopifyDomain}/admin/api/2025-01/graphql.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': shop.accessToken,
            },
            body: JSON.stringify({
              query: `
                mutation orderEditAddLineItemDiscount($id: ID!, $lineItemId: ID!, $discount: OrderEditAppliedDiscountInput!) {
                  orderEditAddLineItemDiscount(id: $id, lineItemId: $lineItemId, discount: $discount) {
                    calculatedLineItem {
                      id
                    }
                    userErrors {
                      field
                      message
                    }
                  }
                }
              `,
              variables: {
                id: calculatedOrderId,
                lineItemId: lineItemId,
                discount: {
                  fixedValue: {
                    amount: discountAmount.toFixed(2),
                    currencyCode: getCurrencyCode(shop.country)
                  },
                  description: "Upsell discount"
                }
              },
            }),
          }
        );

        const discountResult = await applyDiscountResponse.json();

        if (discountResult.data?.orderEditAddLineItemDiscount?.userErrors?.length > 0) {
          console.error("Order edit add discount errors:", discountResult.data.orderEditAddLineItemDiscount.userErrors);
          // Continue anyway - the item was added, just at original price
        }
      }

      // Commit the order edit
      const commitResponse = await fetch(
        `https://${shop.shopifyDomain}/admin/api/2025-01/graphql.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': shop.accessToken,
          },
          body: JSON.stringify({
            query: `
              mutation orderEditCommit($id: ID!) {
                orderEditCommit(id: $id) {
                  order {
                    id
                  }
                  userErrors {
                    field
                    message
                  }
                }
              }
            `,
            variables: {
              id: calculatedOrderId,
            },
          }),
        }
      );

      const commitResult = await commitResponse.json();

      if (commitResult.data?.orderEditCommit?.userErrors?.length > 0) {
        console.error("Order edit commit errors:", commitResult.data.orderEditCommit.userErrors);
        return Response.json({
          success: false,
          error: commitResult.data.orderEditCommit.userErrors[0].message,
        });
      }

      return Response.json({
        success: true,
        message: "Upsell item added to order successfully",
      });

    } catch (shopifyError) {
      console.error("Shopify API error:", shopifyError);
      return Response.json({
        success: false,
        error: "Failed to add upsell to order",
      });
    }

  } catch (error) {
    console.error("Order upsell error:", error);
    return Response.json({
      success: false,
      error: error.message || "Failed to process upsell",
    }, { status: 500 });
  }
};

// Helper function to rollback order edit if something fails
async function rollbackOrderEdit(shop, calculatedOrderId) {
  try {
    await fetch(
      `https://${shop.shopifyDomain}/admin/api/2025-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': shop.accessToken,
        },
        body: JSON.stringify({
          query: `
            mutation orderEditRollback($id: ID!) {
              orderEditRollback(id: $id) {
                userErrors {
                  field
                  message
                }
              }
            }
          `,
          variables: {
            id: calculatedOrderId,
          },
        }),
      }
    );
  } catch (error) {
    console.error("Failed to rollback order edit:", error);
  }
}
