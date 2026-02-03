/**
 * Country and Province Data Constants
 */

// Supported countries
export const COUNTRIES = {
  PAK: {
    code: 'PAK',
    name: 'Pakistan',
    phoneCode: '+92',
    currencyCode: 'PKR',
    currencySymbol: 'Rs.',
    provinces: [
      'Punjab',
      'Sindh',
      'Khyber Pakhtunkhwa',
      'Balochistan',
      'Gilgit-Baltistan',
      'Azad Jammu & Kashmir',
      'Islamabad Capital Territory'
    ]
  },
  UAE: {
    code: 'UAE',
    name: 'United Arab Emirates',
    phoneCode: '+971',
    currencyCode: 'AED',
    currencySymbol: 'Dhs.',
    provinces: [
      'Abu Dhabi',
      'Dubai',
      'Sharjah',
      'Ajman',
      'Umm Al Quwain',
      'Ras Al Khaimah',
      'Fujairah'
    ]
  },
  QATAR: {
    code: 'QATAR',
    name: 'Qatar',
    phoneCode: '+974',
    currencyCode: 'QAR',
    currencySymbol: 'QR',
    provinces: [
      'Doha',
      'Al Rayyan',
      'Al Wakrah',
      'Al Khor',
      'Al Daayen',
      'Umm Salal',
      'Al Shamal',
      'Al Shahaniya'
    ]
  },
  KUWAIT: {
    code: 'KUWAIT',
    name: 'Kuwait',
    phoneCode: '+965',
    currencyCode: 'KWD',
    currencySymbol: 'KD',
    provinces: [
      'Al Asimah',
      'Hawalli',
      'Farwaniya',
      'Mubarak Al-Kabeer',
      'Ahmadi',
      'Jahra'
    ]
  },
  KSA: {
    code: 'KSA',
    name: 'Saudi Arabia',
    phoneCode: '+966',
    currencyCode: 'SAR',
    currencySymbol: 'SAR',
    provinces: [
      'Riyadh',
      'Makkah',
      'Madinah',
      'Eastern Province',
      'Asir',
      'Tabuk',
      'Qassim',
      'Ha\'il',
      'Northern Borders',
      'Jizan',
      'Najran',
      'Al Bahah',
      'Al Jawf'
    ]
  }
};

// Country list for dropdowns
export const COUNTRY_OPTIONS = [
  { value: 'PAK', label: 'Pakistan' },
  { value: 'UAE', label: 'United Arab Emirates' },
  { value: 'QATAR', label: 'Qatar' },
  { value: 'KUWAIT', label: 'Kuwait' },
  { value: 'KSA', label: 'Saudi Arabia' }
];

/**
 * Get country data by code
 */
export function getCountryData(countryCode) {
  return COUNTRIES[countryCode] || COUNTRIES.PAK;
}

/**
 * Get provinces for a country
 */
export function getProvinces(countryCode) {
  const country = getCountryData(countryCode);
  return country.provinces;
}

/**
 * Get phone code for a country
 */
export function getPhoneCode(countryCode) {
  const country = getCountryData(countryCode);
  return country.phoneCode;
}

/**
 * Get currency code for a country
 */
export function getCurrencyCode(countryCode) {
  const country = getCountryData(countryCode);
  return country.currencyCode;
}

/**
 * Get currency symbol for a country
 */
export function getCurrencySymbol(countryCode) {
  const country = getCountryData(countryCode);
  return country.currencySymbol;
}

/**
 * Validate phone number format (matches Shopify's requirements)
 */
export function validatePhone(phone, countryCode) {
  const country = getCountryData(countryCode);

  // Remove all non-digit characters except +
  const cleaned = phone.replace(/[^\d+]/g, '');

  // Check if it starts with the country code
  if (!cleaned.startsWith(country.phoneCode)) {
    return {
      isValid: false,
      message: `Phone number must start with ${country.phoneCode}`
    };
  }

  // Extract the phone number without country code
  const phoneWithoutCode = cleaned.substring(country.phoneCode.length);

  // Country-specific validation rules (matching Shopify's requirements)
  const validationRules = {
    'PAK': { minDigits: 10, maxDigits: 10 }, // +92 3XX XXXXXXX = 10 digits
    'UAE': { minDigits: 9, maxDigits: 9 },   // +971 5X XXX XXXX = 9 digits
    'QATAR': { minDigits: 8, maxDigits: 8 }, // +974 XXXX XXXX = 8 digits
    'KUWAIT': { minDigits: 8, maxDigits: 8 }, // +965 XXXX XXXX = 8 digits
    'KSA': { minDigits: 9, maxDigits: 9 }    // +966 5X XXX XXXX = 9 digits
  };

  const rules = validationRules[countryCode] || { minDigits: 8, maxDigits: 15 };

  if (phoneWithoutCode.length < rules.minDigits) {
    return {
      isValid: false,
      message: `Phone number must have at least ${rules.minDigits} digits after ${country.phoneCode}`
    };
  }

  if (phoneWithoutCode.length > rules.maxDigits) {
    return {
      isValid: false,
      message: `Phone number must have at most ${rules.maxDigits} digits after ${country.phoneCode}`
    };
  }

  // Ensure the phone number after country code doesn't start with 0
  if (phoneWithoutCode.startsWith('0')) {
    return {
      isValid: false,
      message: 'Remove the leading 0 after the country code'
    };
  }

  return { isValid: true };
}

/**
 * Format phone number with country code
 */
export function formatPhone(phone, countryCode) {
  const country = getCountryData(countryCode);
  const cleaned = phone.replace(/[^\d]/g, '');

  // If already has country code (without +), add the +
  if (cleaned.startsWith(country.phoneCode.replace('+', ''))) {
    return '+' + cleaned;
  }

  // If doesn't have country code, add it
  return country.phoneCode + cleaned;
}

/**
 * Normalize price from various formats to a valid number
 * Handles:
 * - Comma as thousand separator: "1,500.50" -> 1500.50
 * - Comma as decimal separator: "1500,50" -> 1500.50
 * - Mixed formats: "1.500,50" (EU format) -> 1500.50
 * - Already numeric values: 1500.50 -> 1500.50
 * - Strings with currency symbols: "Rs.1,500.50" -> 1500.50
 *
 * @param {string|number} price - The price value to normalize
 * @returns {number} - Normalized price as a number
 */
export function normalizePrice(price) {
  // Already a number
  if (typeof price === 'number') {
    return isNaN(price) ? 0 : price;
  }

  // Not a string or number
  if (typeof price !== 'string') {
    return 0;
  }

  // Remove all spaces and currency symbols (common patterns)
  let cleaned = price.trim()
    .replace(/[^\d,.-]/g, '') // Keep only digits, comma, dot, minus
    .trim();

  // Empty string after cleaning
  if (!cleaned) {
    return 0;
  }

  // Detect format by analyzing comma and dot positions
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  // Case 1: Has both comma and dot
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastDot > lastComma) {
      // Format: "1,500.50" (US format) - comma is thousand separator
      cleaned = cleaned.replace(/,/g, '');
    } else {
      // Format: "1.500,50" (EU format) - dot is thousand separator, comma is decimal
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    }
  }
  // Case 2: Has only comma
  else if (lastComma !== -1) {
    // Check if comma is decimal separator (EU format) or thousand separator
    const afterComma = cleaned.substring(lastComma + 1);

    // If there are exactly 2 digits after the last comma, treat as decimal separator
    // Examples: "139,00" "1500,50"
    if (afterComma.length === 2 && /^\d{2}$/.test(afterComma)) {
      cleaned = cleaned.replace(',', '.');
    }
    // If more than 2 digits or contains more commas, remove all commas (thousand separators)
    // Examples: "1,500,000" "1,500"
    else {
      cleaned = cleaned.replace(/,/g, '');
    }
  }
  // Case 3: Has only dots - keep as is (either decimal or thousand separator)
  // In most cases, single dot is decimal. Multiple dots would be thousand separators.
  else if (lastDot !== -1) {
    const dotCount = (cleaned.match(/\./g) || []).length;
    if (dotCount > 1) {
      // Multiple dots: treat as thousand separators, remove all
      // Example: "1.500.000" -> "1500000"
      cleaned = cleaned.replace(/\./g, '');
    }
    // Single dot: keep as decimal separator
  }

  // Parse the cleaned string
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Safely parse a price value to ensure it's a valid number
 * This is a convenience wrapper around normalizePrice for common use cases
 *
 * @param {string|number} price - The price value to parse
 * @param {number} defaultValue - Default value if parsing fails (default: 0)
 * @returns {number} - Parsed price or default value
 */
export function parsePrice(price, defaultValue = 0) {
  const normalized = normalizePrice(price);
  return normalized === 0 && defaultValue !== 0 ? defaultValue : normalized;
}

/**
 * Form Field Configuration Constants
 */

// Core field IDs that cannot be deleted
export const CORE_FIELD_IDS = ["first-name", "phone", "address", "city", "email"];

// Shopify field options with their mappings
export const SHOPIFY_FIELD_OPTIONS = [
  {
    id: "first-name",
    label: "First Name",
    type: "text",
    shopifyProperty: "shipping_address.first_name",
    icon: "person",
    defaultPlaceholder: "First Name"
  },
  {
    id: "last-name",
    label: "Last Name",
    type: "text",
    shopifyProperty: "shipping_address.last_name",
    icon: "person",
    defaultPlaceholder: "Last Name"
  },
  {
    id: "email",
    label: "Email",
    type: "text",
    shopifyProperty: "order.email",
    icon: "email",
    defaultPlaceholder: "email@example.com"
  },
  {
    id: "phone",
    label: "Phone",
    type: "text",
    shopifyProperty: "shipping_address.phone",
    icon: "phone",
    defaultPlaceholder: "Phone"
  },
  {
    id: "address",
    label: "Address",
    type: "text",
    shopifyProperty: "shipping_address.address1",
    icon: "location",
    defaultPlaceholder: "Address"
  },
  {
    id: "address2",
    label: "Address 2",
    type: "text",
    shopifyProperty: "shipping_address.address2",
    icon: "location",
    defaultPlaceholder: "Apartment, suite, etc. (optional)"
  },
  {
    id: "city",
    label: "City",
    type: "text",
    shopifyProperty: "shipping_address.city",
    icon: "location",
    defaultPlaceholder: "City"
  },
  {
    id: "province",
    label: "Province (State)",
    type: "dropdown",
    shopifyProperty: "shipping_address.province",
    icon: "location",
    defaultPlaceholder: "Province",
    defaultOptions: ["Punjab", "Sindh", "KPK", "Balochistan", "Islamabad"]
  },
  {
    id: "postal-code",
    label: "Postal code",
    type: "text",
    shopifyProperty: "shipping_address.zip",
    icon: "location",
    defaultPlaceholder: "Postal code (optional)"
  },
  {
    id: "country",
    label: "Country",
    type: "text",
    shopifyProperty: "shipping_address.country",
    icon: "location",
    defaultPlaceholder: "Country"
  },
  {
    id: "discount-code",
    label: "Discount Code",
    type: "text",
    shopifyProperty: "discount_code",
    icon: "discount",
    defaultPlaceholder: "Enter discount code"
  },
  {
    id: "quantity",
    label: "Quantity",
    type: "quantity",
    shopifyProperty: "line_items.quantity",
    icon: "quantity",
    defaultPlaceholder: "1"
  }
];

/**
 * Get Shopify field configuration by ID
 */
export function getShopifyFieldConfig(fieldId) {
  return SHOPIFY_FIELD_OPTIONS.find(f => f.id === fieldId);
}

/**
 * Check if a field is a core field
 */
export function isCoreField(fieldId) {
  return CORE_FIELD_IDS.includes(fieldId);
}

/**
 * Check if a field ID is already in use
 */
export function isFieldIdTaken(fieldId, existingFields) {
  return existingFields.some(f => f.id === fieldId);
}
