/*
 * Prayer time calculation engine.
 *
 * Pure offline calculation given only latitude, longitude, date,
 * timezone, and calculation preferences.  Zero GNOME Shell deps.
 *
 * Returns all times as Date objects in the local timezone.
 *
 * Algorithm follows PrayTimes.org v3.2 conventions:
 *   - Dhuhr = 12 + TZ - Lng/15 - EqT  (local clock time)
 *   - Sunrise/Sunset = Dhuhr ± T(0.833°)
 *   - Fajr = Dhuhr - T(angle)
 *   - Isha  = Dhuhr + T(angle)  or  Maghrib + fixed_minutes
 *   - Asr   = Dhuhr + T(cot⁻¹(factor + tan|lat - dec|))
 *   - Maghrib = Sunset + 1 min (Sunni precaution)
 *   - Dhuhr   = Dhuhr + 1 min (precaution)
 *   - Elevation: sunrise/sunset depression adjusted by horizon dip
 *     (acos(R_earth / (R_earth + h))) for elevated observers
 *
 * Usage:
 *   import { calculatePrayerTimes } from './times.js';
 *   const times = calculatePrayerTimes({ ... });
 */

import {
  julianDay,
  sunPosition,
  hourAngle,
  asrAltitude,
  hoursToDate,
  normalizeHours,
  elevationDip,
} from './astronomy.js';

import { getMethodParams } from './methods.js';
import { applyHighLatitudeRule } from './highlatitude.js';

const LOG_PREFIX = '[Nidaa:Prayer]';

/**
 * @typedef {object} PrayerTimes
 * @property {Date} fajr
 * @property {Date} sunrise
 * @property {Date} dhuhr
 * @property {Date} asr
 * @property {Date} maghrib
 * @property {Date} isha
 * @property {string} method
 * @property {string} madhab
 * @property {string} highLatitudeRule
 */

const DEFAULT_ISHA_ANGLE = 14;

/**
 * Calculate all prayer times for a given location and date.
 *
 * @param {object} opts
 * @param {number} opts.latitude          - Decimal degrees (north positive)
 * @param {number} opts.longitude         - Decimal degrees (east positive)
 * @param {number} opts.timezone          - UTC offset in hours (e.g., 1, -5, 5.5)
 * @param {Date|number} opts.date         - Date object or timestamp
 * @param {string} [opts.method='MWL']    - Method ID
 * @param {string} [opts.madhab='Shafii'] - 'Shafii' or 'Hanafi'
 * @param {string} [opts.highLatitudeRule='AngleBased'] - 'None','AngleBased','MiddleOfNight','OneSeventh'
 * @param {number} [opts.elevation=0]     - Elevation in meters (adjusts sunrise/sunset via horizon dip)
 * @param {number} [opts.customFajrAngle] - Required if method='Custom'
 * @param {number} [opts.customIshaAngle] - Required if method='Custom'
 * @returns {PrayerTimes}
 */
export function calculatePrayerTimes(opts) {
  const {
    latitude: lat,
    longitude: lng,
    timezone: tz,
    date: dateInput,
    method = 'MWL',
    madhab = 'Shafii',
    highLatitudeRule = 'AngleBased',
    elevation = 0,
  } = opts;

  const dt = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const year = dt.getFullYear();
  const month = dt.getMonth() + 1;
  const day = dt.getDate();

  const jd = julianDay(year, month, day);
  const { declination: dec, equationOfTime: eqT } = sunPosition(jd);

  const methodParams = getMethodParams(opts);

  // ---- Dhuhr (solar noon + 1 min precaution) ----
  let dhuhr = 12 + tz - lng / 15 - eqT + 1 / 60;
  dhuhr = normalizeHours(dhuhr);

  // ---- Sunrise / Sunset ----
  // Standard geometric depression: 0.833° (solar radius 0.267° + refraction 0.567°).
  // For elevated observers the horizon dips, extending the visible day.
  const dip = elevationDip(elevation);
  const sunriseSunsetDepression = 0.833 + dip;
  const haSunrise = hourAngle(-sunriseSunsetDepression, lat, dec);

  let sunrise = null;
  let sunset = null;

  if (haSunrise !== null) {
    const offset = haSunrise / 15;
    sunrise = normalizeHours(dhuhr - offset);
    sunset = normalizeHours(dhuhr + offset);
  }

  // ---- Fajr ----
  const fajrAngle = methodParams.fajrAngle;
  let fajr = null;

  if (fajrAngle != null) {
    const ha = hourAngle(-fajrAngle, lat, dec);
    if (ha !== null) {
      fajr = normalizeHours(dhuhr - ha / 15);
    } else if (highLatitudeRule !== 'None' && sunrise !== null && sunset !== null) {
      fajr = applyHighLatitudeRule(highLatitudeRule, sunset, sunrise, fajrAngle, true);
    }
  }

  // ---- Isha ----
  const ishaMinutes = methodParams.ishaMinutes;
  let isha = null;

  if (ishaMinutes != null && sunset != null) {
    isha = normalizeHours(sunset + ishaMinutes / 60);
  } else {
    const ishaAngle = methodParams.ishaAngle != null ? methodParams.ishaAngle : DEFAULT_ISHA_ANGLE;
    const ha = hourAngle(-ishaAngle, lat, dec);
    if (ha !== null) {
      isha = normalizeHours(dhuhr + ha / 15);
    } else if (highLatitudeRule !== 'None' && sunrise !== null && sunset !== null) {
      isha = applyHighLatitudeRule(highLatitudeRule, sunset, sunrise, ishaAngle, false);
    }
  }

  // ---- Maghrib (Sunset + 1 min Sunni precaution, except Tehran/Jafari) ----
  const maghribAngle = methodParams.maghribAngle;
  let maghrib = null;

  if (maghribAngle != null) {
    const ha = hourAngle(-maghribAngle, lat, dec);
    if (ha !== null) {
      maghrib = normalizeHours(dhuhr + ha / 15);
    }
  } else if (sunset !== null) {
    maghrib = normalizeHours(sunset + 1 / 60);
  }

  // ---- Asr ----
  const asrFactor = madhab === 'Hanafi' ? 2 : 1;
  const asrAlt = asrAltitude(asrFactor, lat, dec);
  const haAsr = hourAngle(asrAlt, lat, dec);
  let asr = null;
  if (haAsr !== null) {
    asr = normalizeHours(dhuhr + haAsr / 15);
  }

  // ---- Build result ----
  const toDate = (hours) => {
    if (hours === null) return null;
    return hoursToDate(hours, year, month, day, tz);
  };

  const result = {
    fajr: toDate(fajr),
    sunrise: toDate(sunrise),
    dhuhr: toDate(dhuhr),
    asr: toDate(asr),
    maghrib: toDate(maghrib),
    isha: toDate(isha),
    method,
    madhab,
    highLatitudeRule,
  };

  const missing = [];
  if (!result.fajr) missing.push('fajr');
  if (!result.sunrise) missing.push('sunrise');
  if (!result.dhuhr) missing.push('dhuhr');
  if (!result.asr) missing.push('asr');
  if (!result.maghrib) missing.push('maghrib');
  if (!result.isha) missing.push('isha');

  if (missing.length > 0) {
    console.warn(
      `${LOG_PREFIX} incomplete results for ${method} @ ${lat},${lng} ` +
      `on ${year}-${month}-${day}: missing [${missing.join(', ')}]`
    );
  }

  return result;
}
