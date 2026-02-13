/**
 * Mixpanel Storefront Tracking
 *
 * Simplified Mixpanel tracking for storefront (customer-facing)
 * Focuses on customer journey and conversion tracking
 */

import mixpanel from 'mixpanel-browser';

let isInitialized = false;
let shopDomain = null;

/**
 * Initialize Mixpanel for storefront
 */
export function initStorefrontMixpanel(token, shop) {
  if (isInitialized) return;

  if (!token) {
    console.warn('Mixpanel token not provided for storefront');
    return;
  }

  shopDomain = shop;

  mixpanel.init(token, {
    debug: false, // Disable debug in storefront
    track_pageview: false, // Manual page tracking
    persistence: 'localStorage',
    // Session recording for customer sessions
    record_sessions_percent: 100,
    record_block_selector: '.sensitive-data, input[type="password"], input[name="credit_card"]',
    record_mask_text_selector: '.mask-text, input[type="email"], input[type="tel"]',
    record_collect_fonts: true,
    // Privacy settings
    property_blacklist: ['password', 'credit_card', 'cvv', 'ssn'],
    ip: true, // Track IP for geo-location
    loaded: function() {
      // Set super properties for all events
      mixpanel.register({
        shop_domain: shopDomain,
        platform: 'storefront',
      });
    },
  });

  isInitialized = true;
  console.log('Mixpanel initialized for storefront:', shopDomain);
}

/**
 * Track storefront event
 */
export function trackStorefrontEvent(eventName, properties = {}) {
  if (!isInitialized) return;

  const enrichedProperties = {
    ...properties,
    timestamp: new Date().toISOString(),
    url: window.location.href,
    path: window.location.pathname,
    shop_domain: shopDomain,
  };

  mixpanel.track(eventName, enrichedProperties);
  console.log(`[Mixpanel Storefront] ${eventName}`, enrichedProperties);
}

/**
 * Track form interaction
 */
export function trackFormInteraction(action, details = {}) {
  trackStorefrontEvent('Form Interaction', {
    action,
    ...details,
  });
}

/**
 * Track form submission
 */
export function trackFormSubmission(formData, items, total) {
  trackStorefrontEvent('Form Submitted', {
    items_count: items.length,
    total_amount: total,
    country: formData.country,
    city: formData.city,
    has_email: !!formData.email,
    has_phone: !!formData.phone,
  });
}

/**
 * Track upsell interaction
 */
export function trackUpsellInteraction(action, upsellData) {
  trackStorefrontEvent('Upsell Interaction', {
    action,
    upsell_id: upsellData.id,
    upsell_type: upsellData.type,
    product_title: upsellData.productTitle,
    product_price: upsellData.productPrice,
    discount_type: upsellData.discountType,
    discount_value: upsellData.discountValue,
  });
}

/**
 * Track downsell interaction
 */
export function trackDownsellInteraction(action, downsellData) {
  trackStorefrontEvent('Downsell Interaction', {
    action,
    downsell_id: downsellData.id,
    discount_type: downsellData.discountType,
    discount_value: downsellData.discountValue,
  });
}

/**
 * Track button click
 */
export function trackButtonClick(buttonType, properties = {}) {
  trackStorefrontEvent('Button Clicked', {
    button_type: buttonType,
    ...properties,
  });
}

/**
 * Track product interaction
 */
export function trackProductInteraction(action, productData) {
  trackStorefrontEvent('Product Interaction', {
    action,
    product_title: productData.title,
    variant_id: productData.variantId,
    quantity: productData.quantity,
    price: productData.price,
  });
}

/**
 * Track cart interaction
 */
export function trackCartInteraction(action, cartData) {
  trackStorefrontEvent('Cart Interaction', {
    action,
    items_count: cartData.items?.length || 0,
    total: cartData.items?.reduce((sum, item) => sum + item.price * item.quantity, 0) || 0,
  });
}

/**
 * Track shipping selection
 */
export function trackShippingSelection(shippingRate) {
  trackStorefrontEvent('Shipping Selected', {
    shipping_name: shippingRate.name,
    shipping_price: shippingRate.price,
  });
}

/**
 * Track error
 */
export function trackStorefrontError(errorName, errorDetails = {}) {
  trackStorefrontEvent('Error Occurred', {
    error_name: errorName,
    error_message: errorDetails.message,
    error_context: errorDetails.context,
  });
}

/**
 * Track order completion
 */
export function trackOrderCompletion(orderData) {
  trackStorefrontEvent('Order Completed', {
    order_id: orderData.orderId,
    shopify_order_id: orderData.shopifyOrderId,
    order_number: orderData.orderNumber,
    total: orderData.total,
    subtotal: orderData.subtotal,
    shipping: orderData.shipping,
    items_count: orderData.items?.length || 0,
    payment_method: orderData.paymentMethod,
    country: orderData.country,
  });

  // Track revenue
  if (isInitialized && orderData.total) {
    mixpanel.people.track_charge(orderData.total, {
      $time: new Date().toISOString(),
      order_id: orderData.orderId,
    });
  }
}

/**
 * Start timing an event
 */
export function startTiming(eventName) {
  if (!isInitialized) return;
  mixpanel.time_event(eventName);
}

/**
 * Track timing event
 */
export function trackTiming(eventName, properties = {}) {
  trackStorefrontEvent(eventName, properties);
}

export default {
  initStorefrontMixpanel,
  trackStorefrontEvent,
  trackFormInteraction,
  trackFormSubmission,
  trackUpsellInteraction,
  trackDownsellInteraction,
  trackButtonClick,
  trackProductInteraction,
  trackCartInteraction,
  trackShippingSelection,
  trackStorefrontError,
  trackOrderCompletion,
  startTiming,
  trackTiming,
};
