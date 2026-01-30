/**
 * Client-side pixel tracking utilities
 */

let pixelConfig = null;
let currentEventId = null;

/**
 * Initialize pixels with configuration from server
 */
export function initializePixels(config) {
  if (!config || !config.facebook || config.facebook.length === 0) {
    return;
  }

  pixelConfig = config;

  // Initialize Facebook Pixel for each configured pixel
  config.facebook.forEach(pixel => {
    loadFacebookPixel(pixel.pixelId);
  });

  // Capture fbclid from URL
  captureFbClickId();
}

/**
 * Load Facebook Pixel base code
 */
function loadFacebookPixel(pixelId) {
  // Check if pixel already loaded
  if (window.fbq) {
    window.fbq('init', pixelId);
    return;
  }

  // Load Facebook Pixel script
  !(function(f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function() {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = '2.0';
    n.queue = [];
    t = b.createElement(e);
    t.async = !0;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

  // Initialize pixel
  window.fbq('init', pixelId);

  // Track PageView automatically
  window.fbq('track', 'PageView');
}

/**
 * Capture Facebook Click ID (fbclid) from URL
 */
export function captureFbClickId() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const fbclid = urlParams.get('fbclid');

    if (fbclid) {
      sessionStorage.setItem('jaldi_fbclid', fbclid);

      // Build fbc format: fb.1.{timestamp}.{fbclid}
      const timestamp = Date.now();
      const fbc = `fb.1.${timestamp}.${fbclid}`;
      sessionStorage.setItem('jaldi_fbc', fbc);
    }
  } catch (error) {
    console.error('Error capturing fbclid:', error);
  }
}

/**
 * Get Facebook Browser ID (_fbp cookie)
 */
export function getFbp() {
  try {
    const cookies = document.cookie.split(';');
    const fbpCookie = cookies.find(c => c.trim().startsWith('_fbp='));
    return fbpCookie ? fbpCookie.split('=')[1] : null;
  } catch (error) {
    console.error('Error getting fbp:', error);
    return null;
  }
}

/**
 * Get Facebook Click Cookie (fbc)
 */
export function getFbc() {
  try {
    return sessionStorage.getItem('jaldi_fbc') || null;
  } catch (error) {
    console.error('Error getting fbc:', error);
    return null;
  }
}

/**
 * Get Facebook Click ID (fbclid)
 */
export function getFbclid() {
  try {
    return sessionStorage.getItem('jaldi_fbclid') || null;
  } catch (error) {
    console.error('Error getting fbclid:', error);
    return null;
  }
}

/**
 * Generate or retrieve current event ID for deduplication
 */
export function getEventId() {
  if (!currentEventId) {
    currentEventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  return currentEventId;
}

/**
 * Reset event ID (call this when form is closed/reopened)
 */
export function resetEventId() {
  currentEventId = null;
}

/**
 * Track event on all configured pixels
 */
export function trackEvent(eventName, eventData = {}, options = {}) {
  if (!pixelConfig || !pixelConfig.facebook || pixelConfig.facebook.length === 0) {
    return;
  }

  if (!window.fbq) {
    console.warn('Facebook Pixel not loaded');
    return;
  }

  const eventId = options.eventId || getEventId();

  // Track on all configured Facebook pixels
  pixelConfig.facebook.forEach(pixel => {
    // Check if this event is enabled for this pixel
    const eventEnabled = checkEventEnabled(pixel, eventName);

    if (!eventEnabled) {
      return;
    }

    try {
      // Fire the event with event ID for deduplication
      window.fbq('track', eventName, eventData, { eventID: eventId });

      console.log(`[Pixel] Fired ${eventName} on pixel ${pixel.pixelId}`, {
        eventId,
        eventData,
      });
    } catch (error) {
      console.error(`Error tracking ${eventName} on pixel ${pixel.pixelId}:`, error);
    }
  });

  return eventId;
}

/**
 * Check if an event is enabled for a pixel
 */
function checkEventEnabled(pixel, eventName) {
  switch (eventName) {
    case 'InitiateCheckout':
      return pixel.enableInitiateCheckout;
    case 'AddToCart':
      return pixel.enableAddToCart;
    case 'AddPaymentInfo':
      return pixel.enableAddPaymentInfo;
    case 'Purchase':
      return true; // Purchase is always enabled
    default:
      return true;
  }
}

/**
 * Track InitiateCheckout event
 */
export function trackInitiateCheckout(cart, currency = 'PKR') {
  const eventData = {
    content_ids: cart.items.map(item => item.variantId || item.id),
    content_type: 'product',
    value: cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
    currency,
    num_items: cart.items.reduce((sum, item) => sum + item.quantity, 0),
  };

  return trackEvent('InitiateCheckout', eventData);
}

/**
 * Track AddPaymentInfo event
 */
export function trackAddPaymentInfo(cart, currency = 'PKR') {
  const eventData = {
    content_ids: cart.items.map(item => item.variantId || item.id),
    content_type: 'product',
    value: cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
    currency,
  };

  return trackEvent('AddPaymentInfo', eventData);
}

/**
 * Track AddToCart event (for one-tick upsells)
 */
export function trackAddToCart(item, currency = 'PKR') {
  const eventData = {
    content_ids: [item.variantId || item.id],
    content_type: 'product',
    value: item.price,
    currency,
  };

  return trackEvent('AddToCart', eventData);
}

/**
 * Track Purchase event
 * Uses the custom purchaseEvent name from each pixel config (defaults to 'Purchase')
 */
export function trackPurchase(orderData, currency = 'PKR') {
  if (!pixelConfig || !pixelConfig.facebook || pixelConfig.facebook.length === 0) {
    return;
  }

  if (!window.fbq) {
    console.warn('Facebook Pixel not loaded');
    return;
  }

  const { items, total, orderNumber } = orderData;

  const eventData = {
    content_ids: items.map(item => item.variantId || item.id),
    content_type: 'product',
    value: total,
    currency,
    num_items: items.length,
  };

  const eventId = orderData.eventId || getEventId();

  // Track on all configured Facebook pixels with their custom purchase event name
  pixelConfig.facebook.forEach(pixel => {
    try {
      const eventName = pixel.purchaseEvent || 'Purchase';
      window.fbq('track', eventName, eventData, { eventID: eventId });

      console.log(`[Pixel] Fired ${eventName} on pixel ${pixel.pixelId}`, {
        eventId,
        eventData,
      });
    } catch (error) {
      console.error(`Error tracking Purchase on pixel ${pixel.pixelId}:`, error);
    }
  });

  return eventId;
}

/**
 * Get attribution data for server-side events
 */
export function getAttributionData() {
  return {
    fbp: getFbp(),
    fbc: getFbc(),
    fbclid: getFbclid(),
  };
}
