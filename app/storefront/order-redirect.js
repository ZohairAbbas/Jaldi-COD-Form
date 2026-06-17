// Post-order redirection helpers (COD).
// Supports 4 merchant-configured modes: Shopify default thank-you page,
// a specific page URL, a WhatsApp deep link, or no redirect (thank-you message).

import { DEFAULT_THANK_YOU_MESSAGE } from '../lib/constants';

/**
 * Build the variable map used to interpolate {{...}} tokens in the thank-you
 * message and WhatsApp message, from the submitted order data + server result.
 */
export function buildOrderVariables(orderData, result, currencySymbol = '') {
  const items = orderData?.items || [];
  const firstName = orderData?.firstName || '';
  const lastName = orderData?.lastName || '';
  const fullName = `${firstName} ${lastName}`.trim();
  const totalQuantity = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
  const productNames = items.map(i => i.title).filter(Boolean).join(', ');
  const total = result?.total != null ? result.total : orderData?.total;
  const totalStr = total != null ? `${currencySymbol}${Number(total).toFixed(2)}` : '';

  return {
    'customer.name': fullName,
    'customer.first_name': firstName,
    'customer.last_name': lastName,
    'customer.phone': orderData?.phone || '',
    'customer.email': orderData?.email || '',
    'customer.address1': orderData?.address || '',
    'customer.address2': orderData?.address2 || '',
    'customer.city': orderData?.city || '',
    'customer.province': orderData?.province || '',
    'customer.zip': orderData?.postalCode || orderData?.postalcode || '',
    'order.number': result?.shopifyOrderNumber != null ? String(result.shopifyOrderNumber) : '',
    'order.total': totalStr,
    'order.products': productNames,
    'order.quantity': String(totalQuantity),
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Replace {{ key }} tokens in a template using the variable map.
 * Unknown tokens are replaced with an empty string. Variable values are
 * HTML-escaped (the template itself is merchant-authored and trusted; the
 * values are customer-supplied, so they must not inject markup).
 * Pass { escape: false } for plain-text targets (e.g. WhatsApp message).
 */
export function interpolate(template, variables, { escape = true } = {}) {
  if (!template) return '';
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    if (!Object.prototype.hasOwnProperty.call(variables, key)) return '';
    const value = variables[key];
    return escape ? escapeHtml(value) : value;
  });
}

/**
 * Resolve what should happen after a successful COD order.
 * Returns one of:
 *   { type: 'redirect', url }   — navigate the browser to url
 *   { type: 'message', html }   — show an in-form thank-you message
 *   { type: 'close' }           — no message, no url; just close
 */
export function resolveOrderRedirect(settings, orderData, result, currencySymbol = '') {
  const mode = settings?.redirectMode || 'shopify';
  const variables = buildOrderVariables(orderData, result, currencySymbol);

  if (mode === 'custom_page') {
    const url = (settings.redirectUrl || '').trim();
    if (url) return { type: 'redirect', url };
    // Misconfigured — fall back to Shopify status page
    return result?.orderStatusUrl ? { type: 'redirect', url: result.orderStatusUrl } : { type: 'close' };
  }

  if (mode === 'whatsapp') {
    const number = (settings.redirectWhatsappNumber || '').replace(/[^\d]/g, '');
    if (number) {
      const text = interpolate(settings.redirectWhatsappMessage || '', variables, { escape: false });
      const url = `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
      return { type: 'redirect', url };
    }
    return result?.orderStatusUrl ? { type: 'redirect', url: result.orderStatusUrl } : { type: 'close' };
  }

  if (mode === 'none') {
    const template = (settings.thankYouMessage && settings.thankYouMessage.trim() !== '')
      ? settings.thankYouMessage
      : DEFAULT_THANK_YOU_MESSAGE;
    const html = interpolate(template, variables);
    return { type: 'message', html };
  }

  // Default: Shopify thank-you / order status page
  return result?.orderStatusUrl
    ? { type: 'redirect', url: result.orderStatusUrl }
    : { type: 'close' };
}
