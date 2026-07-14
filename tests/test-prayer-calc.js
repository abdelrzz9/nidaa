#!/usr/bin/env gjs --module
/*
 * Integration tests for src/core/prayer/ — imports the real module.
 *
 * Reference values come from praytime.js v3.2 (https://praytimes.org)
 * and cross-checked against Adhan.js (https://github.com/batoulapps/adhan-js)
 * where possible.  Tolerance: ±2 min for most prayers, ±3 min for Isha
 * (which varies most between implementations due to different twilight models).
 *
 * Usage:  gjs --module tests/test-prayer-calc.js
 */

import { calculatePrayerTimes } from '../nidaa@abdelrzz9/src/core/prayer/times.js';

const LOG_PREFIX = '[Nidaa:Test:Prayer]';

// ==================== Helpers ====================

/**
 * Format a Date as "HH:MM" in the prayer-local timezone.
 *
 * The Date objects returned by calculatePrayerTimes are absolute timestamps
 * (UTC instants).  getHours()/getMinutes() would show the *machine's* local
 * timezone, which is wrong when the machine is in a different zone than the
 * prayer location.  We re-derive the local time from the UTC timestamp and
 * the timezone offset we passed to the calculator.
 */
function formatLocal(date, tzOffset) {
  if (!date) return '-----';
  // UTC milliseconds + tz offset → local minutes
  const utcMs = date.getTime();
  const localMs = utcMs + tzOffset * 3600000;
  const d = new Date(localMs);
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function diffMinutes(a, b) {
  if (!a || !b) return Infinity;
  return Math.abs(a.getTime() - b.getTime()) / 60000;
}

/** Build an expected Date from "HH:MM" string, date components, and tz offset. */
function makeExpected(year, month, day, hhmm, tz) {
  const [h, m] = hhmm.split(':').map(Number);
  // The calculator returns Date objects whose UTC value equals:
  //   Date.UTC(year, month-1, day, 0,0,0) + (localHours - tz) * 3600000
  // So for expected local time HH:MM, the UTC value is:
  //   Date.UTC(...) + (HH:MM - tz) * 3600000
  return new Date(Date.UTC(year, month - 1, day, h, m, 0) - tz * 3600000);
}

// ==================== Test runner ====================

const TOLERANCE = 2;       // minutes, for most prayers
const ISHA_TOLERANCE = 3;  // Isha can vary more between implementations

let passed = 0;
let failed = 0;

function testCase(name, opts, expected) {
  print(`${LOG_PREFIX} --- ${name} ---`);
  const actual = calculatePrayerTimes(opts);

  const dt = opts.date instanceof Date ? opts.date : new Date(opts.date);
  const y = dt.getFullYear();
  const mo = dt.getMonth() + 1;
  const d = dt.getDate();
  const tz = opts.timezone;

  let allPass = true;

  for (const prayer of ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']) {
    const expStr = expected[prayer];
    const tol = prayer === 'isha' ? ISHA_TOLERANCE : TOLERANCE;
    const expectedDate = makeExpected(y, mo, d, expStr, tz);
    const diff = diffMinutes(actual[prayer], expectedDate);
    const status = diff <= tol ? 'PASS' : 'FAIL';
    if (status === 'FAIL') allPass = false;

    const gotStr = formatLocal(actual[prayer], tz);
    print(`  ${prayer.padEnd(8)} expected ${expStr}, got ${gotStr} (Δ ${diff.toFixed(1)} min) [${status}]`);
  }

  if (allPass) {
    print(`${LOG_PREFIX} ${name}: PASS\n`);
    passed++;
  } else {
    print(`${LOG_PREFIX} ${name}: FAIL\n`);
    failed++;
  }
}

// ==================== Test cases ====================
//
// Reference sources for expected values:
//   [1] praytime.js v3.2 — https://praytimes.org
//       Expected values produced by running the praytime.js v3.2 library
//       with identical parameters (lat, lng, date, method, madhab).
//   [2] Adhan.js — https://github.com/batoulapps/adhan-js
//       Cross-checked where praytime.js output was ambiguous.
//
// All lat/lng are decimal degrees.  tz is UTC offset in hours.

// --- 1. Algiers 2025-06-21 MWL Shafii ---
// Reference [1]: praytime.js v3.2 output for Algiers, MWL, Shafii.
testCase(
  'Algiers 2025-06-21 MWL Shafii',
  { latitude: 36.7525, longitude: 3.0420, timezone: 1,
    date: new Date(2025, 5, 21), method: 'MWL', madhab: 'Shafii',
    highLatitudeRule: 'None' },
  { fajr: '03:37', sunrise: '05:29', dhuhr: '12:50', asr: '16:41',
    maghrib: '20:11', isha: '21:54' }
);

// --- 2. Mecca 2025-12-21 UmmAlQura Shafii ---
// Reference [1]: praytime.js v3.2 for Mecca, UmmAlQura.
testCase(
  'Mecca 2025-12-21 UmmAlQura Shafii',
  { latitude: 21.4225, longitude: 39.8262, timezone: 3,
    date: new Date(2025, 11, 21), method: 'UmmAlQura', madhab: 'Shafii',
    highLatitudeRule: 'None' },
  { fajr: '05:32', sunrise: '06:54', dhuhr: '12:19', asr: '15:23',
    maghrib: '17:45', isha: '19:15' }
);

// --- 3. Oslo 2025-06-21 MWL AngleBased (high latitude) ---
// Reference [1]: praytime.js v3.2 for Oslo, MWL, AngleBased high-lat rule.
// Oslo at ~60°N in summer: standard Fajr/Isha angles are unreachable,
// so AngleBased rule is critical.
testCase(
  'Oslo 2025-06-21 MWL AngleBased',
  { latitude: 59.9139, longitude: 10.7522, timezone: 2,
    date: new Date(2025, 5, 21), method: 'MWL', madhab: 'Shafii',
    highLatitudeRule: 'AngleBased' },
  { fajr: '02:21', sunrise: '03:54', dhuhr: '13:19', asr: '18:00',
    maghrib: '22:45', isha: '00:12' }
);

// --- 4. Algiers ISNA Shafii ---
// Reference [1]: praytime.js v3.2 for Algiers, ISNA (15°/15°).
testCase(
  'Algiers 2025-06-21 ISNA Shafii',
  { latitude: 36.7525, longitude: 3.0420, timezone: 1,
    date: new Date(2025, 5, 21), method: 'ISNA', madhab: 'Shafii',
    highLatitudeRule: 'None' },
  { fajr: '04:00', sunrise: '05:29', dhuhr: '12:50', asr: '16:41',
    maghrib: '20:11', isha: '21:40' }
);

// --- 5. Algiers MWL Hanafi (Asr factor 2) ---
// Reference [1]: praytime.js v3.2 for Algiers, MWL, Hanafi.
testCase(
  'Algiers 2025-06-21 MWL Hanafi',
  { latitude: 36.7525, longitude: 3.0420, timezone: 1,
    date: new Date(2025, 5, 21), method: 'MWL', madhab: 'Hanafi',
    highLatitudeRule: 'None' },
  { fajr: '03:37', sunrise: '05:29', dhuhr: '12:50', asr: '17:56',
    maghrib: '20:11', isha: '21:54' }
);

// --- 6. Oslo MWL OneSeventh (second high-lat rule) ---
// Reference [1]: praytime.js v3.2 for Oslo, OneSeventh rule.
testCase(
  'Oslo 2025-06-21 MWL OneSeventh',
  { latitude: 59.9139, longitude: 10.7522, timezone: 2,
    date: new Date(2025, 5, 21), method: 'MWL', madhab: 'Shafii',
    highLatitudeRule: 'OneSeventh' },
  { fajr: '03:10', sunrise: '03:54', dhuhr: '13:19', asr: '18:00',
    maghrib: '22:45', isha: '23:28' }
);

// --- 7. Algiers Tehran (maghribAngle=4.5°, Jafari midnight) ---
// Reference [1]: praytime.js v3.2 for Algiers, Tehran method.
testCase(
  'Algiers 2025-06-21 Tehran',
  { latitude: 36.7525, longitude: 3.0420, timezone: 1,
    date: new Date(2025, 5, 21), method: 'Tehran', madhab: 'Shafii',
    highLatitudeRule: 'None' },
  { fajr: '03:40', sunrise: '05:29', dhuhr: '12:50', asr: '16:41',
    maghrib: '20:32', isha: '21:33' }
);

// --- 8. Algiers Egypt (19.5°/17.5°) ---
// Reference [1]: praytime.js v3.2 for Algiers, Egypt method.
testCase(
  'Algiers 2025-06-21 Egypt',
  { latitude: 36.7525, longitude: 3.0420, timezone: 1,
    date: new Date(2025, 5, 21), method: 'Egypt', madhab: 'Shafii',
    highLatitudeRule: 'None' },
  { fajr: '03:25', sunrise: '05:29', dhuhr: '12:50', asr: '16:41',
    maghrib: '20:11', isha: '21:58' }
);

// --- 9. Algiers Karachi (18°/18°) ---
// Reference [1]: praytime.js v3.2 for Algiers, Karachi method.
testCase(
  'Algiers 2025-06-21 Karachi',
  { latitude: 36.7525, longitude: 3.0420, timezone: 1,
    date: new Date(2025, 5, 21), method: 'Karachi', madhab: 'Shafii',
    highLatitudeRule: 'None' },
  { fajr: '03:37', sunrise: '05:29', dhuhr: '12:50', asr: '16:41',
    maghrib: '20:11', isha: '22:02' }
);

// --- 10. Algiers Jafari (fajr=16°, maghrib=4°, isha=14°) ---
// Reference [1]: praytime.js v3.2 for Algiers, Jafari method.
testCase(
  'Algiers 2025-06-21 Jafari',
  { latitude: 36.7525, longitude: 3.0420, timezone: 1,
    date: new Date(2025, 5, 21), method: 'Jafari', madhab: 'Shafii',
    highLatitudeRule: 'None' },
  { fajr: '03:52', sunrise: '05:29', dhuhr: '12:50', asr: '16:41',
    maghrib: '20:29', isha: '21:33' }
);

// --- 11. Winter solstice: Algiers 2025-12-21 MWL ---
// Reference: Cross-verified against Adhan.js v4 (±1 min on Maghrib due to
// the +1 min Sunni precaution that Adhan omits by default).
// Verifies correct behaviour in winter (shorter days, earlier Isha).
testCase(
  'Algiers 2025-12-21 MWL Shafii (winter)',
  { latitude: 36.7525, longitude: 3.0420, timezone: 1,
    date: new Date(2025, 11, 21), method: 'MWL', madhab: 'Shafii',
    highLatitudeRule: 'None' },
  { fajr: '06:24', sunrise: '07:57', dhuhr: '12:47', asr: '15:18',
    maghrib: '17:36', isha: '19:03' }
);

// --- 12. Equator: Jakarta 2025-03-20 MWL ---
// Reference: Cross-verified against Adhan.js v4 (±2 min on Maghrib due to
// combined sunset difference and the +1 min Sunni precaution).
// Verifies behaviour near the equator (consistent day/night year-round).
testCase(
  'Jakarta 2025-03-20 MWL Shafii',
  { latitude: -6.2088, longitude: 106.8456, timezone: 7,
    date: new Date(2025, 2, 20), method: 'MWL', madhab: 'Shafii',
    highLatitudeRule: 'None' },
  { fajr: '04:49', sunrise: '05:58', dhuhr: '12:01', asr: '15:12',
    maghrib: '18:06', isha: '19:10' }
);

// --- 13. Southern hemisphere: Sydney 2025-01-15 MWL ---
// Reference: Cross-verified against Adhan.js v4 (±2 min on Maghrib due to
// combined sunset difference and the +1 min Sunni precaution).
// Verifies correct declination handling when the sun is south of equator.
testCase(
  'Sydney 2025-01-15 MWL Shafii',
  { latitude: -33.8688, longitude: 151.2093, timezone: 11,
    date: new Date(2025, 0, 15), method: 'MWL', madhab: 'Shafii',
    highLatitudeRule: 'None' },
  { fajr: '04:21', sunrise: '06:01', dhuhr: '13:05', asr: '16:50',
    maghrib: '20:11', isha: '21:44' }
);

// ==================== Summary ====================
const total = passed + failed;
print(`${LOG_PREFIX} ========================================`);
print(`${LOG_PREFIX} ${passed}/${total} test cases passed`);
if (failed > 0) {
  print(`${LOG_PREFIX} ${failed} test(s) FAILED`);
}
print(`${LOG_PREFIX} ========================================`);

imports.system.exit(failed > 0 ? 1 : 0);
