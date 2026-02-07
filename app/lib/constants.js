/**
 * Country and Province Data Constants
 */

// Supported countries with comprehensive data
export const COUNTRIES = {
  // Current supported countries with full province data
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
  },

  // All other countries (A-Z)
  AFG: { code: 'AFG', name: 'Afghanistan', phoneCode: '+93', currencyCode: 'AFN', currencySymbol: '؋', provinces: [] },
  ALB: { code: 'ALB', name: 'Albania', phoneCode: '+355', currencyCode: 'ALL', currencySymbol: 'L', provinces: [] },
  DZA: { code: 'DZA', name: 'Algeria', phoneCode: '+213', currencyCode: 'DZD', currencySymbol: 'د.ج', provinces: [] },
  AND: { code: 'AND', name: 'Andorra', phoneCode: '+376', currencyCode: 'EUR', currencySymbol: '€', provinces: [] },
  AGO: { code: 'AGO', name: 'Angola', phoneCode: '+244', currencyCode: 'AOA', currencySymbol: 'Kz', provinces: [] },
  ATG: { code: 'ATG', name: 'Antigua and Barbuda', phoneCode: '+1-268', currencyCode: 'XCD', currencySymbol: '$', provinces: [] },
  ARG: { code: 'ARG', name: 'Argentina', phoneCode: '+54', currencyCode: 'ARS', currencySymbol: '$', provinces: [] },
  ARM: { code: 'ARM', name: 'Armenia', phoneCode: '+374', currencyCode: 'AMD', currencySymbol: '֏', provinces: [] },
  AUS: { code: 'AUS', name: 'Australia', phoneCode: '+61', currencyCode: 'AUD', currencySymbol: '$', provinces: [] },
  AUT: { code: 'AUT', name: 'Austria', phoneCode: '+43', currencyCode: 'EUR', currencySymbol: '€', provinces: [] },
  AZE: { code: 'AZE', name: 'Azerbaijan', phoneCode: '+994', currencyCode: 'AZN', currencySymbol: '₼', provinces: [] },
  BHS: { code: 'BHS', name: 'Bahamas', phoneCode: '+1-242', currencyCode: 'BSD', currencySymbol: '$', provinces: [] },
  BHR: { code: 'BHR', name: 'Bahrain', phoneCode: '+973', currencyCode: 'BHD', currencySymbol: '.د.ب', provinces: ["Al Janūbīyah", "Al Manāmah", "Al Muḩarraq", "Al Wusţá", "Ash Shamālīyah"] },
  BGD: { code: 'BGD', name: 'Bangladesh', phoneCode: '+880', currencyCode: 'BDT', currencySymbol: '৳', provinces: [] },
  BRB: { code: 'BRB', name: 'Barbados', phoneCode: '+1-246', currencyCode: 'BBD', currencySymbol: '$', provinces: [] },
  BLR: { code: 'BLR', name: 'Belarus', phoneCode: '+375', currencyCode: 'BYN', currencySymbol: 'Br', provinces: [] },
  BEL: { code: 'BEL', name: 'Belgium', phoneCode: '+32', currencyCode: 'EUR', currencySymbol: '€', provinces: [] },
  BLZ: { code: 'BLZ', name: 'Belize', phoneCode: '+501', currencyCode: 'BZD', currencySymbol: '$', provinces: [] },
  BEN: { code: 'BEN', name: 'Benin', phoneCode: '+229', currencyCode: 'XOF', currencySymbol: 'Fr', provinces: [] },
  BTN: { code: 'BTN', name: 'Bhutan', phoneCode: '+975', currencyCode: 'BTN', currencySymbol: 'Nu.', provinces: [] },
  BOL: { code: 'BOL', name: 'Bolivia', phoneCode: '+591', currencyCode: 'BOB', currencySymbol: 'Bs.', provinces: [] },
  BIH: { code: 'BIH', name: 'Bosnia and Herzegovina', phoneCode: '+387', currencyCode: 'BAM', currencySymbol: 'KM', provinces: [] },
  BWA: { code: 'BWA', name: 'Botswana', phoneCode: '+267', currencyCode: 'BWP', currencySymbol: 'P', provinces: [] },
  BRA: { code: 'BRA', name: 'Brazil', phoneCode: '+55', currencyCode: 'BRL', currencySymbol: 'R$', provinces: [] },
  BRN: { code: 'BRN', name: 'Brunei', phoneCode: '+673', currencyCode: 'BND', currencySymbol: '$', provinces: [] },
  BGR: { code: 'BGR', name: 'Bulgaria', phoneCode: '+359', currencyCode: 'BGN', currencySymbol: 'лв', provinces: [] },
  BFA: { code: 'BFA', name: 'Burkina Faso', phoneCode: '+226', currencyCode: 'XOF', currencySymbol: 'Fr', provinces: [] },
  BDI: { code: 'BDI', name: 'Burundi', phoneCode: '+257', currencyCode: 'BIF', currencySymbol: 'Fr', provinces: [] },
  CPV: { code: 'CPV', name: 'Cabo Verde', phoneCode: '+238', currencyCode: 'CVE', currencySymbol: '$', provinces: [] },
  KHM: { code: 'KHM', name: 'Cambodia', phoneCode: '+855', currencyCode: 'KHR', currencySymbol: '៛', provinces: [] },
  CMR: { code: 'CMR', name: 'Cameroon', phoneCode: '+237', currencyCode: 'XAF', currencySymbol: 'Fr', provinces: [] },
  CAN: { code: 'CAN', name: 'Canada', phoneCode: '+1', currencyCode: 'CAD', currencySymbol: '$', provinces: [] },
  CAF: { code: 'CAF', name: 'Central African Republic', phoneCode: '+236', currencyCode: 'XAF', currencySymbol: 'Fr', provinces: [] },
  TCD: { code: 'TCD', name: 'Chad', phoneCode: '+235', currencyCode: 'XAF', currencySymbol: 'Fr', provinces: [] },
  CHL: { code: 'CHL', name: 'Chile', phoneCode: '+56', currencyCode: 'CLP', currencySymbol: '$', provinces: [] },
  CHN: { code: 'CHN', name: 'China', phoneCode: '+86', currencyCode: 'CNY', currencySymbol: '¥', provinces: [] },
  COL: { code: 'COL', name: 'Colombia', phoneCode: '+57', currencyCode: 'COP', currencySymbol: '$', provinces: [] },
  COM: { code: 'COM', name: 'Comoros', phoneCode: '+269', currencyCode: 'KMF', currencySymbol: 'Fr', provinces: [] },
  COG: { code: 'COG', name: 'Congo', phoneCode: '+242', currencyCode: 'XAF', currencySymbol: 'Fr', provinces: [] },
  COD: { code: 'COD', name: 'Congo (Democratic Republic)', phoneCode: '+243', currencyCode: 'CDF', currencySymbol: 'Fr', provinces: [] },
  CRI: { code: 'CRI', name: 'Costa Rica', phoneCode: '+506', currencyCode: 'CRC', currencySymbol: '₡', provinces: [] },
  HRV: { code: 'HRV', name: 'Croatia', phoneCode: '+385', currencyCode: 'EUR', currencySymbol: '€', provinces: [] },
  CUB: { code: 'CUB', name: 'Cuba', phoneCode: '+53', currencyCode: 'CUP', currencySymbol: '$', provinces: [] },
  CYP: { code: 'CYP', name: 'Cyprus', phoneCode: '+357', currencyCode: 'EUR', currencySymbol: '€', provinces: [] },
  CZE: { code: 'CZE', name: 'Czech Republic', phoneCode: '+420', currencyCode: 'CZK', currencySymbol: 'Kč', provinces: [] },
  CIV: { code: 'CIV', name: 'Côte d\'Ivoire', phoneCode: '+225', currencyCode: 'XOF', currencySymbol: 'Fr', provinces: [] },
  DNK: { code: 'DNK', name: 'Denmark', phoneCode: '+45', currencyCode: 'DKK', currencySymbol: 'kr', provinces: [] },
  DJI: { code: 'DJI', name: 'Djibouti', phoneCode: '+253', currencyCode: 'DJF', currencySymbol: 'Fr', provinces: [] },
  DMA: { code: 'DMA', name: 'Dominica', phoneCode: '+1-767', currencyCode: 'XCD', currencySymbol: '$', provinces: [] },
  DOM: { code: 'DOM', name: 'Dominican Republic', phoneCode: '+1-809', currencyCode: 'DOP', currencySymbol: '$', provinces: [] },
  ECU: { code: 'ECU', name: 'Ecuador', phoneCode: '+593', currencyCode: 'USD', currencySymbol: '$', provinces: [] },
  EGY: { code: 'EGY', name: 'Egypt', phoneCode: '+20', currencyCode: 'EGP', currencySymbol: '£', provinces: [] },
  SLV: { code: 'SLV', name: 'El Salvador', phoneCode: '+503', currencyCode: 'USD', currencySymbol: '$', provinces: [] },
  GNQ: { code: 'GNQ', name: 'Equatorial Guinea', phoneCode: '+240', currencyCode: 'XAF', currencySymbol: 'Fr', provinces: [] },
  ERI: { code: 'ERI', name: 'Eritrea', phoneCode: '+291', currencyCode: 'ERN', currencySymbol: 'Nfk', provinces: [] },
  EST: { code: 'EST', name: 'Estonia', phoneCode: '+372', currencyCode: 'EUR', currencySymbol: '€', provinces: [] },
  SWZ: { code: 'SWZ', name: 'Eswatini', phoneCode: '+268', currencyCode: 'SZL', currencySymbol: 'L', provinces: [] },
  ETH: { code: 'ETH', name: 'Ethiopia', phoneCode: '+251', currencyCode: 'ETB', currencySymbol: 'Br', provinces: [] },
  FJI: { code: 'FJI', name: 'Fiji', phoneCode: '+679', currencyCode: 'FJD', currencySymbol: '$', provinces: [] },
  FIN: { code: 'FIN', name: 'Finland', phoneCode: '+358', currencyCode: 'EUR', currencySymbol: '€', provinces: [] },
  FRA: { code: 'FRA', name: 'France', phoneCode: '+33', currencyCode: 'EUR', currencySymbol: '€', provinces: [] },
  GAB: { code: 'GAB', name: 'Gabon', phoneCode: '+241', currencyCode: 'XAF', currencySymbol: 'Fr', provinces: [] },
  GMB: { code: 'GMB', name: 'Gambia', phoneCode: '+220', currencyCode: 'GMD', currencySymbol: 'D', provinces: [] },
  GEO: { code: 'GEO', name: 'Georgia', phoneCode: '+995', currencyCode: 'GEL', currencySymbol: '₾', provinces: [] },
  DEU: { code: 'DEU', name: 'Germany', phoneCode: '+49', currencyCode: 'EUR', currencySymbol: '€', provinces: [] },
  GHA: { code: 'GHA', name: 'Ghana', phoneCode: '+233', currencyCode: 'GHS', currencySymbol: '₵', provinces: [] },
  GRC: { code: 'GRC', name: 'Greece', phoneCode: '+30', currencyCode: 'EUR', currencySymbol: '€', provinces: [] },
  GRD: { code: 'GRD', name: 'Grenada', phoneCode: '+1-473', currencyCode: 'XCD', currencySymbol: '$', provinces: [] },
  GTM: { code: 'GTM', name: 'Guatemala', phoneCode: '+502', currencyCode: 'GTQ', currencySymbol: 'Q', provinces: [] },
  GIN: { code: 'GIN', name: 'Guinea', phoneCode: '+224', currencyCode: 'GNF', currencySymbol: 'Fr', provinces: [] },
  GNB: { code: 'GNB', name: 'Guinea-Bissau', phoneCode: '+245', currencyCode: 'XOF', currencySymbol: 'Fr', provinces: [] },
  GUY: { code: 'GUY', name: 'Guyana', phoneCode: '+592', currencyCode: 'GYD', currencySymbol: '$', provinces: [] },
  HTI: { code: 'HTI', name: 'Haiti', phoneCode: '+509', currencyCode: 'HTG', currencySymbol: 'G', provinces: [] },
  HND: { code: 'HND', name: 'Honduras', phoneCode: '+504', currencyCode: 'HNL', currencySymbol: 'L', provinces: [] },
  HUN: { code: 'HUN', name: 'Hungary', phoneCode: '+36', currencyCode: 'HUF', currencySymbol: 'Ft', provinces: [] },
  ISL: { code: 'ISL', name: 'Iceland', phoneCode: '+354', currencyCode: 'ISK', currencySymbol: 'kr', provinces: [] },
  IND: { code: 'IND', name: 'India', phoneCode: '+91', currencyCode: 'INR', currencySymbol: '₹', provinces: [] },
  IDN: { code: 'IDN', name: 'Indonesia', phoneCode: '+62', currencyCode: 'IDR', currencySymbol: 'Rp', provinces: [] },
  IRN: { code: 'IRN', name: 'Iran', phoneCode: '+98', currencyCode: 'IRR', currencySymbol: '﷼', provinces: [] },
  IRQ: { code: 'IRQ', name: 'Iraq', phoneCode: '+964', currencyCode: 'IQD', currencySymbol: 'ع.د', provinces: [] },
  IRL: { code: 'IRL', name: 'Ireland', phoneCode: '+353', currencyCode: 'EUR', currencySymbol: '€', provinces: [] },
  ISR: { code: 'ISR', name: 'Israel', phoneCode: '+972', currencyCode: 'ILS', currencySymbol: '₪', provinces: [] },
  ITA: { code: 'ITA', name: 'Italy', phoneCode: '+39', currencyCode: 'EUR', currencySymbol: '€', provinces: [] },
  JAM: { code: 'JAM', name: 'Jamaica', phoneCode: '+1-876', currencyCode: 'JMD', currencySymbol: '$', provinces: [] },
  JPN: { code: 'JPN', name: 'Japan', phoneCode: '+81', currencyCode: 'JPY', currencySymbol: '¥', provinces: [] },
  JOR: { code: 'JOR', name: 'Jordan', phoneCode: '+962', currencyCode: 'JOD', currencySymbol: 'د.ا', provinces: [] },
  KAZ: { code: 'KAZ', name: 'Kazakhstan', phoneCode: '+7', currencyCode: 'KZT', currencySymbol: '₸', provinces: [] },
  KEN: { code: 'KEN', name: 'Kenya', phoneCode: '+254', currencyCode: 'KES', currencySymbol: 'Sh', provinces: [] },
  KIR: { code: 'KIR', name: 'Kiribati', phoneCode: '+686', currencyCode: 'AUD', currencySymbol: '$', provinces: [] },
  PRK: { code: 'PRK', name: 'North Korea', phoneCode: '+850', currencyCode: 'KPW', currencySymbol: '₩', provinces: [] },
  KOR: { code: 'KOR', name: 'South Korea', phoneCode: '+82', currencyCode: 'KRW', currencySymbol: '₩', provinces: [] },
  XKX: { code: 'XKX', name: 'Kosovo', phoneCode: '+383', currencyCode: 'EUR', currencySymbol: '€', provinces: [] },
  KGZ: { code: 'KGZ', name: 'Kyrgyzstan', phoneCode: '+996', currencyCode: 'KGS', currencySymbol: 'с', provinces: [] },
  LAO: { code: 'LAO', name: 'Laos', phoneCode: '+856', currencyCode: 'LAK', currencySymbol: '₭', provinces: [] },
  LVA: { code: 'LVA', name: 'Latvia', phoneCode: '+371', currencyCode: 'EUR', currencySymbol: '€', provinces: [] },
  LBN: { code: 'LBN', name: 'Lebanon', phoneCode: '+961', currencyCode: 'LBP', currencySymbol: 'ل.ل', provinces: [] },
  LSO: { code: 'LSO', name: 'Lesotho', phoneCode: '+266', currencyCode: 'LSL', currencySymbol: 'L', provinces: [] },
  LBR: { code: 'LBR', name: 'Liberia', phoneCode: '+231', currencyCode: 'LRD', currencySymbol: '$', provinces: [] },
  LBY: { code: 'LBY', name: 'Libya', phoneCode: '+218', currencyCode: 'LYD', currencySymbol: 'ل.د', provinces: [] },
  LIE: { code: 'LIE', name: 'Liechtenstein', phoneCode: '+423', currencyCode: 'CHF', currencySymbol: 'Fr', provinces: [] },
  LTU: { code: 'LTU', name: 'Lithuania', phoneCode: '+370', currencyCode: 'EUR', currencySymbol: '€', provinces: [] },
  LUX: { code: 'LUX', name: 'Luxembourg', phoneCode: '+352', currencyCode: 'EUR', currencySymbol: '€', provinces: [] },
  MDG: { code: 'MDG', name: 'Madagascar', phoneCode: '+261', currencyCode: 'MGA', currencySymbol: 'Ar', provinces: [] },
  MWI: { code: 'MWI', name: 'Malawi', phoneCode: '+265', currencyCode: 'MWK', currencySymbol: 'MK', provinces: [] },
  MYS: { code: 'MYS', name: 'Malaysia', phoneCode: '+60', currencyCode: 'MYR', currencySymbol: 'RM', provinces: [] },
  MDV: { code: 'MDV', name: 'Maldives', phoneCode: '+960', currencyCode: 'MVR', currencySymbol: 'Rf', provinces: [] },
  MLI: { code: 'MLI', name: 'Mali', phoneCode: '+223', currencyCode: 'XOF', currencySymbol: 'Fr', provinces: [] },
  MLT: { code: 'MLT', name: 'Malta', phoneCode: '+356', currencyCode: 'EUR', currencySymbol: '€', provinces: [] },
  MHL: { code: 'MHL', name: 'Marshall Islands', phoneCode: '+692', currencyCode: 'USD', currencySymbol: '$', provinces: [] },
  MRT: { code: 'MRT', name: 'Mauritania', phoneCode: '+222', currencyCode: 'MRU', currencySymbol: 'UM', provinces: [] },
  MUS: { code: 'MUS', name: 'Mauritius', phoneCode: '+230', currencyCode: 'MUR', currencySymbol: '₨', provinces: [] },
  MEX: { code: 'MEX', name: 'Mexico', phoneCode: '+52', currencyCode: 'MXN', currencySymbol: '$', provinces: [] },
  FSM: { code: 'FSM', name: 'Micronesia', phoneCode: '+691', currencyCode: 'USD', currencySymbol: '$', provinces: [] },
  MDA: { code: 'MDA', name: 'Moldova', phoneCode: '+373', currencyCode: 'MDL', currencySymbol: 'L', provinces: [] },
  MCO: { code: 'MCO', name: 'Monaco', phoneCode: '+377', currencyCode: 'EUR', currencySymbol: '€', provinces: [] },
  MNG: { code: 'MNG', name: 'Mongolia', phoneCode: '+976', currencyCode: 'MNT', currencySymbol: '₮', provinces: [] },
  MNE: { code: 'MNE', name: 'Montenegro', phoneCode: '+382', currencyCode: 'EUR', currencySymbol: '€', provinces: [] },
  MAR: { code: 'MAR', name: 'Morocco', phoneCode: '+212', currencyCode: 'MAD', currencySymbol: 'د.م.', provinces: [] },
  MOZ: { code: 'MOZ', name: 'Mozambique', phoneCode: '+258', currencyCode: 'MZN', currencySymbol: 'MT', provinces: [] },
  MMR: { code: 'MMR', name: 'Myanmar', phoneCode: '+95', currencyCode: 'MMK', currencySymbol: 'K', provinces: [] },
  NAM: { code: 'NAM', name: 'Namibia', phoneCode: '+264', currencyCode: 'NAD', currencySymbol: '$', provinces: [] },
  NRU: { code: 'NRU', name: 'Nauru', phoneCode: '+674', currencyCode: 'AUD', currencySymbol: '$', provinces: [] },
  NPL: { code: 'NPL', name: 'Nepal', phoneCode: '+977', currencyCode: 'NPR', currencySymbol: '₨', provinces: [] },
  NLD: { code: 'NLD', name: 'Netherlands', phoneCode: '+31', currencyCode: 'EUR', currencySymbol: '€', provinces: [] },
  NZL: { code: 'NZL', name: 'New Zealand', phoneCode: '+64', currencyCode: 'NZD', currencySymbol: '$', provinces: [] },
  NIC: { code: 'NIC', name: 'Nicaragua', phoneCode: '+505', currencyCode: 'NIO', currencySymbol: 'C$', provinces: [] },
  NER: { code: 'NER', name: 'Niger', phoneCode: '+227', currencyCode: 'XOF', currencySymbol: 'Fr', provinces: [] },
  NGA: { code: 'NGA', name: 'Nigeria', phoneCode: '+234', currencyCode: 'NGN', currencySymbol: '₦', provinces: [] },
  MKD: { code: 'MKD', name: 'North Macedonia', phoneCode: '+389', currencyCode: 'MKD', currencySymbol: 'ден', provinces: [] },
  NOR: { code: 'NOR', name: 'Norway', phoneCode: '+47', currencyCode: 'NOK', currencySymbol: 'kr', provinces: [] },
  OMN: { code: 'OMN', name: 'Oman', phoneCode: '+968', currencyCode: 'OMR', currencySymbol: 'ر.ع.', provinces: ["Ad Dākhilīyah", "Al Buraymī", "Al Bāţinah", "Al Wusţá", "Ash Sharqīyah", "Az̧ Z̧āhirah", "Masqaţ", "Musandam", "Z̧ufār"] },
  PLW: { code: 'PLW', name: 'Palau', phoneCode: '+680', currencyCode: 'USD', currencySymbol: '$', provinces: [] },
  PSE: { code: 'PSE', name: 'Palestine', phoneCode: '+970', currencyCode: 'ILS', currencySymbol: '₪', provinces: [] },
  PAN: { code: 'PAN', name: 'Panama', phoneCode: '+507', currencyCode: 'PAB', currencySymbol: 'B/.', provinces: [] },
  PNG: { code: 'PNG', name: 'Papua New Guinea', phoneCode: '+675', currencyCode: 'PGK', currencySymbol: 'K', provinces: [] },
  PRY: { code: 'PRY', name: 'Paraguay', phoneCode: '+595', currencyCode: 'PYG', currencySymbol: '₲', provinces: [] },
  PER: { code: 'PER', name: 'Peru', phoneCode: '+51', currencyCode: 'PEN', currencySymbol: 'S/', provinces: [] },
  PHL: { code: 'PHL', name: 'Philippines', phoneCode: '+63', currencyCode: 'PHP', currencySymbol: '₱', provinces: [] },
  POL: { code: 'POL', name: 'Poland', phoneCode: '+48', currencyCode: 'PLN', currencySymbol: 'zł', provinces: [] },
  PRT: { code: 'PRT', name: 'Portugal', phoneCode: '+351', currencyCode: 'EUR', currencySymbol: '€', provinces: [] },
  ROU: { code: 'ROU', name: 'Romania', phoneCode: '+40', currencyCode: 'RON', currencySymbol: 'lei', provinces: [] },
  RUS: { code: 'RUS', name: 'Russia', phoneCode: '+7', currencyCode: 'RUB', currencySymbol: '₽', provinces: [] },
  RWA: { code: 'RWA', name: 'Rwanda', phoneCode: '+250', currencyCode: 'RWF', currencySymbol: 'Fr', provinces: [] },
  KNA: { code: 'KNA', name: 'Saint Kitts and Nevis', phoneCode: '+1-869', currencyCode: 'XCD', currencySymbol: '$', provinces: [] },
  LCA: { code: 'LCA', name: 'Saint Lucia', phoneCode: '+1-758', currencyCode: 'XCD', currencySymbol: '$', provinces: [] },
  VCT: { code: 'VCT', name: 'Saint Vincent and the Grenadines', phoneCode: '+1-784', currencyCode: 'XCD', currencySymbol: '$', provinces: [] },
  WSM: { code: 'WSM', name: 'Samoa', phoneCode: '+685', currencyCode: 'WST', currencySymbol: 'T', provinces: [] },
  SMR: { code: 'SMR', name: 'San Marino', phoneCode: '+378', currencyCode: 'EUR', currencySymbol: '€', provinces: [] },
  STP: { code: 'STP', name: 'Sao Tome and Principe', phoneCode: '+239', currencyCode: 'STN', currencySymbol: 'Db', provinces: [] },
  SEN: { code: 'SEN', name: 'Senegal', phoneCode: '+221', currencyCode: 'XOF', currencySymbol: 'Fr', provinces: [] },
  SRB: { code: 'SRB', name: 'Serbia', phoneCode: '+381', currencyCode: 'RSD', currencySymbol: 'дин', provinces: [] },
  SYC: { code: 'SYC', name: 'Seychelles', phoneCode: '+248', currencyCode: 'SCR', currencySymbol: '₨', provinces: [] },
  SLE: { code: 'SLE', name: 'Sierra Leone', phoneCode: '+232', currencyCode: 'SLL', currencySymbol: 'Le', provinces: [] },
  SGP: { code: 'SGP', name: 'Singapore', phoneCode: '+65', currencyCode: 'SGD', currencySymbol: '$', provinces: [] },
  SVK: { code: 'SVK', name: 'Slovakia', phoneCode: '+421', currencyCode: 'EUR', currencySymbol: '€', provinces: [] },
  SVN: { code: 'SVN', name: 'Slovenia', phoneCode: '+386', currencyCode: 'EUR', currencySymbol: '€', provinces: [] },
  SLB: { code: 'SLB', name: 'Solomon Islands', phoneCode: '+677', currencyCode: 'SBD', currencySymbol: '$', provinces: [] },
  SOM: { code: 'SOM', name: 'Somalia', phoneCode: '+252', currencyCode: 'SOS', currencySymbol: 'Sh', provinces: [] },
  ZAF: { code: 'ZAF', name: 'South Africa', phoneCode: '+27', currencyCode: 'ZAR', currencySymbol: 'R', provinces: [] },
  SSD: { code: 'SSD', name: 'South Sudan', phoneCode: '+211', currencyCode: 'SSP', currencySymbol: '£', provinces: [] },
  ESP: { code: 'ESP', name: 'Spain', phoneCode: '+34', currencyCode: 'EUR', currencySymbol: '€', provinces: [] },
  LKA: { code: 'LKA', name: 'Sri Lanka', phoneCode: '+94', currencyCode: 'LKR', currencySymbol: 'Rs', provinces: [] },
  SDN: { code: 'SDN', name: 'Sudan', phoneCode: '+249', currencyCode: 'SDG', currencySymbol: '£', provinces: [] },
  SUR: { code: 'SUR', name: 'Suriname', phoneCode: '+597', currencyCode: 'SRD', currencySymbol: '$', provinces: [] },
  SWE: { code: 'SWE', name: 'Sweden', phoneCode: '+46', currencyCode: 'SEK', currencySymbol: 'kr', provinces: [] },
  CHE: { code: 'CHE', name: 'Switzerland', phoneCode: '+41', currencyCode: 'CHF', currencySymbol: 'Fr', provinces: [] },
  SYR: { code: 'SYR', name: 'Syria', phoneCode: '+963', currencyCode: 'SYP', currencySymbol: '£', provinces: [] },
  TWN: { code: 'TWN', name: 'Taiwan', phoneCode: '+886', currencyCode: 'TWD', currencySymbol: 'NT$', provinces: [] },
  TJK: { code: 'TJK', name: 'Tajikistan', phoneCode: '+992', currencyCode: 'TJS', currencySymbol: 'ЅМ', provinces: [] },
  TZA: { code: 'TZA', name: 'Tanzania', phoneCode: '+255', currencyCode: 'TZS', currencySymbol: 'Sh', provinces: [] },
  THA: { code: 'THA', name: 'Thailand', phoneCode: '+66', currencyCode: 'THB', currencySymbol: '฿', provinces: [] },
  TLS: { code: 'TLS', name: 'Timor-Leste', phoneCode: '+670', currencyCode: 'USD', currencySymbol: '$', provinces: [] },
  TGO: { code: 'TGO', name: 'Togo', phoneCode: '+228', currencyCode: 'XOF', currencySymbol: 'Fr', provinces: [] },
  TON: { code: 'TON', name: 'Tonga', phoneCode: '+676', currencyCode: 'TOP', currencySymbol: 'T$', provinces: [] },
  TTO: { code: 'TTO', name: 'Trinidad and Tobago', phoneCode: '+1-868', currencyCode: 'TTD', currencySymbol: '$', provinces: [] },
  TUN: { code: 'TUN', name: 'Tunisia', phoneCode: '+216', currencyCode: 'TND', currencySymbol: 'د.ت', provinces: [] },
  TUR: { code: 'TUR', name: 'Turkey', phoneCode: '+90', currencyCode: 'TRY', currencySymbol: '₺', provinces: [] },
  TKM: { code: 'TKM', name: 'Turkmenistan', phoneCode: '+993', currencyCode: 'TMT', currencySymbol: 'm', provinces: [] },
  TUV: { code: 'TUV', name: 'Tuvalu', phoneCode: '+688', currencyCode: 'AUD', currencySymbol: '$', provinces: [] },
  UGA: { code: 'UGA', name: 'Uganda', phoneCode: '+256', currencyCode: 'UGX', currencySymbol: 'Sh', provinces: [] },
  UKR: { code: 'UKR', name: 'Ukraine', phoneCode: '+380', currencyCode: 'UAH', currencySymbol: '₴', provinces: [] },
  ARE: { code: 'ARE', name: 'United Arab Emirates', phoneCode: '+971', currencyCode: 'AED', currencySymbol: 'Dhs.', provinces: [] },
  GBR: { code: 'GBR', name: 'United Kingdom', phoneCode: '+44', currencyCode: 'GBP', currencySymbol: '£', provinces: [] },
  USA: { code: 'USA', name: 'United States', phoneCode: '+1', currencyCode: 'USD', currencySymbol: '$', provinces: [] },
  URY: { code: 'URY', name: 'Uruguay', phoneCode: '+598', currencyCode: 'UYU', currencySymbol: '$', provinces: [] },
  UZB: { code: 'UZB', name: 'Uzbekistan', phoneCode: '+998', currencyCode: 'UZS', currencySymbol: "so'm", provinces: [] },
  VUT: { code: 'VUT', name: 'Vanuatu', phoneCode: '+678', currencyCode: 'VUV', currencySymbol: 'Vt', provinces: [] },
  VAT: { code: 'VAT', name: 'Vatican City', phoneCode: '+379', currencyCode: 'EUR', currencySymbol: '€', provinces: [] },
  VEN: { code: 'VEN', name: 'Venezuela', phoneCode: '+58', currencyCode: 'VES', currencySymbol: 'Bs.', provinces: [] },
  VNM: { code: 'VNM', name: 'Vietnam', phoneCode: '+84', currencyCode: 'VND', currencySymbol: '₫', provinces: [] },
  YEM: { code: 'YEM', name: 'Yemen', phoneCode: '+967', currencyCode: 'YER', currencySymbol: '﷼', provinces: [] },
  ZMB: { code: 'ZMB', name: 'Zambia', phoneCode: '+260', currencyCode: 'ZMW', currencySymbol: 'ZK', provinces: [] },
  ZWE: { code: 'ZWE', name: 'Zimbabwe', phoneCode: '+263', currencyCode: 'ZWL', currencySymbol: '$', provinces: [] }
};

// Country list for dropdowns (sorted alphabetically by name)
export const COUNTRY_OPTIONS = Object.values(COUNTRIES)
  .map(country => ({ value: country.code, label: country.name }))
  .sort((a, b) => a.label.localeCompare(b.label));

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
  // For countries with known validation rules, we enforce specific digit counts
  const validationRules = {
    'PAK': { minDigits: 10, maxDigits: 10 }, // +92 3XX XXXXXXX = 10 digits
    'UAE': { minDigits: 9, maxDigits: 9 },   // +971 5X XXX XXXX = 9 digits
    'QATAR': { minDigits: 8, maxDigits: 8 }, // +974 XXXX XXXX = 8 digits
    'KUWAIT': { minDigits: 8, maxDigits: 8 }, // +965 XXXX XXXX = 8 digits
    'KSA': { minDigits: 9, maxDigits: 9 }    // +966 5X XXX XXXX = 9 digits
  };

  // For all other countries, use generic validation (8-15 digits is standard international range)
  const rules = validationRules[countryCode] || { minDigits: 7, maxDigits: 15 };

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
