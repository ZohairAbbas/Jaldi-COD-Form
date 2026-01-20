import db from "../db.server";
import { createDraftOrderForAbandonedCart } from "../lib/abandoned-cart.server";

const ABANDONED_THRESHOLD_MINUTES = 1;

/**
 * Catch-all proxy route handler
 * Handles: /apps/jaldi-cod/proxy/*
 */
export const action = async ({ request, params }) => {
  const path = params["*"]; // Get the wildcard path

  // Route to appropriate handler based on path
  switch (path) {
    case "cron-abandoned-carts":
      return handleCronAbandonedCarts(request);

    case "abandoned-carts-create-draft":
      return handleCreateDraftOrders(request);

    case "session-track":
      return handleSessionTrack(request);

    default:
      return Response.json({ error: "Not found" }, { status: 404 });
  }
};

// Handler for cron abandoned carts
async function handleCronAbandonedCarts(request) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const abandonedThreshold = new Date(
      Date.now() - ABANDONED_THRESHOLD_MINUTES * 60 * 1000
    );

    const abandonedSessions = await db.orderSession.findMany({
      where: {
        status: "active",
        lastActivityAt: {
          lt: abandonedThreshold,
        },
        OR: [
          { userEmail: { not: null } },
          { userPhone: { not: null } },
        ],
      },
      include: {
        shop: true,
      },
    });

    console.log(`Found ${abandonedSessions.length} abandoned sessions`);

    const results = {
      total: abandonedSessions.length,
      processed: 0,
      errors: 0,
    };

    for (const session of abandonedSessions) {
      try {
        await db.orderSession.update({
          where: { id: session.id },
          data: {
            status: "abandoned",
            abandonedAt: new Date(),
          },
        });

        let formData = {};
        try {
          formData = session.formData ? JSON.parse(session.formData) : {};
        } catch (e) {
          console.error("Failed to parse form data:", e);
        }

        await db.abandonedCart.create({
          data: {
            shopId: session.shopId,
            sessionId: session.sessionId,
            customerEmail: session.userEmail,
            customerPhone: session.userPhone,
            customerFirstName: formData.firstName || null,
            customerLastName: formData.lastName || null,
            cartItems: session.cartItems,
            totalAmount: session.totalAmount,
          },
        });

        results.processed++;
      } catch (error) {
        console.error(`Failed to process abandoned session ${session.id}:`, error);
        results.errors++;
      }
    }

    return Response.json({
      success: true,
      message: `Processed ${results.processed} abandoned carts`,
      results,
    });
  } catch (error) {
    console.error("Abandoned cart cron job error:", error);
    return Response.json(
      {
        success: false,
        error: error.message || "Failed to process abandoned carts",
      },
      { status: 500 }
    );
  }
}

// Handler for creating draft orders
async function handleCreateDraftOrders(request) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    const { abandonedCartId } = body;

    let abandonedCarts = [];

    if (abandonedCartId) {
      const cart = await db.abandonedCart.findUnique({
        where: { id: abandonedCartId },
        include: { shop: true },
      });

      if (!cart) {
        return Response.json({ error: "Abandoned cart not found" }, { status: 404 });
      }

      abandonedCarts = [cart];
    } else {
      abandonedCarts = await db.abandonedCart.findMany({
        where: {
          shopifyDraftOrderId: null,
          recovered: false,
        },
        include: { shop: true },
      });
    }

    const results = {
      total: abandonedCarts.length,
      success: 0,
      failed: 0,
      errors: [],
    };

    for (const cart of abandonedCarts) {
      try {
        const admin = {
          graphql: async (query, options) => {
            const response = await fetch(
              `https://${cart.shop.shopifyDomain}/admin/api/2025-01/graphql.json`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Shopify-Access-Token": cart.shop.accessToken,
                },
                body: JSON.stringify({
                  query: query,
                  variables: options?.variables,
                }),
              }
            );
            return response;
          },
        };

        const draftOrderResult = await createDraftOrderForAbandonedCart(
          admin,
          cart,
          cart.shop.shopifyDomain
        );

        if (draftOrderResult.success) {
          await db.abandonedCart.update({
            where: { id: cart.id },
            data: {
              shopifyDraftOrderId: draftOrderResult.draftOrderId,
              draftOrderUrl: draftOrderResult.draftOrderUrl,
            },
          });

          results.success++;
        } else {
          results.failed++;
          results.errors.push({
            cartId: cart.id,
            error: draftOrderResult.error,
          });
        }
      } catch (error) {
        console.error(`Failed to create draft order for cart ${cart.id}:`, error);
        results.failed++;
        results.errors.push({
          cartId: cart.id,
          error: error.message,
        });
      }
    }

    return Response.json({
      success: true,
      message: `Created ${results.success} draft orders`,
      results,
    });
  } catch (error) {
    console.error("Create draft orders error:", error);
    return Response.json(
      {
        success: false,
        error: error.message || "Failed to create draft orders",
      },
      { status: 500 }
    );
  }
}

// Handler for session tracking
async function handleSessionTrack(request) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    const {
      shop,
      sessionId,
      email,
      phone,
      cartItems,
      totalAmount,
      formData,
    } = body;

    if (!shop || !sessionId) {
      return Response.json(
        { error: "Shop and sessionId are required" },
        { status: 400 }
      );
    }

    const shopData = await db.shop.findUnique({
      where: { shopifyDomain: shop },
    });

    if (!shopData) {
      return Response.json({ error: "Shop not found" }, { status: 404 });
    }

    const existingSession = await db.orderSession.findUnique({
      where: { sessionId },
    });

    if (existingSession) {
      await db.orderSession.update({
        where: { sessionId },
        data: {
          userEmail: email || existingSession.userEmail,
          userPhone: phone || existingSession.userPhone,
          cartItems: JSON.stringify(cartItems),
          totalAmount: totalAmount || 0,
          formData: formData ? JSON.stringify(formData) : existingSession.formData,
          lastActivityAt: new Date(),
        },
      });

      return Response.json({ success: true, action: "updated" });
    } else {
      await db.orderSession.create({
        data: {
          shopId: shopData.id,
          sessionId,
          userEmail: email,
          userPhone: phone,
          cartItems: JSON.stringify(cartItems),
          totalAmount: totalAmount || 0,
          formData: formData ? JSON.stringify(formData) : null,
          status: "active",
        },
      });

      return Response.json({ success: true, action: "created" });
    }
  } catch (error) {
    console.error("Session tracking error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Allow GET for testing
export const loader = async ({ params }) => {
  const path = params["*"];

  return Response.json({
    message: `Proxy route handler for: ${path}`,
    availableEndpoints: [
      "cron-abandoned-carts",
      "abandoned-carts-create-draft",
      "session-track",
    ],
  });
};
