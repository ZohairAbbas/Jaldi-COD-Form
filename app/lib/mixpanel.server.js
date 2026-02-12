/**
 * Mixpanel Server-Side Tracking Utility
 *
 * Handles server-side event tracking for:
 * - Order creation
 * - Backend operations
 * - API calls
 * - User actions that happen server-side
 */

import Mixpanel from 'mixpanel';

let mixpanel = null;

/**
 * Initialize Mixpanel server-side
 */
export function initMixpanelServer() {
  if (mixpanel) return mixpanel;

  const token = process.env.MIXPANEL_TOKEN;

  if (!token) {
    console.warn('Mixpanel token not found in environment variables');
    return null;
  }

  mixpanel = Mixpanel.init(token, {
    protocol: 'https',
  });

  console.log('Mixpanel server initialized');
  return mixpanel;
}

/**
 * Get Mixpanel instance
 */
export function getMixpanel() {
  if (!mixpanel) {
    return initMixpanelServer();
  }
  return mixpanel;
}

/**
 * Track server-side event
 */
export function trackServerEvent(distinctId, eventName, properties = {}) {
  const mp = getMixpanel();
  if (!mp) return;

  const enrichedProperties = {
    ...properties,
    timestamp: new Date().toISOString(),
    source: 'server',
  };

  mp.track(eventName, {
    distinct_id: distinctId,
    ...enrichedProperties,
  });

  console.log(`[Mixpanel Server] Event tracked: ${eventName} for ${distinctId}`);
}

/**
 * Set user profile properties
 */
export function setServerUserProperties(distinctId, properties) {
  const mp = getMixpanel();
  if (!mp) return;

  mp.people.set(distinctId, properties);
  console.log(`[Mixpanel Server] User properties set for ${distinctId}`);
}

/**
 * Increment user property
 */
export function incrementServerUserProperty(distinctId, property, value = 1) {
  const mp = getMixpanel();
  if (!mp) return;

  mp.people.increment(distinctId, property, value);
}

/**
 * Track charge/revenue
 */
export function trackRevenue(distinctId, amount, properties = {}) {
  const mp = getMixpanel();
  if (!mp) return;

  mp.people.track_charge(distinctId, amount, {
    $time: new Date().toISOString(),
    ...properties,
  });

  console.log(`[Mixpanel Server] Revenue tracked: ${amount} for ${distinctId}`);
}

/**
 * Track order completion with revenue
 */
export function trackOrderCompletion(shop, order, properties = {}) {
  trackServerEvent(shop.shopifyDomain, 'Order Completed', {
    order_id: order.id,
    shopify_order_id: order.shopifyOrderId,
    order_number: order.shopifyOrderNumber,
    subtotal: order.subtotal,
    shipping: order.shipping,
    total: order.total,
    items_count: Array.isArray(order.items) ? order.items.length : 0,
    payment_method: order.paymentMethod,
    country: order.country,
    city: order.city,
    province: order.province,
    ...properties,
  });

  // Track revenue
  trackRevenue(shop.shopifyDomain, order.total, {
    order_id: order.id,
    payment_method: order.paymentMethod,
  });
}

/**
 * Batch track multiple events (more efficient)
 */
export function batchTrack(events) {
  const mp = getMixpanel();
  if (!mp) return;

  const formattedEvents = events.map(({ distinctId, eventName, properties }) => ({
    event: eventName,
    properties: {
      distinct_id: distinctId,
      ...properties,
      timestamp: new Date().toISOString(),
      source: 'server',
    },
  }));

  mp.track_batch(formattedEvents);
  console.log(`[Mixpanel Server] Batch tracked ${events.length} events`);
}

export default {
  initMixpanelServer,
  getMixpanel,
  trackServerEvent,
  setServerUserProperties,
  incrementServerUserProperty,
  trackRevenue,
  trackOrderCompletion,
  batchTrack,
};
