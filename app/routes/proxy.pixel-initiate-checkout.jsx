import { getShopByDomain, getEnabledPixels } from "../lib/db.server";
import { fireInitiateCheckoutEvent } from "../lib/pixels.server";
import { resolvePixelCurrency } from "../lib/constants";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const data = await request.json();
    const { shop: shopDomain, items, total, currency, pixelAttribution } = data;

    if (!shopDomain) {
      return Response.json({ error: "Missing shop" }, { status: 400 });
    }

    const shop = await getShopByDomain(shopDomain);
    if (!shop) {
      return Response.json({ error: "Shop not found" }, { status: 404 });
    }

    const pixels = await getEnabledPixels(shop.id);
    if (!pixels || pixels.length === 0) {
      return Response.json({ success: true, message: "No pixels configured" });
    }

    const clientIpAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || '';
    const clientUserAgent = request.headers.get('user-agent') || '';

    const resolvedCurrency = resolvePixelCurrency({
      presentmentCurrency: currency,
      shopCurrencyCode: shop.currencyCode,
      country: shop.country,
    });

    const utmData = {
      ...(pixelAttribution?.utm_source && { utm_source: pixelAttribution.utm_source }),
      ...(pixelAttribution?.utm_medium && { utm_medium: pixelAttribution.utm_medium }),
      ...(pixelAttribution?.utm_campaign && { utm_campaign: pixelAttribution.utm_campaign }),
      ...(pixelAttribution?.utm_term && { utm_term: pixelAttribution.utm_term }),
      ...(pixelAttribution?.utm_content && { utm_content: pixelAttribution.utm_content }),
    };

    fireInitiateCheckoutEvent(pixels, {
      items: items || [],
      total: total || 0,
      currency: resolvedCurrency,
      eventSourceUrl: request.headers.get('referer') || '',
      clientIpAddress,
      clientUserAgent,
      fbc: pixelAttribution?.fbc || null,
      fbp: pixelAttribution?.fbp || null,
      fbclid: pixelAttribution?.fbclid || null,
      utmData,
    }).catch(err => {
      console.error('[Pixel] CAPI InitiateCheckout error:', err);
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('[Pixel] InitiateCheckout route error:', error);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
};
