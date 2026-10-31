/**
 * Countries where Fabulka must not be offered, by ISO 3166 code: the Restricted Territories of
 * Meta's Model Designation and Geographic Use Policy (updated 2026-10-12,
 * https://dev.meta.ai/legal/geographic-use-policy), plus India, where Muse Image is not
 * available and a book cannot be illustrated.
 *
 * The policy also lists the Crimea, Donetsk and Luhansk regions of Ukraine; a country database
 * cannot tell them apart from the rest of Ukraine, so they are not blocked by IP.
 *
 * This list stays in code: the admin shows it read-only and can only block more countries on top
 * of it (geo.extra_blocked, see ReferenceService), never take one off.
 */
export const RESTRICTED_COUNTRIES: Record<string, string> = {
  AF: 'Afghanistan',
  BY: 'Belarus',
  KH: 'Cambodia',
  CN: 'China',
  HK: 'Hong Kong',
  MO: 'Macau',
  CU: 'Cuba',
  ER: 'Eritrea',
  ET: 'Ethiopia',
  HT: 'Haiti',
  IR: 'Iran',
  IQ: 'Iraq',
  LY: 'Libya',
  MM: 'Myanmar',
  NI: 'Nicaragua',
  KP: 'North Korea',
  PK: 'Pakistan',
  RU: 'Russia',
  SO: 'Somalia',
  SY: 'Syria',
  VE: 'Venezuela',
  EH: 'Western Sahara',
  IN: 'India',
};

/** Meta's Model Designation and Geographic Use Policy, which the list above follows. */
export const GEO_POLICY_URL = 'https://dev.meta.ai/legal/geographic-use-policy';
