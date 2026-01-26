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
