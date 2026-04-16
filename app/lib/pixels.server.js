import crypto from 'crypto';
import { logPixelEvent } from './db.server.js';
import { getCurrencyCode } from './constants.js';

/**
 * Generate unique event ID for deduplication
 */
export function generateEventId() {
  return `evt_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Hash a value for Facebook (SHA256, lowercase, trimmed)
 */
export function hashForFacebook(value) {
  if (!value) return null;
  const normalized = String(value).toLowerCase().trim();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Hash phone number for Facebook (digits only, no formatting)
 */
export function hashPhone(phone) {
  if (!phone) return null;
  // Remove all non-digits
  const digitsOnly = phone.replace(/\D/g, '');
  return crypto.createHash('sha256').update(digitsOnly).digest('hex');
}

/**
 * Get currency code from country
 * @deprecated Use getCurrencyCode from constants.js instead
 */
export function getCurrencyFromCountry(country) {
  return getCurrencyCode(country);
}

/**
 * Send event to Facebook Conversions API
 */
export async function sendFacebookCAPIEvent(pixel, eventData) {
  const {
    eventName,
    eventId,
    eventTime,
    eventSourceUrl,
    userData = {},
    customData = {},
    testEventCode,
  } = eventData;

  try {
    // Build user_data with hashed values
    const hashedUserData = {
      ...(userData.email && { em: [hashForFacebook(userData.email)] }),
      ...(userData.phone && { ph: [hashPhone(userData.phone)] }),
      ...(userData.firstName && { fn: [hashForFacebook(userData.firstName)] }),
      ...(userData.lastName && { ln: [hashForFacebook(userData.lastName)] }),
      ...(userData.city && { ct: [hashForFacebook(userData.city)] }),
      ...(userData.province && { st: [hashForFacebook(userData.province)] }),
      ...(userData.country && { country: [hashForFacebook(userData.country)] }),
      ...(userData.clientIpAddress && { client_ip_address: userData.clientIpAddress }),
      ...(userData.clientUserAgent && { client_user_agent: userData.clientUserAgent }),
      ...(userData.fbc && { fbc: userData.fbc }),
      ...(userData.fbp && { fbp: userData.fbp }),
    };

    // Build the CAPI request payload
    const payload = {
      data: [{
        event_name: eventName,
        event_time: eventTime || Math.floor(Date.now() / 1000),
        event_id: eventId,
        event_source_url: eventSourceUrl,
        action_source: 'website',
        user_data: hashedUserData,
        custom_data: customData,
      }],
      access_token: pixel.accessToken,
      ...(testEventCode && { test_event_code: testEventCode }),
    };

    // Send to Facebook CAPI
    const apiVersion = 'v18.0';
    const url = `https://graph.facebook.com/${apiVersion}/${pixel.pixelId}/events`;

    console.log(`[CAPI] Sending ${eventName} to pixel ${pixel.pixelId}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const result = await response.json();

    console.log(`[CAPI] ${eventName} response: ${response.status}`, result);

    // Log the event
    await logPixelEvent({
      pixelId: pixel.id,
      shopId: pixel.shopId,
      eventName,
      eventId,
      source: 'server',
      eventData: payload,
      status: response.ok ? 'sent' : 'failed',
      responseCode: response.status,
      errorMessage: response.ok ? null : JSON.stringify(result),
      fbclid: userData.fbclid || null,
      fbp: userData.fbp || null,
      fbc: userData.fbc || null,
      orderId: customData.order_id || null,
      orderNumber: customData.order_id || null,
    });

    return {
      success: response.ok,
      response: result,
    };
  } catch (error) {
    console.error('Facebook CAPI error:', error);

    // Log the failed event
    await logPixelEvent({
      pixelId: pixel.id,
      shopId: pixel.shopId,
      eventName,
      eventId,
      source: 'server',
      eventData: { error: error.message },
      status: 'failed',
      errorMessage: error.message,
    });

    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Fire Purchase event to all enabled CAPI pixels
 */
export async function firePurchaseEvent(pixels, orderData) {
  const {
    orderId,
    orderNumber,
    total,
    items,
    currency,
    customerInfo,
    address,
    eventId,
    eventSourceUrl,
    clientIpAddress,
    clientUserAgent,
    fbc,
    fbp,
    fbclid,
    utmData,
  } = orderData;

  const capiPixels = pixels.filter(p => p.type === 'facebook_capi' && p.enabled);

  if (capiPixels.length === 0) {
    return [];
  }

  // Send to all CAPI pixels with their configured event name
  const results = await Promise.all(
    capiPixels.map(pixel => {
      const eventData = {
        eventName: pixel.purchaseEvent || 'Purchase',
        eventId: eventId || generateEventId(),
        eventTime: Math.floor(Date.now() / 1000),
        eventSourceUrl: eventSourceUrl || '',
        userData: {
          email: customerInfo.email,
          phone: customerInfo.phone,
          firstName: customerInfo.firstName,
          lastName: customerInfo.lastName,
          city: address.city,
          province: address.province,
          country: address.country,
          clientIpAddress,
          clientUserAgent,
          fbc,
          fbp,
          fbclid,
        },
        customData: {
          content_ids: items.map(item => item.variantId || item.id),
          content_type: 'product',
          value: total,
          currency: currency || getCurrencyCode(),
          num_items: items.length,
          order_id: orderNumber,
          ...utmData,
        },
      };

      return sendFacebookCAPIEvent(pixel, {
        ...eventData,
        testEventCode: pixel.testMode ? pixel.testEventCode : null,
      });
    })
  );

  return results;
}

/**
 * Fire InitiateCheckout event to all enabled CAPI pixels
 */
export async function fireInitiateCheckoutEvent(pixels, checkoutData) {
  const {
    items,
    total,
    currency,
    eventId,
    eventSourceUrl,
    clientIpAddress,
    clientUserAgent,
    fbc,
    fbp,
    fbclid,
    utmData,
  } = checkoutData;

  const capiPixels = pixels.filter(p => p.type === 'facebook_capi' && p.enabled && p.enableInitiateCheckout);

  if (capiPixels.length === 0) {
    return [];
  }

  const results = await Promise.all(
    capiPixels.map(pixel => {
      const eventData = {
        eventName: 'InitiateCheckout',
        eventId: eventId || generateEventId(),
        eventTime: Math.floor(Date.now() / 1000),
        eventSourceUrl: eventSourceUrl || '',
        userData: {
          clientIpAddress,
          clientUserAgent,
          fbc,
          fbp,
          fbclid,
        },
        customData: {
          content_ids: items.map(item => item.variantId || item.id),
          content_type: 'product',
          value: total,
          currency: currency || getCurrencyCode(),
          num_items: items.length,
          ...utmData,
        },
      };

      return sendFacebookCAPIEvent(pixel, {
        ...eventData,
        testEventCode: pixel.testMode ? pixel.testEventCode : null,
      });
    })
  );

  return results;
}

// ============================================
// TIKTOK EVENTS API
// ============================================

/**
 * Send event to TikTok Events API
 */
export async function sendTikTokEventsAPI(pixel, eventData) {
  const {
    eventName,
    eventId,
    eventTime,
    eventSourceUrl,
    userData = {},
    customData = {},
    testEventCode,
  } = eventData;

  try {
    // Build user data with hashed values
    const hashedUserData = {
      ...(userData.email && { email: [hashForFacebook(userData.email)] }),
      ...(userData.phone && { phone: [hashPhone(userData.phone)] }),
      ...(userData.clientIpAddress && { ip: userData.clientIpAddress }),
      ...(userData.clientUserAgent && { user_agent: userData.clientUserAgent }),
    };

    // Build the TikTok Events API request payload
    const payload = {
      pixel_code: pixel.pixelId,
      event: eventName,
      event_id: eventId,
      timestamp: eventTime || Math.floor(Date.now() / 1000).toString(),
      context: {
        user: hashedUserData,
        page: {
          url: eventSourceUrl || '',
        },
        ip: userData.clientIpAddress || '',
        user_agent: userData.clientUserAgent || '',
      },
      properties: {
        contents: customData.content_ids ? customData.content_ids.map(id => ({ content_id: id })) : [],
        content_type: customData.content_type || 'product',
        currency: customData.currency || 'USD',
        value: customData.value ? String(customData.value) : '0',
      },
      ...(testEventCode && { test_event_code: testEventCode }),
    };

    // Send to TikTok Events API
    const url = `https://business-api.tiktok.com/open_api/v1.3/pixel/track/`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Access-Token': pixel.accessToken,
      },
      body: JSON.stringify({ data: [payload] }),
    });

    const result = await response.json();

    // Log the event
    await logPixelEvent({
      pixelId: pixel.id,
      shopId: pixel.shopId,
      eventName,
      eventId,
      source: 'server',
      eventData: payload,
      status: response.ok ? 'sent' : 'failed',
      responseCode: response.status,
      errorMessage: response.ok ? null : JSON.stringify(result),
      orderId: customData.order_id || null,
      orderNumber: customData.order_id || null,
    });

    return {
      success: response.ok,
      response: result,
    };
  } catch (error) {
    console.error('TikTok Events API error:', error);

    // Log the failed event
    await logPixelEvent({
      pixelId: pixel.id,
      shopId: pixel.shopId,
      eventName,
      eventId,
      source: 'server',
      eventData: { error: error.message },
      status: 'failed',
      errorMessage: error.message,
    });

    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Fire TikTok Events API events for PlaceAnOrder and CompletePayment
 */
export async function fireTikTokEvents(pixels, orderData) {
  const {
    orderId,
    orderNumber,
    total,
    items,
    currency,
    customerInfo,
    eventId,
    eventSourceUrl,
    clientIpAddress,
    clientUserAgent,
    utmData,
  } = orderData;

  const tiktokPixels = pixels.filter(p => p.type === 'tiktok_events_api' && p.enabled);

  if (tiktokPixels.length === 0) {
    return [];
  }

  // Fire both PlaceAnOrder and CompletePayment events
  const results = await Promise.all(
    tiktokPixels.flatMap(pixel => {
      const baseEventData = {
        eventId: eventId || generateEventId(),
        eventTime: Math.floor(Date.now() / 1000),
        eventSourceUrl: eventSourceUrl || '',
        userData: {
          email: customerInfo.email,
          phone: customerInfo.phone,
          clientIpAddress,
          clientUserAgent,
        },
        customData: {
          content_ids: items.map(item => item.variantId || item.id),
          content_type: 'product',
          value: total,
          currency: currency || 'USD',
          order_id: orderNumber,
          ...utmData,
        },
      };

      const events = [];

      // PlaceAnOrder event
      if (pixel.enablePlaceAnOrder) {
        events.push(
          sendTikTokEventsAPI(pixel, {
            ...baseEventData,
            eventName: 'PlaceAnOrder',
            testEventCode: pixel.testMode ? pixel.testEventCode : null,
          })
        );
      }

      // CompletePayment event
      if (pixel.enableCompletePayment) {
        events.push(
          sendTikTokEventsAPI(pixel, {
            ...baseEventData,
            eventName: 'CompletePayment',
            testEventCode: pixel.testMode ? pixel.testEventCode : null,
          })
        );
      }

      return events;
    })
  );

  return results;
}
