import crypto from 'crypto';
import { logPixelEvent } from './db.server.js';

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
 */
export function getCurrencyFromCountry(country) {
  const currencyMap = {
    PAK: 'PKR',
    UAE: 'AED',
    QATAR: 'QAR',
    KUWAIT: 'KWD',
    KSA: 'SAR',
  };
  return currencyMap[country] || 'PKR';
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

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
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
  } = orderData;

  const capiPixels = pixels.filter(p => p.type === 'facebook_capi' && p.enabled);

  if (capiPixels.length === 0) {
    return [];
  }

  // Build event data
  const eventData = {
    eventName: 'Purchase',
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
      currency: currency || 'PKR',
      num_items: items.length,
      order_id: orderNumber,
    },
  };

  // Send to all CAPI pixels
  const results = await Promise.all(
    capiPixels.map(pixel =>
      sendFacebookCAPIEvent(
        pixel,
        {
          ...eventData,
          testEventCode: pixel.testMode ? pixel.testEventCode : null,
        }
      )
    )
  );

  return results;
}
