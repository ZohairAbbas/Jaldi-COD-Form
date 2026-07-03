import prisma from "../db.server";

// Map ISO 3166-1 alpha-2 country codes to internal codes
const ISO_TO_INTERNAL = {
  'PK': 'PAK',
  'AE': 'UAE',
  'QA': 'QATAR',
  'KW': 'KUWAIT',
  'SA': 'KSA',
};

// Check if IP is private/local (skip API call)
function isPrivateIP(ip) {
  if (!ip) return true;
  return /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|localhost|::1)/.test(ip);
}

// Map ISO country code to internal code
function mapCountryCode(isoCode) {
  if (!isoCode) return null;
  const upper = isoCode.toUpperCase().trim();
  return ISO_TO_INTERNAL[upper] || upper;
}

// Check if country is in shop's supported list
function isCountrySupported(countryCode, supportedCountries) {
  if (!countryCode || !supportedCountries || !Array.isArray(supportedCountries)) {
    return false;
  }
  return supportedCountries.includes(countryCode);
}

// Normalize an ISO alpha-2 code (uppercase, trimmed) or null
function normalizeIso(isoCode) {
  if (!isoCode) return null;
  const upper = isoCode.toUpperCase().trim();
  return /^[A-Z]{2}$/.test(upper) ? upper : null;
}

// Extract client IP from request headers
function getClientIP(request) {
  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0]?.trim();
  }
  return request.headers.get('x-real-ip') || '';
}

// Detect country from IP using ip-api.com
async function detectCountryFromIP(ip) {
  if (!ip || isPrivateIP(ip)) {
    return null;
  }

  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,countryCode`, {
      headers: { 'User-Agent': 'Jaldi-COD-App' },
      signal: AbortSignal.timeout(3000), // 3 second timeout
    });

    if (!response.ok) {
      console.error('ip-api.com request failed:', response.status);
      return null;
    }

    const data = await response.json();
    if (data.status === 'success' && data.countryCode) {
      return { iso: normalizeIso(data.countryCode), internal: mapCountryCode(data.countryCode) };
    }
    return null;
  } catch (error) {
    console.error('IP geolocation error:', error.message);
    return null;
  }
}

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return Response.json({ error: "Shop parameter is required" }, { status: 400 });
  }

  try {
    // Get shop data with multi-country settings
    const shopData = await prisma.shop.findUnique({
      where: { shopifyDomain: shop },
      select: {
        country: true,
        enableMultiCountry: true,
        supportedCountries: true,
      },
    });

    if (!shopData) {
      return Response.json({ error: "Shop not found" }, { status: 404 });
    }

    const defaultCountry = shopData.country || 'PAK';
    const supportedCountries = Array.isArray(shopData.supportedCountries)
      ? shopData.supportedCountries
      : [];

    // Detect the visitor's raw ISO country (Cloudflare first, then IP geo).
    // This runs regardless of multi-country pricing so the country-restriction
    // feature can gate the COD form even when multi-country is off.
    let isoCountry = normalizeIso(request.headers.get('cf-ipcountry')) ;
    let ipInternal = null; // internal-mapped code from IP lookup, reused below
    if (!isoCountry) {
      const clientIP = getClientIP(request);
      if (clientIP && !isPrivateIP(clientIP)) {
        const ipResult = await detectCountryFromIP(clientIP);
        if (ipResult) {
          isoCountry = ipResult.iso;
          ipInternal = ipResult.internal;
        }
      }
    }

    // If multi-country is disabled, return shop's default country (+ detected ISO)
    if (!shopData.enableMultiCountry) {
      return Response.json({
        country: defaultCountry,
        isoCountry,
        source: 'shop_default',
        supportedCountries: [defaultCountry],
      });
    }

    // If no supported countries configured, return default
    if (supportedCountries.length === 0) {
      return Response.json({
        country: defaultCountry,
        isoCountry,
        source: 'fallback',
        supportedCountries: [defaultCountry],
      });
    }

    // 1. Cloudflare-derived country (isoCountry already set from CF header)
    const cfInternal = isoCountry ? mapCountryCode(isoCountry) : null;
    if (cfInternal && !ipInternal && isCountrySupported(cfInternal, supportedCountries)) {
      return Response.json({
        country: cfInternal,
        isoCountry,
        source: 'cloudflare',
        supportedCountries,
      });
    }

    // 2. IP-geo-derived country
    if (ipInternal && isCountrySupported(ipInternal, supportedCountries)) {
      return Response.json({
        country: ipInternal,
        isoCountry,
        source: 'ip-api',
        supportedCountries,
      });
    }

    // 3. Fallback: Use shop's primary country if it's in supported list, otherwise first supported
    const fallbackCountry = isCountrySupported(defaultCountry, supportedCountries)
      ? defaultCountry
      : supportedCountries[0];

    return Response.json({
      country: fallbackCountry,
      isoCountry,
      source: 'fallback',
      supportedCountries,
    });

  } catch (error) {
    console.error("Error detecting country:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
};
