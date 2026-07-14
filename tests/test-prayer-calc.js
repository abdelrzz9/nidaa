#!/usr/bin/env gjs
/*
 * Test prayer time calculation against PrayTimes.org v3.2 reference output.
 *
 * Reference: praytime.js v3.2 (https://praytimes.org)
 *   npm package praytime@3.2.0, exact output from getTimes().
 *
 * Tolerance: ±2 minutes for most, ±3 for Isha (can vary by implementation).
 *
 * Usage:  gjs tests/test-prayer-calc.js
 */

const LOG_PREFIX = '[Nidaa:Test:Prayer]';

// ==================== Inlined implementation (pure JS, no GI deps) ====================
const DEG = Math.PI / 180;

function julianDay(year, month, day) {
  let y = year, m = month;
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716))
    + Math.floor(30.6001 * (m + 1))
    + day + B - 1524.5;
}

function sunPosition(jd) {
  const d = jd - 2451545.0;
  const g = (357.529 + 0.98560028 * d) % 360;
  const q = (280.459 + 0.98564736 * d) % 360;
  const L = (q + 1.915 * Math.sin(g * DEG) + 0.020 * Math.sin(2 * g * DEG)) % 360;
  const e = 23.439 - 0.00000036 * d;
  const cosE = Math.cos(e * DEG);
  const sinL = Math.sin(L * DEG);
  const cosL = Math.cos(L * DEG);
  const RAdeg = Math.atan2(cosE * sinL, cosL) * (180 / Math.PI);
  const RA = RAdeg / 15;
  const declination = Math.asin(Math.sin(e * DEG) * sinL) * (180 / Math.PI);
  let EqT = q / 15 - RA;
  if (EqT > 0.5) EqT -= 24;
  if (EqT < -0.5) EqT += 24;
  return { declination, equationOfTime: EqT };
}

function hourAngle(angle, lat, dec) {
  const arg = (Math.sin(angle * DEG) - Math.sin(lat * DEG) * Math.sin(dec * DEG))
    / (Math.cos(lat * DEG) * Math.cos(dec * DEG));
  if (arg > 1 || arg < -1) return null;
  return Math.acos(arg) * (180 / Math.PI);
}

function asrAltitude(factor, lat, dec) {
  const D = Math.abs(lat - dec);
  const arg = factor + Math.tan(D * DEG);
  return Math.atan2(1, arg) * (180 / Math.PI);
}

function normalizeHours(h) {
  h = h % 24;
  if (h < 0) h += 24;
  return h;
}

function hoursToDate(hours, year, month, day, tzOffset) {
  const utcHours = hours - tzOffset;
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) + utcHours * 3600000);
}

function formatDate(d) {
  if (!d) return '-----';
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function applyHighLatitudeRule(rule, sunset, sunrise, angle, isFajr) {
  if (rule === 'None') return null;
  let nightLength;
  if (sunrise > sunset) {
    nightLength = sunrise - sunset;
  } else {
    nightLength = (sunrise + 24) - sunset;
  }
  if (nightLength <= 0) nightLength = 6;
  switch (rule) {
    case 'AngleBased': {
      const portion = angle / 60;
      if (isFajr) return (sunset + nightLength * (1 - portion)) % 24;
      else return (sunset + nightLength * portion) % 24;
    }
    case 'MiddleOfNight':
      return (sunset + nightLength / 2) % 24;
    case 'OneSeventh':
      if (isFajr) return (sunset + nightLength * (6 / 7)) % 24;
      else return (sunset + nightLength * (1 / 7)) % 24;
    default:
      return null;
  }
}

function getMethodParams(method, customFajr, customIsha) {
  const methods = {
    MWL: { fajrAngle: 18, ishaAngle: 17, ishaMinutes: null, maghribAngle: null },
    UmmAlQura: { fajrAngle: 18.5, ishaAngle: null, ishaMinutes: 90, maghribAngle: null },
    Egypt: { fajrAngle: 19.5, ishaAngle: 17.5, ishaMinutes: null, maghribAngle: null },
    ISNA: { fajrAngle: 15, ishaAngle: 15, ishaMinutes: null, maghribAngle: null },
    Karachi: { fajrAngle: 18, ishaAngle: 18, ishaMinutes: null, maghribAngle: null },
    Tehran: { fajrAngle: 17.7, ishaAngle: 14, ishaMinutes: null, maghribAngle: 4.5 },
    Jafari: { fajrAngle: 16, ishaAngle: 14, ishaMinutes: null, maghribAngle: 4 },
    Moonsighting: { fajrAngle: 18, ishaAngle: 17, ishaMinutes: null, maghribAngle: null },
    Custom: { fajrAngle: customFajr, ishaAngle: customIsha, ishaMinutes: null, maghribAngle: null },
  };
  return methods[method] || methods.MWL;
}

const DEFAULT_ISHA_ANGLE = 14;

function calculateTimes(opts) {
  const { latitude: lat, longitude: lng, timezone: tz, method, madhab, highLatitudeRule } = opts;
  const dt = opts.date instanceof Date ? opts.date : new Date(opts.date);
  const year = dt.getFullYear();
  const month = dt.getMonth() + 1;
  const day = dt.getDate();

  const jd = julianDay(year, month, day);
  const { declination: dec, equationOfTime: eqT } = sunPosition(jd);
  const mp = getMethodParams(method, opts.customFajrAngle, opts.customIshaAngle);

  let dhuhr = normalizeHours(12 + tz - lng / 15 - eqT + 1 / 60);

  const haSunrise = hourAngle(-0.833, lat, dec);
  let sunrise = null, sunset = null;
  if (haSunrise !== null) {
    const so = haSunrise / 15;
    sunrise = normalizeHours(dhuhr - so);
    sunset = normalizeHours(dhuhr + so);
  }

  // Fajr
  let fajr = null;
  if (mp.fajrAngle != null) {
    const ha = hourAngle(-mp.fajrAngle, lat, dec);
    if (ha !== null) {
      fajr = normalizeHours(dhuhr - ha / 15);
    } else if (highLatitudeRule && sunrise != null && sunset != null) {
      fajr = applyHighLatitudeRule(highLatitudeRule, sunset, sunrise, mp.fajrAngle, true);
    }
  }

  // Isha
  let isha = null;
  if (mp.ishaMinutes != null && sunset != null) {
    isha = normalizeHours(sunset + mp.ishaMinutes / 60);
  } else {
    const ishaAngle = mp.ishaAngle != null ? mp.ishaAngle : DEFAULT_ISHA_ANGLE;
    const ha = hourAngle(-ishaAngle, lat, dec);
    if (ha !== null) {
      isha = normalizeHours(dhuhr + ha / 15);
    } else if (highLatitudeRule && sunrise != null && sunset != null) {
      isha = applyHighLatitudeRule(highLatitudeRule, sunset, sunrise, ishaAngle, false);
    }
  }

  // Maghrib
  let maghrib = null;
  if (mp.maghribAngle != null) {
    const ha = hourAngle(-mp.maghribAngle, lat, dec);
    if (ha !== null) maghrib = normalizeHours(dhuhr + ha / 15);
  } else if (sunset !== null) {
    maghrib = normalizeHours(sunset + 1 / 60);
  }

  // Asr
  const asrFactor = madhab === 'Hanafi' ? 2 : 1;
  const asrAlt = asrAltitude(asrFactor, lat, dec);
  const haAsr = hourAngle(asrAlt, lat, dec);
  let asr = null;
  if (haAsr !== null) asr = normalizeHours(dhuhr + haAsr / 15);

  const toDate = (h) => h === null ? null : hoursToDate(h, year, month, day, tz);
  return { fajr: toDate(fajr), sunrise: toDate(sunrise), dhuhr: toDate(dhuhr),
    asr: toDate(asr), maghrib: toDate(maghrib), isha: toDate(isha) };
}

// ==================== Test runner ====================
const TOLERANCE = 2;
const ISHA_TOLERANCE = 3;

function diffMinutes(actual, expected) {
  if (!actual || !expected) return Infinity;
  return Math.abs(actual.getTime() - expected.getTime()) / 60000;
}

function makeTime(year, month, day, hhmm, tz) {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, h, m, 0) - tz * 3600000);
}

function testCase(name, opts, expected, tolerances) {
  print(`${LOG_PREFIX} --- ${name} ---`);
  const actual = calculateTimes(opts);
  let allPass = true;

  const dt = opts.date instanceof Date ? opts.date : new Date(opts.date);
  const y = dt.getFullYear(), mo = dt.getMonth() + 1, d = dt.getDate();

  for (const p of ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']) {
    const expStr = expected[p];
    const tol = (tolerances && tolerances[p]) || (p === 'isha' ? ISHA_TOLERANCE : 2);
    const expectedDate = makeTime(y, mo, d, expStr, opts.timezone);
    const diff = diffMinutes(actual[p], expectedDate);
    const status = diff <= tol ? 'PASS' : 'FAIL';
    if (status === 'FAIL') allPass = false;
    const actualStr = actual[p] ? formatDate(actual[p]) : '-----';
    print(`  ${p.padEnd(8)} expected ${expStr}, got ${actualStr} (Δ ${diff >= 99 ? diff.toFixed(0) : diff.toFixed(1)} min) [${status}]`);
  }

  print(`${LOG_PREFIX} ${name}: ${allPass ? 'PASS' : 'FAIL'}`);
  return allPass;
}

// ==================== Test cases ====================
// All expected values from praytime.js v3.2 run with exact same parameters.
const results = [];

// 1. Algiers 2025-06-21 MWL Shafii (no high-lat needed)
results.push(testCase(
  'Algiers 2025-06-21 MWL Shafii',
  { latitude: 36.7525, longitude: 3.0420, timezone: 1,
    date: new Date(2025, 5, 21), method: 'MWL', madhab: 'Shafii',
    highLatitudeRule: 'None' },
  { fajr: '03:37', sunrise: '05:29', dhuhr: '12:50', asr: '16:41',
    maghrib: '20:11', isha: '21:54' }
));

// 2. Mecca 2025-12-21 UmmAlQura Shafii
results.push(testCase(
  'Mecca 2025-12-21 UmmAlQura Shafii',
  { latitude: 21.4225, longitude: 39.8262, timezone: 3,
    date: new Date(2025, 11, 21), method: 'UmmAlQura', madhab: 'Shafii',
    highLatitudeRule: 'None' },
  { fajr: '05:32', sunrise: '06:54', dhuhr: '12:19', asr: '15:23',
    maghrib: '17:45', isha: '19:15' }
));

// 3. Oslo 2025-06-21 MWL AngleBased
results.push(testCase(
  'Oslo 2025-06-21 MWL AngleBased',
  { latitude: 59.9139, longitude: 10.7522, timezone: 2,
    date: new Date(2025, 5, 21), method: 'MWL', madhab: 'Shafii',
    highLatitudeRule: 'AngleBased' },
  { fajr: '02:21', sunrise: '03:54', dhuhr: '13:19', asr: '18:00',
    maghrib: '22:45', isha: '00:12' }
));

// 4. Algiers ISNA
results.push(testCase(
  'Algiers 2025-06-21 ISNA Shafii',
  { latitude: 36.7525, longitude: 3.0420, timezone: 1,
    date: new Date(2025, 5, 21), method: 'ISNA', madhab: 'Shafii',
    highLatitudeRule: 'None' },
  { fajr: '04:00', sunrise: '05:29', dhuhr: '12:50', asr: '16:41',
    maghrib: '20:11', isha: '21:40' }
));

// 5. Algiers MWL Hanafi
results.push(testCase(
  'Algiers 2025-06-21 MWL Hanafi',
  { latitude: 36.7525, longitude: 3.0420, timezone: 1,
    date: new Date(2025, 5, 21), method: 'MWL', madhab: 'Hanafi',
    highLatitudeRule: 'None' },
  { fajr: '03:37', sunrise: '05:29', dhuhr: '12:50', asr: '17:56',
    maghrib: '20:11', isha: '21:54' }
));

// 6. Oslo 2025-06-21 MWL OneSeventh
results.push(testCase(
  'Oslo 2025-06-21 MWL OneSeventh',
  { latitude: 59.9139, longitude: 10.7522, timezone: 2,
    date: new Date(2025, 5, 21), method: 'MWL', madhab: 'Shafii',
    highLatitudeRule: 'OneSeventh' },
  { fajr: '03:10', sunrise: '03:54', dhuhr: '13:19', asr: '18:00',
    maghrib: '22:45', isha: '23:28' }
));

// 7. Algiers Tehran
results.push(testCase(
  'Algiers 2025-06-21 Tehran',
  { latitude: 36.7525, longitude: 3.0420, timezone: 1,
    date: new Date(2025, 5, 21), method: 'Tehran', madhab: 'Shafii',
    highLatitudeRule: 'None' },
  { fajr: '03:40', sunrise: '05:29', dhuhr: '12:50', asr: '16:41',
    maghrib: '20:32', isha: '21:33' }
));

// 8. Algiers Egypt
results.push(testCase(
  'Algiers 2025-06-21 Egypt (Shafii)',
  { latitude: 36.7525, longitude: 3.0420, timezone: 1,
    date: new Date(2025, 5, 21), method: 'Egypt', madhab: 'Shafii',
    highLatitudeRule: 'None' },
  { fajr: '03:25', sunrise: '05:29', dhuhr: '12:50', asr: '16:41',
    maghrib: '20:11', isha: '21:58' }
));

// 9. Algiers Jafari (adjusted params: fajr=16, maghrib=4, isha=14, midnight=Jafari)
results.push(testCase(
  'Algiers 2025-06-21 Jafari',
  { latitude: 36.7525, longitude: 3.0420, timezone: 1,
    date: new Date(2025, 5, 21), method: 'Jafari', madhab: 'Shafii',
    highLatitudeRule: 'None' },
  { fajr: '03:52', sunrise: '05:29', dhuhr: '12:50', asr: '16:41',
    maghrib: '20:29', isha: '21:33' }
));

// 10. Algiers Karachi
results.push(testCase(
  'Algiers 2025-06-21 Karachi',
  { latitude: 36.7525, longitude: 3.0420, timezone: 1,
    date: new Date(2025, 5, 21), method: 'Karachi', madhab: 'Shafii',
    highLatitudeRule: 'None' },
  { fajr: '03:37', sunrise: '05:29', dhuhr: '12:50', asr: '16:41',
    maghrib: '20:11', isha: '22:02' }
));

// 11. Algiers MWL None (no precaution adjustments beyond 1 min maghrib)
results.push(testCase(
  'Algiers 2025-06-21 MWL None high-lat (should still work)',
  { latitude: 36.7525, longitude: 3.0420, timezone: 1,
    date: new Date(2025, 5, 21), method: 'MWL', madhab: 'Shafii',
    highLatitudeRule: 'None' },
  { fajr: '03:37', sunrise: '05:29', dhuhr: '12:50', asr: '16:41',
    maghrib: '20:11', isha: '21:54' }
));

// ==================== Results ====================
const passed = results.filter(Boolean).length;
const total = results.length;
print(`${LOG_PREFIX} ========================================`);
print(`${LOG_PREFIX} ${passed}/${total} test cases passed`);
print(`${LOG_PREFIX} ========================================`);

imports.system.exit(passed < total ? 1 : 0);
