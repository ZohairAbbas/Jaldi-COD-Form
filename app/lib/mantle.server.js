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
import prisma from '../db.server.js';

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
    // Identify/get customer using the new API
    console.log('[Mantle] Identifying customer:', shop.shopifyDomain);
    const response = await mantle.identify({
      platform: 'shopify',
      myshopifyDomain: shop.shopifyDomain,
      accessToken: sessionToken,
    });
    console.log('[Mantle] Identify response:', response.apiToken ? 'Token received' : 'No token');

    // Get full customer details
    const customerClient = new MantleClient({
      appId: process.env.MANTLE_APP_ID,
      customerApiToken: response.apiToken,
    });

    console.log('[Mantle] Calling getCustomer...');
    const customer = await customerClient.getCustomer();
    console.log('[Mantle] Customer received:', customer ? 'Yes' : 'No');
    console.log('[Mantle] Customer ID:', customer?.id);
    console.log('[Mantle] Customer subscription:', customer?.subscription);

    // Update subscription record
    // Get plan info from the subscription's lineItems if subscription exists
    let planId = customer.subscription?.planId;
    let planName = customer.subscription?.planName;

    // If subscription has lineItems, get plan info from there
    if (customer.subscription?.lineItems && customer.subscription.lineItems.length > 0) {
      const firstLineItem = customer.subscription.lineItems[0];
      if (firstLineItem.plan) {
        planId = firstLineItem.plan.id;
        planName = firstLineItem.plan.name;
      }
    }

    await prisma.subscription.upsert({
      where: { shopId: shop.id },
      create: {
        shopId: shop.id,
        mantleCustomerId: customer.id,
        status: customer.subscription?.status || customer.billingStatus || 'trialing',
        planId: planId,
        planName: planName,
        currentPeriodEnd: customer.subscription?.currentPeriodEnd
          ? new Date(customer.subscription.currentPeriodEnd)
          : null,
        trialEndsAt: customer.trialExpiresAt
          ? new Date(customer.trialExpiresAt)
          : null,
      },
      update: {
        mantleCustomerId: customer.id,
        status: customer.subscription?.status || customer.billingStatus || 'trialing',
        planId: planId,
        planName: planName,
        currentPeriodEnd: customer.subscription?.currentPeriodEnd
          ? new Date(customer.subscription.currentPeriodEnd)
          : null,
        trialEndsAt: customer.trialExpiresAt
          ? new Date(customer.trialExpiresAt)
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
    const subscription = await prisma.subscription.findUnique({
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
    return await prisma.subscription.findUnique({
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
    // First identify the customer to get their API token
    const identifyResponse = await mantle.identify({
      platform: 'shopify',
      myshopifyDomain: shop.shopifyDomain,
      accessToken: sessionToken,
    });

    // Create client with customer token
    const customerClient = new MantleClient({
      appId: process.env.MANTLE_APP_ID,
      customerApiToken: identifyResponse.apiToken,
    });

    // Subscribe to the plan
    console.log('[Mantle] Subscribing to plan:', planId);

    // Use callback route that will redirect to Shopify admin properly
    const returnUrl = `${process.env.SHOPIFY_APP_URL}/billing/callback?shop=${shop.shopifyDomain}`;
    console.log('[Mantle] Return URL:', returnUrl);

    const subscriptionResponse = await customerClient.subscribe({
      planId,
      returnUrl,
    });

    console.log('[Mantle] Subscribe response:', JSON.stringify(subscriptionResponse, null, 2));
    console.log('[Mantle] confirmationUrl:', subscriptionResponse.confirmationUrl);

    // For Shopify apps with paid plans, there should ALWAYS be a confirmation URL
    // If there isn't one, something is wrong with the plan configuration
    if (subscriptionResponse.confirmationUrl) {
      console.log('[Mantle] Returning confirmationUrl for redirect');
      return {
        confirmationUrl: subscriptionResponse.confirmationUrl,
        subscription: subscriptionResponse,
      };
    }

    // WARNING: This path should not be hit for paid plans
    console.warn('[Mantle] No confirmationUrl returned - this may indicate a free plan or configuration issue');
    console.warn('[Mantle] Full response:', JSON.stringify(subscriptionResponse, null, 2));

    // Get updated customer details
    const customer = await customerClient.getCustomer();

    // Extract plan info from subscription lineItems
    let subscribedPlanId = null;
    let subscribedPlanName = null;

    if (customer.subscription?.lineItems && customer.subscription.lineItems.length > 0) {
      const firstLineItem = customer.subscription.lineItems[0];
      if (firstLineItem.plan) {
        subscribedPlanId = firstLineItem.plan.id;
        subscribedPlanName = firstLineItem.plan.name;
      }
    }

    // Update local subscription record
    await prisma.subscription.upsert({
      where: { shopId: shop.id },
      create: {
        shopId: shop.id,
        mantleCustomerId: customer.id,
        planId: subscribedPlanId,
        planName: subscribedPlanName,
        status: customer.subscription?.status || 'active',
        currentPeriodEnd: customer.subscription?.currentPeriodEnd
          ? new Date(customer.subscription.currentPeriodEnd)
          : null,
        trialEndsAt: customer.trialExpiresAt
          ? new Date(customer.trialExpiresAt)
          : null,
      },
      update: {
        planId: subscribedPlanId,
        planName: subscribedPlanName,
        status: customer.subscription?.status || 'active',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: customer.subscription?.currentPeriodEnd
          ? new Date(customer.subscription.currentPeriodEnd)
          : null,
        trialEndsAt: customer.trialExpiresAt
          ? new Date(customer.trialExpiresAt)
          : null,
      },
    });

    return customer.subscription;
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
    // First identify the customer to get their API token
    const identifyResponse = await mantle.identify({
      platform: 'shopify',
      myshopifyDomain: shop.shopifyDomain,
      accessToken: sessionToken,
    });

    // Create client with customer token
    const customerClient = new MantleClient({
      appId: process.env.MANTLE_APP_ID,
      customerApiToken: identifyResponse.apiToken,
    });

    // Cancel the subscription
    const result = await customerClient.cancelSubscription();

    // Update local record
    await prisma.subscription.update({
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
export async function reportUsage(shop, eventName, properties, sessionToken) {
  const mantle = getMantleClient();
  if (!mantle) throw new Error('Mantle not configured');

  try {
    // First identify the customer to get their API token
    const identifyResponse = await mantle.identify({
      platform: 'shopify',
      myshopifyDomain: shop.shopifyDomain,
      accessToken: sessionToken,
    });

    // Create client with customer token
    const customerClient = new MantleClient({
      appId: process.env.MANTLE_APP_ID,
      customerApiToken: identifyResponse.apiToken,
    });

    // Send usage event
    const result = await customerClient.sendUsageEvent({
      eventName,
      properties,
    });

    // Store usage charge reference
    const subscription = await prisma.subscription.findUnique({
      where: { shopId: shop.id },
    });

    if (subscription) {
      const charges = Array.isArray(subscription.usageCharges)
        ? subscription.usageCharges
        : [];

      charges.push({
        eventName,
        properties,
        timestamp: new Date().toISOString(),
        eventId: result?.eventId,
      });

      await prisma.subscription.update({
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
 * Note: In the new Mantle API, plans need to be configured in the Mantle dashboard
 * For now, we'll return an empty array and plans should be managed in Mantle
 */
export async function getPlans(shop, sessionToken) {
  const mantle = getMantleClient();
  if (!mantle) {
    console.warn('Mantle client not configured');
    return [];
  }

  try {
    // Identify customer to get their API token
    const identifyResponse = await mantle.identify({
      platform: 'shopify',
      myshopifyDomain: shop.shopifyDomain,
      accessToken: sessionToken,
    });

    // Create client with customer token
    const customerClient = new MantleClient({
      appId: process.env.MANTLE_APP_ID,
      customerApiToken: identifyResponse.apiToken,
    });

    // Get customer details
    const customer = await customerClient.getCustomer();

    // Plans are available in the customer.plans array
    console.log('Customer data:', JSON.stringify(customer, null, 2));

    // Return the plans array from customer object
    return customer.plans || [];
  } catch (error) {
    console.error('Failed to get plans:', error.message || error);
    return [];
  }
}

/**
 * Sync subscription status from Mantle
 */
export async function syncSubscriptionStatus(shop, sessionToken) {
  try {
    const customer = await getOrCreateCustomer(shop, sessionToken);

    // Return subscription info from customer object
    return {
      status: customer.subscription?.status,
      planId: customer.subscription?.planId,
      planName: customer.plan?.name,
      currentPeriodEnd: customer.subscription?.currentPeriodEnd,
      trialEndsAt: customer.trialExpiresAt,
    };
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

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: myshopifyDomain },
  });

  if (!shop) {
    console.warn(`Shop not found for domain: ${myshopifyDomain}`);
    return;
  }

  await prisma.subscription.upsert({
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

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: myshopifyDomain },
  });

  if (!shop) return;

  await prisma.subscription.update({
    where: { shopId: shop.id },
    data: { status: 'cancelled', planId: null, planName: null },
  });
}

async function handleSubscriptionExpiration(data) {
  const { myshopifyDomain } = data;

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: myshopifyDomain },
  });

  if (!shop) return;

  await prisma.subscription.update({
    where: { shopId: shop.id },
    data: { status: 'expired', planId: null, planName: null },
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
