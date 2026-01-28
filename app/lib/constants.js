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
 * Validate phone number format
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

  // Basic length validation (most phone numbers are 10-15 digits total)
  if (cleaned.length < 10 || cleaned.length > 15) {
    return {
      isValid: false,
      message: 'Phone number length is invalid'
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
