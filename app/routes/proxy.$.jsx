import db from "../db.server";
import { createDraftOrderForAbandonedCart } from "../lib/abandoned-cart.server";
import { syncShopFulfillments } from "../lib/fulfillment-sync.server";


const ABANDONED_THRESHOLD_MINUTES = 10;
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Catch-all proxy route handler
 * Handles: /apps/preventify/proxy/*
 */
export const action = async ({ request, params }) => {
  const path = params["*"];

  switch (path) {
    case "cron-abandoned-carts":
      return handleCronAbandonedCarts(request);
    case "abandoned-carts-create-draft":
      return handleCreateDraftOrders(request);
    case "session-track":
      return handleSessionTrack(request);
    case "cron-fulfillment-sync":
      return handleFulfillmentSync(request);
    case "cron-health":
      return handleCronHealth(request);
    default:
      return Response.json({ error: "Not found" }, { status: 404 });
  }
};

// Verify cron secret
function verifyCronSecret(request) {
  if (!CRON_SECRET) return true; // Skip if not configured (local dev)
  const secret = request.headers.get("X-Cron-Secret");
  return secret === CRON_SECRET;
}

// Log cron job execution
async function logCronJob(jobName, status, details = {}) {
  try {
    await db.cronLog.create({
      data: {
        jobName,
        status,
        message: details.message || null,
        processed: details.processed || 0,
        errors: details.errors || 0,
        duration: details.duration || null,
      },
    });
  } catch (error) {
    console.error("Failed to log cron job:", error);
  }
}

// Handler for cron abandoned carts
async function handleCronAbandonedCarts(request) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  if (!verifyCronSecret(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  await logCronJob("abandoned-carts-detection", "started");

  try {
    const abandonedThreshold = new Date(
      Date.now() - ABANDONED_THRESHOLD_MINUTES * 60 * 1000
    );

    // Find all active sessions across ALL shops that are stale
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

    const results = {
      total: abandonedSessions.length,
      processed: 0,
      errors: 0,
      byShop: {},
    };

    for (const session of abandonedSessions) {
      try {
        const shopDomain = session.shop.shopifyDomain;
        if (!results.byShop[shopDomain]) {
          results.byShop[shopDomain] = { processed: 0, errors: 0 };
        }

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
        results.byShop[shopDomain].processed++;
      } catch (error) {
        console.error(`Failed to process abandoned session ${session.id}:`, error);
        results.errors++;
        if (results.byShop[session.shop?.shopifyDomain]) {
          results.byShop[session.shop.shopifyDomain].errors++;
        }
      }
    }

    const duration = Date.now() - startTime;
    await logCronJob("abandoned-carts-detection", "completed", {
      message: `Processed ${results.processed} abandoned carts`,
      processed: results.processed,
      errors: results.errors,
      duration,
    });

    return Response.json({
      success: true,
      message: `Processed ${results.processed} abandoned carts`,
      results,
      duration: `${duration}ms`,
    });
  } catch (error) {
    console.error("Abandoned cart cron job error:", error);

    const duration = Date.now() - startTime;
    await logCronJob("abandoned-carts-detection", "failed", {
      message: error.message,
      duration,
    });

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

  if (!verifyCronSecret(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  await logCronJob("draft-orders-creation", "started");

  try {
    const body = await request.json().catch(() => ({}));
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
          retryCount: { lt: 3 },
        },
        include: { shop: true },
      });
    }

    const results = {
      total: abandonedCarts.length,
      success: 0,
      skipped: 0, // Carts skipped due to no valid contact info
      failed: 0,
      errors: [],
      byShop: {},
    };

    for (const cart of abandonedCarts) {
      const shopDomain = cart.shop.shopifyDomain;
      if (!results.byShop[shopDomain]) {
        results.byShop[shopDomain] = { success: 0, skipped: 0, failed: 0 };
      }

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
          results.byShop[shopDomain].success++;
        } else if (draftOrderResult.skipped) {
          // Skipped due to no valid contact info - mark with special ID so we don't retry
          await db.abandonedCart.update({
            where: { id: cart.id },
            data: {
              shopifyDraftOrderId: "SKIPPED_NO_CONTACT",
            },
          });

          results.skipped++;
          results.byShop[shopDomain].skipped++;
        } else {
          const errorMsg = draftOrderResult.error || "Unknown error";

          if (draftOrderResult.invalidToken === true) {
            // Mark ALL pending carts for this shop — invalid/revoked access token
            await db.abandonedCart.updateMany({
              where: { shopId: cart.shopId, shopifyDraftOrderId: null },
              data: {
                shopifyDraftOrderId: "INVALID_TOKEN",
                lastError: errorMsg,
                lastFailedAt: new Date(),
              },
            });
          } else {
            await db.abandonedCart.update({
              where: { id: cart.id },
              data: {
                retryCount: { increment: 1 },
                lastFailedAt: new Date(),
                lastError: errorMsg,
              },
            });
          }

          results.failed++;
          results.byShop[shopDomain].failed++;
          results.errors.push({
            cartId: cart.id,
            shop: shopDomain,
            error: errorMsg,
          });
        }
      } catch (error) {
        console.error(`Failed to create draft order for cart ${cart.id}:`, error);
        const errorMsg = error.message || "Exception during draft order creation";
        await db.abandonedCart.update({
          where: { id: cart.id },
          data: {
            retryCount: { increment: 1 },
            lastFailedAt: new Date(),
            lastError: errorMsg,
          },
        });
        results.failed++;
        results.byShop[shopDomain].failed++;
        results.errors.push({
          cartId: cart.id,
          shop: shopDomain,
          error: errorMsg,
        });
      }
    }

    const duration = Date.now() - startTime;
    await logCronJob("draft-orders-creation", "completed", {
      message: `Created ${results.success} draft orders, skipped ${results.skipped}`,
      processed: results.success,
      errors: results.failed,
      duration,
    });

    return Response.json({
      success: true,
      message: `Created ${results.success} draft orders, skipped ${results.skipped} (no valid contact)`,
      results,
      duration: `${duration}ms`,
    });
  } catch (error) {
    console.error("Create draft orders error:", error);

    const duration = Date.now() - startTime;
    await logCronJob("draft-orders-creation", "failed", {
      message: error.message,
      duration,
    });

    return Response.json(
      {
        success: false,
        error: error.message || "Failed to create draft orders",
      },
      { status: 500 }
    );
  }
}

// Validate email format
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

// Validate phone - lenient validation (minimum 7 digits after stripping non-digits)
function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const digitsOnly = phone.replace(/\D/g, '');
  return digitsOnly.length >= 7;
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

    // Only store email/phone if valid format
    const validEmail = isValidEmail(email) ? email.trim() : null;
    const validPhone = isValidPhone(phone) ? phone.trim() : null;

    await db.orderSession.upsert({
      where: { sessionId },
      update: {
        userEmail: validEmail || undefined,
        userPhone: validPhone || undefined,
        cartItems: JSON.stringify(cartItems),
        totalAmount: totalAmount || 0,
        formData: formData ? JSON.stringify(formData) : undefined,
        lastActivityAt: new Date(),
      },
      create: {
        shopId: shopData.id,
        sessionId,
        userEmail: validEmail,
        userPhone: validPhone,
        cartItems: JSON.stringify(cartItems),
        totalAmount: totalAmount || 0,
        formData: formData ? JSON.stringify(formData) : null,
        status: "active",
      },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Session tracking error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Handler for fulfillment sync (risk intelligence)
async function handleFulfillmentSync(request) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  if (!verifyCronSecret(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  await logCronJob("fulfillment-sync", "started");

  try {
    // Get all shops with active orders that need syncing (skip shops with invalid tokens)
    const shopsWithPendingOrders = await db.shop.findMany({
      where: {
        tokenInvalid: false,
        orders: {
          some: {
            shopifyOrderId: { not: null },
            OR: [
              { deliveryOutcome: null },
              { deliveryOutcome: { notIn: ["delivered", "returned", "cancelled"] } },
            ],
          },
        },
      },
      select: {
        id: true,
        shopifyDomain: true,
        accessToken: true,
      },
    });

    const results = {
      shopsProcessed: 0,
      totalProcessed: 0,
      totalUpdated: 0,
      totalErrors: 0,
      byShop: {},
    };

    for (const shop of shopsWithPendingOrders) {
      try {
        const shopResult = await syncShopFulfillments(shop.id, shop.shopifyDomain, shop.accessToken);

        // If shop returned an invalid token signal, mark it and skip future runs
        if (shopResult.invalidToken) {
          await db.shop.update({
            where: { id: shop.id },
            data: { tokenInvalid: true },
          });
          console.log(`[fulfillment-sync] Marked ${shop.shopifyDomain} as tokenInvalid — will be skipped in future runs`);
          results.byShop[shop.shopifyDomain] = { skipped: true, reason: "invalidToken" };
          continue;
        }

        results.shopsProcessed++;
        results.totalProcessed += shopResult.processed;
        results.totalUpdated += shopResult.updated;
        results.totalErrors += shopResult.errors;
        results.byShop[shop.shopifyDomain] = shopResult;
      } catch (err) {
        console.error(`[fulfillment-sync] Shop ${shop.shopifyDomain} failed:`, err);
        results.totalErrors++;
        results.byShop[shop.shopifyDomain] = { error: err.message };
      }
    }

    const duration = Date.now() - startTime;
    await logCronJob("fulfillment-sync", "completed", {
      message: `Synced ${results.totalUpdated} orders across ${results.shopsProcessed} shops`,
      processed: results.totalProcessed,
      errors: results.totalErrors,
      duration,
    });

    return Response.json({
      success: true,
      message: `Synced ${results.totalUpdated} orders across ${results.shopsProcessed} shops`,
      results,
      duration: `${duration}ms`,
    });
  } catch (error) {
    console.error("Fulfillment sync error:", error);

    const duration = Date.now() - startTime;
    await logCronJob("fulfillment-sync", "failed", {
      message: error.message,
      duration,
    });

    return Response.json(
      { success: false, error: error.message || "Failed to sync fulfillments" },
      { status: 500 }
    );
  }
}

// Health check endpoint
async function handleCronHealth(request) {
  try {
    const recentLogs = await db.cronLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const lastAbandonedJob = recentLogs.find(
      (l) => l.jobName === "abandoned-carts-detection" && l.status === "completed"
    );
    const lastDraftJob = recentLogs.find(
      (l) => l.jobName === "draft-orders-creation" && l.status === "completed"
    );
    const lastFulfillmentJob = recentLogs.find(
      (l) => l.jobName === "fulfillment-sync" && l.status === "completed"
    );

    // Check if jobs are running on schedule
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const sixtyMinutesAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

    const abandonedJobHealthy = lastAbandonedJob &&
      new Date(lastAbandonedJob.createdAt) > tenMinutesAgo;
    const draftJobHealthy = lastDraftJob &&
      new Date(lastDraftJob.createdAt) > sixtyMinutesAgo;
    const fulfillmentJobHealthy = lastFulfillmentJob &&
      new Date(lastFulfillmentJob.createdAt) > fourHoursAgo;

    return Response.json({
      status: abandonedJobHealthy && draftJobHealthy && fulfillmentJobHealthy ? "healthy" : "degraded",
      jobs: {
        abandonedCartsDetection: {
          lastRun: lastAbandonedJob?.createdAt || null,
          lastStatus: lastAbandonedJob?.status || "never_run",
          lastProcessed: lastAbandonedJob?.processed || 0,
          healthy: abandonedJobHealthy || false,
        },
        draftOrdersCreation: {
          lastRun: lastDraftJob?.createdAt || null,
          lastStatus: lastDraftJob?.status || "never_run",
          lastProcessed: lastDraftJob?.processed || 0,
          healthy: draftJobHealthy || false,
        },
        fulfillmentSync: {
          lastRun: lastFulfillmentJob?.createdAt || null,
          lastStatus: lastFulfillmentJob?.status || "never_run",
          lastProcessed: lastFulfillmentJob?.processed || 0,
          healthy: fulfillmentJobHealthy || false,
        },
      },
      recentLogs: recentLogs.slice(0, 10),
    });
  } catch (error) {
    return Response.json({
      status: "error",
      error: error.message,
    }, { status: 500 });
  }
}

// Allow GET for testing
export const loader = async ({ params }) => {
  const path = params["*"];

  if (path === "cron-health") {
    return handleCronHealth({ method: "GET" });
  }

  return Response.json({
    message: `Proxy route handler for: ${path}`,
    availableEndpoints: [
      "cron-abandoned-carts",
      "abandoned-carts-create-draft",
      "cron-fulfillment-sync",
      "session-track",
      "cron-health",
    ],
  });
};
