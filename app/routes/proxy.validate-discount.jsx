import { getShopByDomain } from "../lib/db.server";

const DISCOUNT_QUERY = `
  query getDiscountByCode($code: String!) {
    codeDiscountNodeByCode(code: $code) {
      id
      codeDiscount {
        ... on DiscountCodeBasic {
          title
          status
          startsAt
          endsAt
          usageLimit
          asyncUsageCount
          minimumRequirement {
            ... on DiscountMinimumQuantity {
              greaterThanOrEqualToQuantity
            }
            ... on DiscountMinimumSubtotal {
              greaterThanOrEqualToSubtotal {
                amount
              }
            }
          }
          customerGets {
            value {
              ... on DiscountPercentage {
                percentage
              }
              ... on DiscountAmount {
                amount {
                  amount
                }
              }
            }
          }
        }
        ... on DiscountCodeFreeShipping {
          title
          status
          startsAt
          endsAt
        }
      }
    }
  }
`;

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { shop, code, subtotal, itemCount } = await request.json();

    if (!shop || !code) {
      return Response.json({ valid: false, error: "Shop and discount code are required" }, { status: 400 });
    }

    const shopData = await getShopByDomain(shop);
    if (!shopData) {
      return Response.json({ valid: false, error: "Shop not found" }, { status: 404 });
    }

    // Call Shopify GraphQL API
    const response = await fetch(
      `https://${shopData.shopifyDomain}/admin/api/2025-01/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": shopData.accessToken,
        },
        body: JSON.stringify({
          query: DISCOUNT_QUERY,
          variables: { code: code.trim() },
        }),
      }
    );

    const result = await response.json();
    const node = result.data?.codeDiscountNodeByCode;

    if (!node) {
      return Response.json({ valid: false, error: "Invalid discount code" });
    }

    const discount = node.codeDiscount;

    // Check if active
    if (discount.status !== "ACTIVE") {
      return Response.json({ valid: false, error: "This discount code is not active" });
    }

    // Check date range
    const now = new Date();
    if (discount.startsAt && new Date(discount.startsAt) > now) {
      return Response.json({ valid: false, error: "This discount code is not yet active" });
    }
    if (discount.endsAt && new Date(discount.endsAt) < now) {
      return Response.json({ valid: false, error: "This discount code has expired" });
    }

    // Check usage limit
    if (discount.usageLimit !== null && discount.usageLimit !== undefined) {
      if (discount.asyncUsageCount >= discount.usageLimit) {
        return Response.json({ valid: false, error: "This discount code has reached its usage limit" });
      }
    }

    // Handle free shipping discount
    if (!discount.customerGets) {
      return Response.json({
        valid: true,
        code: code.trim().toUpperCase(),
        title: discount.title,
        discountType: "free_shipping",
        discountValue: 0,
        discountAmount: 0,
      });
    }

    // Check minimum requirements
    const cartSubtotal = parseFloat(subtotal) || 0;
    const cartItemCount = parseInt(itemCount) || 0;
    const minReq = discount.minimumRequirement;

    if (minReq) {
      if (minReq.greaterThanOrEqualToSubtotal) {
        const minSubtotal = parseFloat(minReq.greaterThanOrEqualToSubtotal.amount);
        if (cartSubtotal < minSubtotal) {
          return Response.json({
            valid: false,
            error: `Minimum order amount of ${minSubtotal} required for this discount`,
          });
        }
      }
      if (minReq.greaterThanOrEqualToQuantity) {
        const minQty = parseInt(minReq.greaterThanOrEqualToQuantity);
        if (cartItemCount < minQty) {
          return Response.json({
            valid: false,
            error: `Minimum ${minQty} items required for this discount`,
          });
        }
      }
    }

    // Extract discount value and calculate amount
    const discountValue = discount.customerGets.value;
    let discountType, discountValueNum, discountAmount;

    if (discountValue.percentage !== undefined) {
      // Shopify returns percentage as 0.0-1.0 (e.g., 0.1 = 10%)
      discountType = "percentage";
      discountValueNum = discountValue.percentage * 100;
      discountAmount = cartSubtotal * discountValue.percentage;
    } else if (discountValue.amount) {
      discountType = "fixed_amount";
      discountValueNum = parseFloat(discountValue.amount.amount);
      discountAmount = Math.min(discountValueNum, cartSubtotal);
    } else {
      return Response.json({ valid: false, error: "Unsupported discount type" });
    }

    return Response.json({
      valid: true,
      code: code.trim().toUpperCase(),
      title: discount.title,
      discountType,
      discountValue: discountValueNum,
      discountAmount: parseFloat(discountAmount.toFixed(2)),
    });
  } catch (error) {
    console.error("Discount validation error:", error);
    return Response.json({ valid: false, error: "Failed to validate discount code" });
  }
};
