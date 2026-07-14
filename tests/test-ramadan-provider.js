#!/usr/bin/env gjs --module
/*
 * Tests for src/core/ramadan/index.js — Ramadan event provider.
 *
 * Validates:
 *   - isRamadan helper for Hijri month 9 detection
 *   - getDailyDua returns valid structured duas
 *   - getLaylatAlQadrInfo during/outside Ramadan
 *   - getSuhoorCountdown returns null outside window, text inside
 *   - getIftarCountdown returns null after Maghrib, text before
 *   - Provider returns empty when Ramadan disabled
 *   - Provider returns empty outside Ramadan (no force)
 *   - Taraweeh event generated after Isha
 *   - Daily dua event generated after Fajr
 *   - Force-ramadan override generates events even outside Ramadan
 *   - Laylat al-Qadr events for last 10 nights
 *
 * Usage:  gjs --module tests/test-ramadan-provider.js
 */

import {
  isRamadan,
  getDailyDua,
  getLaylatAlQadrInfo,
  createRamadanProvider,
  getSuhoorCountdown,
  getIftarCountdown,
} from '../nidaa@abdelrzz9/src/core/ramadan/index.js';
import { hijriToGregorian } from '../nidaa@abdelrzz9/src/core/hijri/index.js';

const LOG_PREFIX = '[Nidaa:Test:RamadanProvider]';

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

function mockSettings(overrides = {}) {
  const store = {
    'ramadan-enabled': true,
    'force-ramadan': false,
    'ramadan-taraweeh-enabled': true,
    'ramadan-taraweeh-offset': 30,
    'ramadan-laylat-qadr-enabled': true,
    'ramadan-daily-dua-enabled': true,
    ...overrides,
  };
  return {
    get_boolean(key) { return !!store[key]; },
    get_int(key) { return typeof store[key] === 'number' ? store[key] : 0; },
    get_string(key) { return String(store[key] || ''); },
  };
}

function mockPrayerTimes(baseDate) {
  const d = baseDate || new Date();
  return {
    fajr: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 5, 30, 0, 0),
    sunrise: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 6, 45, 0, 0),
    dhuhr: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 30, 0, 0),
    asr: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 15, 45, 0, 0),
    maghrib: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 18, 20, 0, 0),
    isha: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 19, 45, 0, 0),
  };
}

// ============================================================
//  1. isRamadan helper
// ============================================================
print(`${LOG_PREFIX} === isRamadan ===`);

{
  // 10 Ramadan 1446 is during Ramadan
  const ramadan10 = hijriToGregorian(1446, 9, 10);
  assertEq(isRamadan(ramadan10), true, '10 Ramadan returns true');

  // 5 Muharram 1446 is NOT Ramadan
  const muh5 = hijriToGregorian(1446, 1, 5);
  assertEq(isRamadan(muh5), false, '5 Muharram returns false');

  // 1 Shawwal 1446 is NOT Ramadan
  const shawwal1 = hijriToGregorian(1446, 10, 1);
  assertEq(isRamadan(shawwal1), false, '1 Shawwal returns false');
}

// ============================================================
//  2. getDailyDua returns valid object
// ============================================================
print(`${LOG_PREFIX} === getDailyDua ===`);

{
  const dua = getDailyDua(new Date());
  assert(dua !== null, 'getDailyDua returns non-null');
  assert(typeof dua.text === 'string' && dua.text.length > 0, 'dua has Arabic text');
  assert(typeof dua.translation === 'string' && dua.translation.length > 0, 'dua has translation');
  assert(typeof dua.reference === 'string' && dua.reference.length > 0, 'dua has reference');

  // Different dates return potentially different duas (deterministic rotation)
  const date1 = new Date(2025, 2, 1);
  const date2 = new Date(2025, 2, 2);
  const dua1 = getDailyDua(date1);
  const dua2 = getDailyDua(date2);
  assert(dua1.text.length > 0, 'dua1 text non-empty');
  assert(dua2.text.length > 0, 'dua2 text non-empty');
}

// ============================================================
//  3. getLaylatAlQadrInfo
// ============================================================
print(`${LOG_PREFIX} === getLaylatAlQadrInfo ===`);

{
  // Outside Ramadan → null
  const muh5 = hijriToGregorian(1446, 1, 5);
  const outside = getLaylatAlQadrInfo(muh5);
  assertEq(outside, null, 'null outside Ramadan');

  // Ramadan day 10 (not last 10) → isLastTen false
  const ram10 = hijriToGregorian(1446, 9, 10);
  const info1 = getLaylatAlQadrInfo(ram10);
  assert(info1 !== null, 'returns info during Ramadan');
  assertEq(info1.isLaylatAlQadrPeriod, false, 'day 10 is not in last ten');
  assertEq(info1.hijriDay, 10, 'correct hijri day');

  // Ramadan day 21 (odd, last ten) → isOddNight true
  const ram21 = hijriToGregorian(1446, 9, 21);
  const info2 = getLaylatAlQadrInfo(ram21);
  assert(info2 !== null, 'returns info on day 21');
  assertEq(info2.isLaylatAlQadrPeriod, true, 'day 21 is in last ten');
  assertEq(info2.isOddNight, true, 'day 21 is odd');
  assertEq(info2.hijriDay, 21, 'hijri day is 21');

  // Ramadan day 22 (even, last ten) → isOddNight false
  const ram22 = hijriToGregorian(1446, 9, 22);
  const info3 = getLaylatAlQadrInfo(ram22);
  assert(info3 !== null, 'returns info on day 22');
  assertEq(info3.isLaylatAlQadrPeriod, true, 'day 22 is in last ten');
  assertEq(info3.isOddNight, false, 'day 22 is even');
  assertEq(info3.hijriDay, 22, 'hijri day is 22');
}

// ============================================================
//  4. getSuhoorCountdown
// ============================================================
print(`${LOG_PREFIX} === getSuhoorCountdown ===`);

{
  const pt = mockPrayerTimes(new Date(2025, 2, 10));

  // Null prayerTimes → null
  assertEq(getSuhoorCountdown(null, 0), null, 'null prayerTimes returns null');

  // At Fajr time → null (suhoor window ended)
  const atFajr = new Date(pt.fajr.getTime());
  const atFajrResult = getSuhoorCountdown(pt, 0, atFajr);
  assertEq(atFajrResult, null, 'null at Fajr time (suhoor over)');

  // Well before Fajr (more than 6h) → null
  const tooEarly = new Date(pt.fajr.getTime() - 8 * 3600000);
  const tooEarlyResult = getSuhoorCountdown(pt, 0, tooEarly);
  assertEq(tooEarlyResult, null, 'null when before suhoor window');

  // 2 hours before Fajr → countdown string
  const twoHoursBefore = new Date(pt.fajr.getTime() - 2 * 3600000);
  const insideResult = getSuhoorCountdown(pt, 0, twoHoursBefore);
  assert(insideResult !== null, 'returns string during suhoor window');
  assert(insideResult.startsWith('Suhoor ends in'), 'Suhoor countdown prefix');
  assert(insideResult.includes('h'), 'Suhoor countdown has hours');
}

// ============================================================
//  5. getIftarCountdown
// ============================================================
print(`${LOG_PREFIX} === getIftarCountdown ===`);

{
  const pt = mockPrayerTimes(new Date(2025, 2, 10));

  // Null prayerTimes → null
  assertEq(getIftarCountdown(null, 0), null, 'null prayerTimes returns null');

  // After Maghrib → null
  const afterMaghrib = new Date(pt.maghrib.getTime() + 3600000);
  const afterResult = getIftarCountdown(pt, 0, afterMaghrib);
  assertEq(afterResult, null, 'null after Maghrib');

  // 2 hours before Maghrib → countdown string
  const twoHoursBefore = new Date(pt.maghrib.getTime() - 2 * 3600000);
  const beforeResult = getIftarCountdown(pt, 0, twoHoursBefore);
  assert(beforeResult !== null, 'returns string before Maghrib');
  assert(beforeResult.startsWith('Iftar in'), 'Iftar countdown prefix');

  // 30 min before Maghrib → minutes-only text
  const thirtyMinBefore = new Date(pt.maghrib.getTime() - 30 * 60000);
  const minResult = getIftarCountdown(pt, 0, thirtyMinBefore);
  assert(minResult !== null, 'returns string 30 min before Maghrib');
  assert(minResult.includes('m'), 'Iftar countdown has minutes');
}

// ============================================================
//  6. Provider empty when Ramadan disabled
// ============================================================
print(`${LOG_PREFIX} === Ramadan disabled ===`);

{
  const ramadanDate = hijriToGregorian(1446, 9, 15);
  ramadanDate.setHours(5, 0, 0, 0);
  const pt = mockPrayerTimes(ramadanDate);
  const disabled = mockSettings({ 'ramadan-enabled': false });
  const provider = createRamadanProvider({
    prayerTimes: pt,
    settings: disabled,
    now: ramadanDate,
  });
  const events = provider(ramadanDate);
  assertEq(events.length, 0, 'empty when Ramadan disabled');
}

// ============================================================
//  7. Provider empty outside Ramadan (no force override)
// ============================================================
print(`${LOG_PREFIX} === outside Ramadan, not forced ===`);

{
  const muh5 = hijriToGregorian(1446, 1, 5);
  muh5.setHours(5, 0, 0, 0);
  const pt = mockPrayerTimes(muh5);
  const provider = createRamadanProvider({
    prayerTimes: pt,
    settings: mockSettings(),
    now: muh5,
  });
  const events = provider(muh5);
  assertEq(events.length, 0, 'empty outside Ramadan when not forced');
}

// ============================================================
//  8. Provider generates events during Ramadan
// ============================================================
print(`${LOG_PREFIX} === during Ramadan ===`);

{
  // Ramadan 15 at 5AM (before Fajr) → all events are future
  const ram15 = hijriToGregorian(1446, 9, 15);
  ram15.setHours(5, 0, 0, 0);
  const pt = mockPrayerTimes(ram15);
  const provider = createRamadanProvider({
    prayerTimes: pt,
    settings: mockSettings(),
    now: ram15,
  });
  const events = provider(ram15);

  // Should have: taraweeh, laylat al-qadr (day 15 is not last ten though), and daily dua
  // Day 15 is NOT in last 10, so no laylat al-qadr event
  // Events: taraweeh + daily dua = 2 (taraweeh is after isha, always future at 5AM)
  assertEq(events.length, 2, '2 events on Ramadan 15 (taraweeh + dua)');

  // Verify taraweeh
  const taraweeh = events.find(e => e.id.startsWith('ramadan-taraweeh-'));
  assert(taraweeh !== undefined, 'Taraweeh event generated');
  assertEq(taraweeh.type, 'adhkar', 'Taraweeh event type is adhkar');
  assert(taraweeh.title.includes('Taraweeh'), 'Taraweeh title');
  assert(taraweeh.time instanceof Date, 'Taraweeh time is Date');
  assert(!isNaN(taraweeh.time.getTime()), 'Taraweeh time is valid');

  // Verify daily dua
  const dua = events.find(e => e.id.startsWith('ramadan-dua-'));
  assert(dua !== undefined, 'Daily dua event generated');
  assertEq(dua.type, 'reminder', 'Dua event type is reminder');
  assert(dua.title.includes('Daily Ramadan Dua'), 'Dua title');
  assert(dua.time instanceof Date, 'Dua time is Date');
}

// ============================================================
//  9. Taraweeh offset applied correctly
// ============================================================
print(`${LOG_PREFIX} === Taraweeh offset ===`);

{
  const ram15 = hijriToGregorian(1446, 9, 15);
  ram15.setHours(5, 0, 0, 0);
  const pt = mockPrayerTimes(ram15);
  const customOffset = mockSettings({ 'ramadan-taraweeh-offset': 45 });
  const provider = createRamadanProvider({
    prayerTimes: pt,
    settings: customOffset,
    now: ram15,
  });
  const events = provider(ram15);
  const taraweeh = events.find(e => e.id.startsWith('ramadan-taraweeh-'));
  assert(taraweeh !== undefined, 'Taraweeh event with custom offset');

  // Isha is at 19:45, offset 45 min → taraweeh at 20:30
  const expectedTime = new Date(pt.isha.getTime() + 45 * 60000);
  assertEq(taraweeh.time.getTime(), expectedTime.getTime(), 'Taraweeh time with 45 min offset');
}

// ============================================================
//  10. Laylat al-Qadr events generated for last 10 nights
// ============================================================
print(`${LOG_PREFIX} === Laylat al-Qadr events ===`);

{
  // Ramadan 21 at 5AM (last ten, odd night) → Qadr event should be generated
  const ram21 = hijriToGregorian(1446, 9, 21);
  ram21.setHours(5, 0, 0, 0);
  const pt = mockPrayerTimes(ram21);
  const provider = createRamadanProvider({
    prayerTimes: pt,
    settings: mockSettings(),
    now: ram21,
  });
  const events = provider(ram21);
  const qadr = events.find(e => e.id.startsWith('ramadan-qadr-'));
  assert(qadr !== undefined, 'Laylat al-Qadr event generated on day 21');
  assert(qadr.title.includes('Laylat al-Qadr'), 'Qadr event title');
  assert(qadr.title.includes('Odd Night'), 'Odd night emphasis on day 21');
  assertEq(qadr.priority, 8, 'Laylat al-Qadr priority is 8');

  // Day 22 (even night) → Qadr event with "Last Ten Nights" title
  const ram22 = hijriToGregorian(1446, 9, 22);
  ram22.setHours(5, 0, 0, 0);
  const pt2 = mockPrayerTimes(ram22);
  const provider2 = createRamadanProvider({
    prayerTimes: pt2,
    settings: mockSettings(),
    now: ram22,
  });
  const events2 = provider2(ram22);
  const qadr2 = events2.find(e => e.id.startsWith('ramadan-qadr-'));
  assert(qadr2 !== undefined, 'Laylat al-Qadr event on day 22');
  assert(qadr2.title.includes('Last Ten Nights'), 'Even night uses Last Ten Nights title');
}

// ============================================================
//  11. Force-ramadan override generates events outside Ramadan
// ============================================================
print(`${LOG_PREFIX} === force-ramadan override ===`);

{
  // Outside Ramadan, but force-ramadan is true → events generated
  const muh5 = hijriToGregorian(1446, 1, 5);
  muh5.setHours(5, 0, 0, 0);
  const pt = mockPrayerTimes(muh5);
  const forced = mockSettings({ 'force-ramadan': true });
  const provider = createRamadanProvider({
    prayerTimes: pt,
    settings: forced,
    now: muh5,
  });
  const events = provider(muh5);
  assert(events.length > 0, 'events generated with force-ramadan outside Ramadan');
  const taraweeh = events.find(e => e.id.startsWith('ramadan-taraweeh-'));
  assert(taraweeh !== undefined, 'Taraweeh event with force override');
}

// ============================================================
//  12. No prayerTimes → empty
// ============================================================
print(`${LOG_PREFIX} === no prayerTimes ===`);

{
  const ram15 = hijriToGregorian(1446, 9, 15);
  ram15.setHours(5, 0, 0, 0);
  const provider = createRamadanProvider({
    prayerTimes: null,
    settings: mockSettings(),
    now: ram15,
  });
  const events = provider(ram15);
  assertEq(events.length, 0, 'empty when prayerTimes is null');
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
