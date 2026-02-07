/**
 * Mantle Billing Integration
 *
 * Handles all billing operations for the Shopify app including:
 * - Subscription management
 * - Plan changes
 * - Usage tracking
 * - Billing checks
 */

import { MantleClient } from '@heymantle/client';
import db from '../db.server';

let mantleClient = null;

/**
 * Initialize Mantle client
 */
export function getMantleClient() {
  if (!mantleClient) {
    const appId = process.env.MANTLE_APP_ID;
    const apiKey = process.env.MANTLE_API_KEY;

    if (!appId || !apiKey) {
      console.warn('Mantle credentials not found in environment variables');
      return null;
    }

    mantleClient = new MantleClient({
      appId,
      apiKey,
    });

    console.log('Mantle client initialized');
  }

  return mantleClient;
}

/**
 * Get or create customer in Mantle
 */
export async function getOrCreateCustomer(shop, sessionToken) {
  const mantle = getMantleClient();
  if (!mantle) throw new Error('Mantle not configured');

  try {
    // Try to get existing customer
    let customer = await mantle.customers.identify({
      myshopifyDomain: shop.shopifyDomain,
      sessionToken,
    });

    // Update subscription record
    await db.subscription.upsert({
      where: { shopId: shop.id },
      create: {
        shopId: shop.id,
        mantleCustomerId: customer.id,
        status: customer.subscription?.status || 'trialing',
        planId: customer.subscription?.planId,
        planName: customer.subscription?.planName,
        currentPeriodEnd: customer.subscription?.currentPeriodEnd
          ? new Date(customer.subscription.currentPeriodEnd)
          : null,
        trialEndsAt: customer.subscription?.trialEndsAt
          ? new Date(customer.subscription.trialEndsAt)
          : null,
      },
      update: {
        mantleCustomerId: customer.id,
        status: customer.subscription?.status || 'trialing',
        planId: customer.subscription?.planId,
        planName: customer.subscription?.planName,
        currentPeriodEnd: customer.subscription?.currentPeriodEnd
          ? new Date(customer.subscription.currentPeriodEnd)
          : null,
        trialEndsAt: customer.subscription?.trialEndsAt
          ? new Date(customer.subscription.trialEndsAt)
          : null,
      },
    });

    return customer;
  } catch (error) {
    console.error('Failed to get or create Mantle customer:', error);
    throw error;
  }
}

/**
 * Check if shop has active subscription
 */
export async function hasActiveSubscription(shopId) {
  try {
    const subscription = await db.subscription.findUnique({
      where: { shopId },
    });

    if (!subscription) return false;

    // Check if subscription is active or in trial
    const activeStatuses = ['active', 'trialing', 'trial'];
    if (!activeStatuses.includes(subscription.status)) {
      return false;
    }

    // Check if trial has expired
    if (subscription.status === 'trialing' && subscription.trialEndsAt) {
      if (new Date() > subscription.trialEndsAt) {
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Failed to check subscription status:', error);
    return false;
  }
}

/**
 * Get subscription details
 */
export async function getSubscription(shopId) {
  try {
    return await db.subscription.findUnique({
      where: { shopId },
      include: {
        shop: {
          select: {
            shopifyDomain: true,
          },
        },
      },
    });
  } catch (error) {
    console.error('Failed to get subscription:', error);
    return null;
  }
}

/**
 * Subscribe to a plan
 */
export async function subscribeToPlan(shop, planId, sessionToken) {
  const mantle = getMantleClient();
  if (!mantle) throw new Error('Mantle not configured');

  try {
    // Create subscription via Mantle
    const subscription = await mantle.subscriptions.create({
      myshopifyDomain: shop.shopifyDomain,
      planId,
      sessionToken,
    });

    // Update local subscription record
    await db.subscription.upsert({
      where: { shopId: shop.id },
      create: {
        shopId: shop.id,
        mantleCustomerId: subscription.customerId,
        planId: subscription.planId,
        planName: subscription.planName,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd
          ? new Date(subscription.currentPeriodEnd)
          : null,
        trialEndsAt: subscription.trialEndsAt
          ? new Date(subscription.trialEndsAt)
          : null,
      },
      update: {
        planId: subscription.planId,
        planName: subscription.planName,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd
          ? new Date(subscription.currentPeriodEnd)
          : null,
        trialEndsAt: subscription.trialEndsAt
          ? new Date(subscription.trialEndsAt)
          : null,
      },
    });

    return subscription;
  } catch (error) {
    console.error('Failed to subscribe to plan:', error);
    throw error;
  }
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(shop, sessionToken, immediately = false) {
  const mantle = getMantleClient();
  if (!mantle) throw new Error('Mantle not configured');

  try {
    const result = await mantle.subscriptions.cancel({
      myshopifyDomain: shop.shopifyDomain,
      sessionToken,
      immediately,
    });

    // Update local record
    await db.subscription.update({
      where: { shopId: shop.id },
      data: {
        status: immediately ? 'cancelled' : 'active',
        cancelAtPeriodEnd: !immediately,
      },
    });

    return result;
  } catch (error) {
    console.error('Failed to cancel subscription:', error);
    throw error;
  }
}

/**
 * Report usage to Mantle (for usage-based billing)
 */
export async function reportUsage(shop, metricId, quantity, sessionToken) {
  const mantle = getMantleClient();
  if (!mantle) throw new Error('Mantle not configured');

  try {
    const result = await mantle.usage.report({
      myshopifyDomain: shop.shopifyDomain,
      metricId,
      quantity,
      sessionToken,
    });

    // Store usage charge reference
    const subscription = await db.subscription.findUnique({
      where: { shopId: shop.id },
    });

    if (subscription) {
      const charges = Array.isArray(subscription.usageCharges)
        ? subscription.usageCharges
        : [];

      charges.push({
        metricId,
        quantity,
        timestamp: new Date().toISOString(),
        chargeId: result.id,
      });

      await db.subscription.update({
        where: { shopId: shop.id },
        data: { usageCharges: charges },
      });
    }

    return result;
  } catch (error) {
    console.error('Failed to report usage:', error);
    throw error;
  }
}

/**
 * Get available plans
 */
export async function getPlans() {
  const mantle = getMantleClient();
  if (!mantle) return [];

  try {
    return await mantle.plans.list();
  } catch (error) {
    console.error('Failed to get plans:', error);
    return [];
  }
}

/**
 * Sync subscription status from Mantle
 */
export async function syncSubscriptionStatus(shop, sessionToken) {
  try {
    const customer = await getOrCreateCustomer(shop, sessionToken);
    return customer.subscription;
  } catch (error) {
    console.error('Failed to sync subscription status:', error);
    return null;
  }
}

/**
 * Handle Mantle webhook
 */
export async function handleMantleWebhook(payload) {
  const { type, data } = payload;

  try {
    switch (type) {
      case 'subscription.created':
      case 'subscription.updated':
        await handleSubscriptionUpdate(data);
        break;

      case 'subscription.cancelled':
        await handleSubscriptionCancellation(data);
        break;

      case 'subscription.expired':
        await handleSubscriptionExpiration(data);
        break;

      default:
        console.log(`Unhandled Mantle webhook type: ${type}`);
    }
  } catch (error) {
    console.error('Failed to handle Mantle webhook:', error);
    throw error;
  }
}

async function handleSubscriptionUpdate(data) {
  const { myshopifyDomain, subscription } = data;

  const shop = await db.shop.findUnique({
    where: { shopifyDomain: myshopifyDomain },
  });

  if (!shop) {
    console.warn(`Shop not found for domain: ${myshopifyDomain}`);
    return;
  }

  await db.subscription.upsert({
    where: { shopId: shop.id },
    create: {
      shopId: shop.id,
      mantleCustomerId: subscription.customerId,
      planId: subscription.planId,
      planName: subscription.planName,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd
        ? new Date(subscription.currentPeriodEnd)
        : null,
      trialEndsAt: subscription.trialEndsAt
        ? new Date(subscription.trialEndsAt)
        : null,
    },
    update: {
      planId: subscription.planId,
      planName: subscription.planName,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd
        ? new Date(subscription.currentPeriodEnd)
        : null,
      trialEndsAt: subscription.trialEndsAt
        ? new Date(subscription.trialEndsAt)
        : null,
    },
  });
}

async function handleSubscriptionCancellation(data) {
  const { myshopifyDomain } = data;

  const shop = await db.shop.findUnique({
    where: { shopifyDomain: myshopifyDomain },
  });

  if (!shop) return;

  await db.subscription.update({
    where: { shopId: shop.id },
    data: { status: 'cancelled' },
  });
}

async function handleSubscriptionExpiration(data) {
  const { myshopifyDomain } = data;

  const shop = await db.shop.findUnique({
    where: { shopifyDomain: myshopifyDomain },
  });

  if (!shop) return;

  await db.subscription.update({
    where: { shopId: shop.id },
    data: { status: 'expired' },
  });
}

export default {
  getMantleClient,
  getOrCreateCustomer,
  hasActiveSubscription,
  getSubscription,
  subscribeToPlan,
  cancelSubscription,
  reportUsage,
  getPlans,
  syncSubscriptionStatus,
  handleMantleWebhook,
};
