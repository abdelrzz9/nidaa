/*
 * Prayer time calculation methods and their parameters.
 *
 * Each method specifies:
 *   fajrAngle   — twilight angle for Fajr in degrees
 *   ishaAngle   — twilight angle for Isha in degrees, OR
 *   ishaMinutes — fixed minutes after Maghrib for Isha
 *   maghribAngle — (optional) twilight angle for Maghrib (used by Tehran/Jafari)
 *   midnightMethod — 'Standard' (sunset to sunrise) or 'Jafari' (sunset to fajr)
 *
 * Where ishaMinutes is set, ishaAngle is ignored for that method.
 *
 * References:
 *   - PrayTimes.org methods page: https://praytimes.org/docs/methods
 *   - praytime.js v3.2 source
 *   - University of Tehran: http://geophysics.ut.ac.ir
 */

export const METHODS = {
  MWL: {
    id: 'MWL',
    name: 'Muslim World League',
    fajrAngle: 18,
    ishaAngle: 17,
    ishaMinutes: null,
    maghribAngle: null,
    midnightMethod: 'Standard',
  },
  UmmAlQura: {
    id: 'UmmAlQura',
    name: 'Umm Al-Qura University (Makkah)',
    fajrAngle: 18.5,
    ishaAngle: null,
    ishaMinutes: 90,
    maghribAngle: null,
    midnightMethod: 'Standard',
  },
  Egypt: {
    id: 'Egypt',
    name: 'Egyptian General Authority of Survey',
    fajrAngle: 19.5,
    ishaAngle: 17.5,
    ishaMinutes: null,
    maghribAngle: null,
    midnightMethod: 'Standard',
  },
  ISNA: {
    id: 'ISNA',
    name: 'Islamic Society of North America',
    fajrAngle: 15,
    ishaAngle: 15,
    ishaMinutes: null,
    maghribAngle: null,
    midnightMethod: 'Standard',
  },
  Karachi: {
    id: 'Karachi',
    name: 'University of Islamic Sciences, Karachi',
    fajrAngle: 18,
    ishaAngle: 18,
    ishaMinutes: null,
    maghribAngle: null,
    midnightMethod: 'Standard',
  },
  Tehran: {
    id: 'Tehran',
    name: 'Institute of Geophysics, University of Tehran',
    fajrAngle: 17.7,
    ishaAngle: 14,
    ishaMinutes: null,
    maghribAngle: 4.5,
    midnightMethod: 'Jafari',
  },
  Jafari: {
    id: 'Jafari',
    name: 'Leva Research Institute (Qom) / Shia Ithna Ashari',
    fajrAngle: 16,
    ishaAngle: 14,
    ishaMinutes: null,
    maghribAngle: 4,
    midnightMethod: 'Jafari',
  },
  Moonsighting: {
    id: 'Moonsighting',
    name: 'Moonsighting Committee Worldwide (simplified)',
    fajrAngle: 18,
    ishaAngle: 18,
    ishaMinutes: null,
    maghribAngle: null,
    midnightMethod: 'Standard',
  },
  Custom: {
    id: 'Custom',
    name: 'Custom (user-supplied angles)',
    fajrAngle: null,
    ishaAngle: null,
    ishaMinutes: null,
    maghribAngle: null,
    midnightMethod: 'Standard',
  },
};

/**
 * Get the effective method parameters, resolving 'Custom' to user-supplied angles.
 *
 * @param {object} opts
 * @param {string} opts.method - Method ID (e.g., 'MWL', 'ISNA')
 * @param {number} [opts.customFajrAngle] - Required if method is 'Custom'
 * @param {number} [opts.customIshaAngle] - Required if method is 'Custom'
 * @returns {object} Resolved method parameters
 */
export function getMethodParams(opts = {}) {
  const methodId = opts.method || 'MWL';
  let base = METHODS[methodId];
  if (!base) {
    console.warn(`[Nidaa:Prayer] Unknown method "${methodId}", falling back to MWL`);
    base = METHODS.MWL;
  }

  const params = { ...base };

  if (methodId === 'Custom') {
    if (opts.customFajrAngle != null) params.fajrAngle = opts.customFajrAngle;
    if (opts.customIshaAngle != null) params.ishaAngle = opts.customIshaAngle;
  }

  return params;
}
