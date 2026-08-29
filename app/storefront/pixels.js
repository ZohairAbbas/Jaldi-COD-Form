/**
 * Client-side pixel tracking utilities
 */

let pixelConfig = null;
let currentEventId = null;

/**
 * Initialize pixels with configuration from server
 */
export function initializePixels(config) {
  if (!config) {
    return;
  }

  pixelConfig = config;

  // Capture UTM parameters from URL
  captureUtmParams();

  // Initialize Facebook Pixel for each configured pixel
  if (config.facebook && config.facebook.length > 0) {
    config.facebook.forEach(pixel => {
      loadFacebookPixel(pixel.pixelId);
    });
    // Capture fbclid from URL
    captureFbClickId();
  }

  // Initialize Snapchat Pixel for each configured pixel
  if (config.snapchat && config.snapchat.length > 0) {
    config.snapchat.forEach(pixel => {
      loadSnapchatPixel(pixel.pixelId);
    });
  }

  // Initialize TikTok Pixel for each configured pixel
  if (config.tiktok && config.tiktok.length > 0) {
    config.tiktok.forEach(pixel => {
      loadTikTokPixel(pixel.pixelId);
    });
  }
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
 * Capture UTM parameters from URL and store in sessionStorage
 */
export function captureUtmParams() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

    utmKeys.forEach(key => {
      const value = urlParams.get(key);
      if (value) {
        sessionStorage.setItem(`jaldi_${key}`, value);
      }
    });
  } catch (error) {
    console.error('Error capturing UTM params:', error);
  }
}

/**
 * Get stored UTM parameters
 */
export function getUtmData() {
  try {
    const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    const utmData = {};

    utmKeys.forEach(key => {
      const value = sessionStorage.getItem(`jaldi_${key}`);
      if (value) {
        utmData[key] = value;
      }
    });

    return utmData;
  } catch (error) {
    console.error('Error getting UTM data:', error);
    return {};
  }
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
    order_id: orderNumber,
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
    ...getUtmData(),
  };
}

// ============================================
// SNAPCHAT PIXEL TRACKING
// ============================================

/**
 * Load Snapchat Pixel base code
 */
function loadSnapchatPixel(pixelId) {
  // Check if Snapchat Pixel already loaded
  if (window.snaptr) {
    window.snaptr('init', pixelId);
    return;
  }

  // Load Snapchat Pixel script
  (function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function()
  {a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};
  a.queue=[];var s='script';var r=t.createElement(s);r.async=!0;
  r.src=n;var u=t.getElementsByTagName(s)[0];
  u.parentNode.insertBefore(r,u);})(window,document,
  'https://sc-static.net/scevent.min.js');

  // Initialize Snapchat Pixel
  window.snaptr('init', pixelId);

  // Track PageView automatically
  window.snaptr('track', 'PAGE_VIEW');
}

/**
 * Track START_CHECKOUT event on Snapchat
 */
export function trackSnapchatStartCheckout(cart, currency = 'PKR') {
  if (!pixelConfig || !pixelConfig.snapchat || pixelConfig.snapchat.length === 0) {
    return;
  }

  if (!window.snaptr) {
    console.warn('Snapchat Pixel not loaded');
    return;
  }

  const eventData = {
    currency: currency,
    price: cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
    item_ids: cart.items.map(item => item.variantId || item.id),
    number_items: cart.items.reduce((sum, item) => sum + item.quantity, 0),
  };

  pixelConfig.snapchat.forEach(pixel => {
    if (!pixel.enableStartCheckout) {
      return;
    }

    try {
      window.snaptr('track', 'START_CHECKOUT', eventData);
      console.log(`[Snapchat Pixel] Fired START_CHECKOUT on pixel ${pixel.pixelId}`, eventData);
    } catch (error) {
      console.error(`Error tracking START_CHECKOUT on Snapchat pixel ${pixel.pixelId}:`, error);
    }
  });
}

/**
 * Track PURCHASE event on Snapchat
 */
export function trackSnapchatPurchase(orderData, currency = 'PKR') {
  if (!pixelConfig || !pixelConfig.snapchat || pixelConfig.snapchat.length === 0) {
    return;
  }

  if (!window.snaptr) {
    console.warn('Snapchat Pixel not loaded');
    return;
  }

  const { items, total, orderNumber, email, phone, firstName, lastName } = orderData;

  const eventData = {
    currency: currency,
    price: total,
    transaction_id: orderNumber,
    item_ids: items.map(item => item.variantId || item.id),
    number_items: items.length,
    ...(email && { user_email: email }),
    ...(phone && { user_phone_number: phone }),
    ...(firstName && { firstname: firstName }),
    ...(lastName && { lastname: lastName }),
  };

  pixelConfig.snapchat.forEach(pixel => {
    if (!pixel.enablePurchase) {
      return;
    }

    try {
      window.snaptr('track', 'PURCHASE', eventData);
      console.log(`[Snapchat Pixel] Fired PURCHASE on pixel ${pixel.pixelId}`, eventData);
    } catch (error) {
      console.error(`Error tracking PURCHASE on Snapchat pixel ${pixel.pixelId}:`, error);
    }
  });
}

// ============================================
// TIKTOK PIXEL TRACKING
// ============================================

/**
 * Load TikTok Pixel base code
 */
function loadTikTokPixel(pixelId) {
  // Check if TikTok Pixel already loaded
  if (window.ttq) {
    window.ttq.load(pixelId);
    return;
  }

  // Load TikTok Pixel script
  !(function(w, d, t) {
    w.TiktokAnalyticsObject = t;
    var ttq = w[t] = w[t] || [];
    ttq.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie"];
    ttq.setAndDefer = function(t, e) {
      t[e] = function() {
        t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
      };
    };
    for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
    ttq.instance = function(t) {
      for (var e = ttq._i[t] || [], n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]);
      return e;
    };
    ttq.load = function(e, n) {
      var i = "https://analytics.tiktok.com/i18n/pixel/events.js";
      ttq._i = ttq._i || {}, ttq._i[e] = [], ttq._i[e]._u = i, ttq._t = ttq._t || {}, ttq._t[e] = +new Date, ttq._o = ttq._o || {}, ttq._o[e] = n || {};
      var o = document.createElement("script");
      o.type = "text/javascript", o.async = !0, o.src = i + "?sdkid=" + e + "&lib=" + t;
      var a = document.getElementsByTagName("script")[0];
      a.parentNode.insertBefore(o, a);
    };
  })(window, document, 'ttq');

  // Initialize TikTok Pixel
  window.ttq.load(pixelId);
  window.ttq.page();
}

/**
 * Track InitiateCheckout event on TikTok (pixel only)
 */
export function trackTikTokInitiateCheckout(cart, currency = 'PKR') {
  if (!pixelConfig || !pixelConfig.tiktok || pixelConfig.tiktok.length === 0) {
    return;
  }

  if (!window.ttq) {
    console.warn('TikTok Pixel not loaded');
    return;
  }

  const eventData = {
    content_type: 'product',
    quantity: cart.items.reduce((sum, item) => sum + item.quantity, 0),
    description: 'COD Form Opened',
    value: cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
    currency: currency,
    contents: cart.items.map(item => ({
      content_id: item.variantId || item.id,
      content_type: 'product',
      content_name: item.title,
      quantity: item.quantity,
      price: item.price,
    })),
  };

  pixelConfig.tiktok.forEach(pixel => {
    if (!pixel.enableTikTokInitiateCheckout) {
      return;
    }

    try {
      window.ttq.track('InitiateCheckout', eventData);
      console.log(`[TikTok Pixel] Fired InitiateCheckout on pixel ${pixel.pixelId}`, eventData);
    } catch (error) {
      console.error(`Error tracking InitiateCheckout on TikTok pixel ${pixel.pixelId}:`, error);
    }
  });
}

/**
 * Track the TikTok Purchase event for a completed order.
 *
 * `Purchase` is the only valid TikTok Events API 2.0 web conversion event —
 * "PlaceAnOrder" and "CompletePayment" are legacy pixel event names. Both
 * toggles therefore map to a single Purchase, exactly as the server-side path
 * in pixels.server.js does. They used to be fired as two separate ttq.track
 * calls with no event_id, which TikTok could not deduplicate and which
 * double-counted orders and revenue for any shop with both toggles enabled.
 *
 * The event_id is the same one used for the server-side event, so TikTok
 * collapses the browser and server copies into one conversion.
 */
export function trackTikTokPurchase(orderData, currency = 'PKR') {
  if (!pixelConfig || !pixelConfig.tiktok || pixelConfig.tiktok.length === 0) {
    return;
  }

  if (!window.ttq) {
    console.warn('TikTok Pixel not loaded');
    return;
  }

  const { items, total } = orderData;
  const eventId = orderData.eventId || getEventId();

  const eventData = {
    content_type: 'product',
    quantity: items.length,
    description: 'Order Placed',
    value: total,
    currency: currency,
    contents: items.map(item => ({
      content_id: item.variantId || item.id,
      content_type: 'product',
      quantity: item.quantity || 1,
      price: item.price,
    })),
  };

  pixelConfig.tiktok.forEach(pixel => {
    // Either toggle means "report purchases"; neither means the merchant has
    // turned purchase reporting off for this pixel.
    if (!pixel.enablePlaceAnOrder && !pixel.enableCompletePayment) {
      return;
    }

    try {
      window.ttq.track('Purchase', eventData, { event_id: eventId });
      console.log(`[TikTok Pixel] Fired Purchase on pixel ${pixel.pixelId}`, eventData);
    } catch (error) {
      console.error(`Error tracking Purchase on TikTok pixel ${pixel.pixelId}:`, error);
    }
  });

  return eventId;
}
