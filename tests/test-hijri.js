#!/usr/bin/env gjs --module
/*
 * Tests for src/core/hijri/index.js — Hijri date conversion.
 *
 * Validates:
 *   - Gregorian → Hijri conversion against known date pairs
 *   - Hijri → Gregorian conversion (round-trip)
 *   - Month names in all languages
 *   - daysInHijriYear / daysInHijriMonth
 *   - daysUntilHijriMonth and event helpers
 *   - isWhiteDays
 *   - Invalid date handling
 *
 * Reference for expected values: Kuwaiti tabular algorithm (same as
 * Microsoft .NET HijriCalendar).  Tabular Hijri dates can differ by
 * ±1 day from the Umm al-Qura (observational) calendar.  The expected
 * values below are computed from the forward/backward formulas:
 *   JDN = ⌊(11y+3)/30⌋ + 354y + 30m − ⌊(m−1)/2⌋ + d + 1948055
 *
 * Usage:  gjs --module tests/test-hijri.js
 */

import {
  getHijriDate,
  hijriToGregorian,
  getMonthNames,
  daysInHijriYear,
  daysInHijriMonth,
  daysUntilHijriMonth,
  daysUntilRamadan,
  daysUntilEidAlFitr,
  daysUntilEidAlAdha,
  daysUntilAshura,
  daysUntilArafah,
  isWhiteDays,
  daysUntilWhiteDays,
} from '../nidaa@abdelrzz9/src/core/hijri/index.js';

const LOG_PREFIX = '[Nidaa:Test:Hijri]';

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (!condition) {
    print(`${LOG_PREFIX}   FAIL: ${msg}`);
    failed++;
  } else {
    passed++;
  }
}

function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    print(`${LOG_PREFIX}   FAIL: ${msg} — expected ${expected}, got ${actual}`);
    failed++;
  } else {
    passed++;
  }
}

function assertGt(actual, min, msg) {
  if (!(actual > min)) {
    print(`${LOG_PREFIX}   FAIL: ${msg} — expected > ${min}, got ${actual}`);
    failed++;
  } else {
    passed++;
  }
}

// ============================================================
//  1. Known Gregorian → Hijri pairs (Kuwaiti tabular algorithm)
// ============================================================
print(`${LOG_PREFIX} === Gregorian → Hijri known pairs ===`);

{
  // 1 Muharram 1436 = October 25, 2014
  // Verified: JDN(2014-10-25) = 2456956, _hijriToJDN(1436,1,1) = 2456956
  const d1 = getHijriDate(new Date(2014, 9, 25));
  assertEq(d1.year, 1436, '1 Muharram 1436 → year');
  assertEq(d1.month, 1, '1 Muharram 1436 → month');
  assertEq(d1.day, 1, '1 Muharram 1436 → day');

  // 1 Muharram 1445 = July 19, 2023
  // Verified: JDN(2023-07-19) = 2460145, _hijriToJDN(1445,1,1) = 2460145
  const d2 = getHijriDate(new Date(2023, 6, 19));
  assertEq(d2.year, 1445, '1 Muharram 1445 → year');
  assertEq(d2.month, 1, '1 Muharram 1445 → month');
  assertEq(d2.day, 1, '1 Muharram 1445 → day');

  // 1 Muharram 1446 = July 8, 2024 (tabular; Umm al-Qura = July 7)
  // Verified: JDN(2024-07-08) = 2460500, _hijriToJDN(1446,1,1) = 2460500
  const d3 = getHijriDate(new Date(2024, 6, 8));
  assertEq(d3.year, 1446, '1 Muharram 1446 → year');
  assertEq(d3.month, 1, '1 Muharram 1446 → month');
  assertEq(d3.day, 1, '1 Muharram 1446 → day');

  // July 7, 2024 = 30 Dhul Hijjah 1445 (day before 1 Muharram 1446)
  const d4 = getHijriDate(new Date(2024, 6, 7));
  assertEq(d4.year, 1445, 'July 7 → 1445');
  assertEq(d4.month, 12, 'July 7 → Dhul Hijjah');
  assertEq(d4.day, 30, 'July 7 → day 30');

  // 4 Muharram 1446 = July 11, 2024
  const d5 = getHijriDate(new Date(2024, 6, 11));
  assertEq(d5.year, 1446, '4 Muharram 1446 → year');
  assertEq(d5.month, 1, '4 Muharram 1446 → month');
  assertEq(d5.day, 4, '4 Muharram 1446 → day');
}

// ============================================================
//  2. Month names
// ============================================================
print(`${LOG_PREFIX} === month names ===`);

{
  const ar = getMonthNames('ar');
  assertEq(ar[1], 'محرّم', 'Arabic Muharram');
  assertEq(ar[9], 'رمضان', 'Arabic Ramadan');
  assertEq(ar[12], 'ذو الحجّة', 'Arabic Dhul Hijjah');

  const en = getMonthNames('en');
  assertEq(en[1], 'Muharram', 'English Muharram');
  assertEq(en[9], 'Ramadan', 'English Ramadan');
  assertEq(en[12], 'Dhu al-Hijjah', 'English Dhul Hijjah');

  const fr = getMonthNames('fr');
  assertEq(fr[1], 'Mouharram', 'French Muharram');
  assertEq(fr[9], 'Ramadan', 'French Ramadan');
  assertEq(fr[12], 'Dhou al-Hijja', 'French Dhul Hijjah');

  // Default (no arg) → English
  const def = getMonthNames();
  assertEq(def[1], 'Muharram', 'default English');
}

// ============================================================
//  3. Month name in getHijriDate result
// ============================================================
print(`${LOG_PREFIX} === getHijriDate includes monthName ===`);

{
  const d = getHijriDate(new Date(2024, 6, 8)); // 1 Muharram 1446
  assertEq(d.monthName, 'Muharram', 'monthName English');
  assertEq(d.monthNameAr, 'محرّم', 'monthName Arabic');
}

// ============================================================
//  4. daysInHijriYear
// ============================================================
print(`${LOG_PREFIX} === daysInHijriYear ===`);

{
  // Common year = 354 days, leap year = 355 days
  // Leap years: 2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29 (in 30-year cycle)
  assertEq(daysInHijriYear(2), 355, 'leap year 2 = 355');
  assertEq(daysInHijriYear(1), 354, 'common year 1 = 354');
  assertEq(daysInHijriYear(10), 355, 'leap year 10 = 355');
  assertEq(daysInHijriYear(3), 354, 'common year 3 = 354');
  // Year 5 is a leap year
  assertEq(daysInHijriYear(5), 355, 'leap year 5 = 355');
}

// ============================================================
//  5. daysInHijriMonth
// ============================================================
print(`${LOG_PREFIX} === daysInHijriMonth ===`);

{
  // Odd months = 30, even months = 29 (except Dhul Hijjah in leap year)
  assertEq(daysInHijriMonth(1, 1), 30, 'Muharram = 30');
  assertEq(daysInHijriMonth(1, 2), 29, 'Safar = 29');
  assertEq(daysInHijriMonth(1, 3), 30, 'Rabi al-Awwal = 30');
  assertEq(daysInHijriMonth(1, 9), 30, 'Ramadan = 30');

  // Dhul Hijjah: 30 in leap years, 29 in common
  assertEq(daysInHijriMonth(2, 12), 30, 'Dhul Hijjah leap = 30');
  assertEq(daysInHijriMonth(1, 12), 29, 'Dhul Hijjah common = 29');
  // Year 5 is a leap year
  assertEq(daysInHijriMonth(5, 12), 30, 'Dhul Hijjah year 5 (leap) = 30');
}

// ============================================================
//  6. Hijri → Gregorian known pairs
// ============================================================
print(`${LOG_PREFIX} === Hijri → Gregorian known pairs ===`);

{
  // 1 Muharram 1436 → October 25, 2014
  const g1 = hijriToGregorian(1436, 1, 1);
  assert(g1 instanceof Date, 'returns Date');
  assertEq(g1.getFullYear(), 2014, '1436/1/1 → year 2014');
  assertEq(g1.getMonth(), 9, '1436/1/1 → October');
  assertEq(g1.getDate(), 25, '1436/1/1 → day 25');

  // 1 Muharram 1446 → July 8, 2024 (tabular)
  const g2 = hijriToGregorian(1446, 1, 1);
  assertEq(g2.getFullYear(), 2024, '1446/1/1 → year 2024');
  assertEq(g2.getMonth(), 6, '1446/1/1 → July');
  assertEq(g2.getDate(), 8, '1446/1/1 → day 8');
}

// ============================================================
//  7. Round-trip consistency
// ============================================================
print(`${LOG_PREFIX} === round-trip consistency ===`);

{
  const testDates = [
    new Date(2024, 6, 8),   // 1 Muharram 1446
    new Date(2014, 9, 25),  // 1 Muharram 1436
    new Date(2023, 6, 19),  // 1 Muharram 1445
    new Date(2025, 0, 1),   // random date
    new Date(2020, 2, 15),  // random date
  ];

  for (const original of testDates) {
    const hijri = getHijriDate(original);
    const back = hijriToGregorian(hijri.year, hijri.month, hijri.day);
    assertEq(back.getFullYear(), original.getFullYear(),
      `round-trip ${original.toISOString().slice(0,10)} → year`);
    assertEq(back.getMonth(), original.getMonth(),
      `round-trip ${original.toISOString().slice(0,10)} → month`);
    assertEq(back.getDate(), original.getDate(),
      `round-trip ${original.toISOString().slice(0,10)} → day`);
  }
}

// ============================================================
//  8. Invalid date handling
// ============================================================
print(`${LOG_PREFIX} === invalid date handling ===`);

{
  const invalid = getHijriDate(new Date('invalid'));
  assertEq(invalid, null, 'invalid date → null');

  const nullResult = hijriToGregorian(0, 1, 1);
  assertEq(nullResult, null, 'year 0 → null');

  const badMonth = hijriToGregorian(1446, 13, 1);
  assertEq(badMonth, null, 'month 13 → null');

  const badDay = hijriToGregorian(1446, 2, 30); // Safar has 29 days
  assertEq(badDay, null, 'day 30 in Safar → null');
}

// ============================================================
//  9. daysUntilHijriMonth
// ============================================================
print(`${LOG_PREFIX} === daysUntilHijriMonth ===`);

{
  // On 1 Muharram 1446 (July 8, 2024): days until Ramadan (month 9)
  const ref = new Date(2024, 6, 8); // 1 Muharram 1446
  const hijri = getHijriDate(ref);
  assertEq(hijri.month, 1, 'ref is Muharram');
  assertEq(hijri.day, 1, 'ref is day 1');

  const daysToRamadan = daysUntilHijriMonth(9, ref);
  // From 1 Muharram to 1 Ramadan: 8 months = 30+29+30+29+30+29+30+29 = 236 days
  assertEq(daysToRamadan, 236, 'days from 1 Muharram to 1 Ramadan');

  // Same month → 0
  const sameMonth = daysUntilHijriMonth(1, ref);
  assertEq(sameMonth, 0, 'same month → 0');
}

// ============================================================
//  10. daysUntilRamadan
// ============================================================
print(`${LOG_PREFIX} === daysUntilRamadan ===`);

{
  const ref = new Date(2024, 6, 8); // 1 Muharram 1446
  assertEq(daysUntilRamadan(ref), 236, 'days to Ramadan from 1 Muharram 1446');
}

// ============================================================
//  11. daysUntilEidAlFitr
// ============================================================
print(`${LOG_PREFIX} === daysUntilEidAlFitr ===`);

{
  const ref = new Date(2024, 6, 8); // 1 Muharram 1446
  const days = daysUntilEidAlFitr(ref);
  // Ramadan is 30 days, so Eid = 236 + 30 = 266
  assertEq(days, 266, 'days from 1 Muharram 1446 to Eid al-Fitr');
}

// ============================================================
//  12. daysUntilEidAlAdha
// ============================================================
print(`${LOG_PREFIX} === daysUntilEidAlAdha ===`);

{
  const ref = new Date(2024, 6, 8); // 1 Muharram 1446
  const days = daysUntilEidAlAdha(ref);
  assertGt(days, 300, 'days to Eid al-Adha > 300');
  // From 1 Muharram to 10 Dhul Hijjah:
  // Remaining in Muharram: 29, Months 2-11: 295, Day 10 = +10
  // Total: 29 + 295 + 10 = 334
  assertEq(days, 334, 'days from 1 Muharram to 10 Dhul Hijjah');
}

// ============================================================
//  13. daysUntilAshura
// ============================================================
print(`${LOG_PREFIX} === daysUntilAshura ===`);

{
  const ref = new Date(2024, 6, 8); // 1 Muharram 1446
  const days = daysUntilAshura(ref);
  // 10th - 1st = 9 days
  assertEq(days, 9, 'days from 1st to 10th Muharram');
}

// ============================================================
//  14. daysUntilArafah
// ============================================================
print(`${LOG_PREFIX} === daysUntilArafah ===`);

{
  const ref = new Date(2024, 6, 8); // 1 Muharram 1446
  const days = daysUntilArafah(ref);
  // 9th Dhul Hijjah: 29 + 295 + 9 = 333
  assertEq(days, 333, 'days from 1 Muharram to 9 Dhul Hijjah');
}

// ============================================================
//  15. isWhiteDays
// ============================================================
print(`${LOG_PREFIX} === isWhiteDays ===`);

{
  // 14 Muharram 1446 = July 8 + 13 = July 21, 2024
  const whiteDay = new Date(2024, 6, 21);
  const result = isWhiteDays(whiteDay);
  assert(result.isWhiteDay === true, '14th is White Day');

  // 12th = July 8 + 11 = July 19
  const notWhite = new Date(2024, 6, 19);
  const result2 = isWhiteDays(notWhite);
  assert(result2.isWhiteDay === false, '12th is not White Day');

  // 13th = July 8 + 12 = July 20
  const day13 = new Date(2024, 6, 20);
  const result3 = isWhiteDays(day13);
  // Wait: 1st = July 8, 13th = July 8 + 12 = July 20
  // But 12th = July 8 + 11 = July 19
  // Let me recalculate: 13th Muharram = July 8 + 12 = July 20
  assert(result3.isWhiteDay === true, '13th is White Day');
}

// ============================================================
//  16. daysUntilWhiteDays
// ============================================================
print(`${LOG_PREFIX} === daysUntilWhiteDays ===`);

{
  // On 1st Muharram (July 8): 12 days until 13th
  const ref = new Date(2024, 6, 8); // 1 Muharram
  assertEq(daysUntilWhiteDays(ref), 12, 'days to White Days from 1st');

  // On 13th (White Day): 0
  const whiteDay = new Date(2024, 6, 20); // 13th Muharram
  assertEq(daysUntilWhiteDays(whiteDay), 0, 'on White Day → 0');

  // On 14th (also White Day): 0
  const day14 = new Date(2024, 6, 21); // 14th Muharram
  assertEq(daysUntilWhiteDays(day14), 0, 'on 14th → 0');

  // On 16th (after White Days): count to 13th of next month
  const afterWhite = new Date(2024, 6, 23); // 16th Muharram
  const days = daysUntilWhiteDays(afterWhite);
  assertGt(days, 0, 'after White Days → > 0');
}

// ============================================================
//  Summary
// ============================================================
const total = passed + failed;
print(`${LOG_PREFIX} ========================================`);
print(`${LOG_PREFIX} ${passed}/${total} assertions passed`);
if (failed > 0) {
  print(`${LOG_PREFIX} ${failed} assertion(s) FAILED`);
}
print(`${LOG_PREFIX} ========================================`);

imports.system.exit(failed > 0 ? 1 : 0);
