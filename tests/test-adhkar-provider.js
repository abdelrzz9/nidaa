#!/usr/bin/env gjs --module
/*
 * Tests for src/core/adhkar/index.js — adhkar event provider.
 *
 * Validates that the provider:
 *   - Returns empty arrays when location is null
 *   - Returns empty arrays when adhkar is disabled
 *   - Generates morning adhkar events (sunrise + offset)
 *   - Generates evening adhkar events (maghrib - offset)
 *   - Generates post-prayer adhkar events for each enabled prayer
 *   - Respects per-prayer adhkar toggles
 *   - Each event has the required shape
 *
 * Usage:  gjs --module tests/test-adhkar-provider.js
 */

import { createAdhkarProvider } from '../nidaa@abdelrzz9/src/core/adhkar/index.js';

const LOG_PREFIX = '[Nidaa:Test:AdhkarProvider]';

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

// ============================================================
//  1. Null location → empty provider
// ============================================================
print(`${LOG_PREFIX} === null location ===`);

{
  const provider = createAdhkarProvider({ location: null });
  const events = provider(new Date());
  assertEq(events.length, 0, 'null location returns empty array');
}

// ============================================================
//  2. Adhkar disabled → empty
// ============================================================
print(`${LOG_PREFIX} === adhkar disabled ===`);

{
  const location = { latitude: 36.75, longitude: 3.06, source: 'test', timestamp: 0 };
  const mockSettings = {
    _data: { 'adhkar-enabled': false },
    get_boolean(key) { return this._data[key] ?? true; },
    get_int(key) { return this._data[key] ?? 0; },
    get_string(key) { return this._data[key] ?? ''; },
  };

  const provider = createAdhkarProvider({ location, settings: mockSettings });
  const events = provider(new Date(2025, 5, 21));
  assertEq(events.length, 0, 'returns empty when adhkar disabled');
}

// ============================================================
//  3. Default settings → morning + evening + 5 post-prayer events
// ============================================================
print(`${LOG_PREFIX} === default settings ===`);

{
  const location = { latitude: 36.75, longitude: 3.06, source: 'test', timestamp: 0 };
  const fakeNow = new Date(2025, 5, 21, 0, 0, 0); // midnight — all events are future
  const mockSettings = {
    _data: {
      'adhkar-enabled': true,
      'adhkar-language': 'en',
      'adhkar-morning-offset': 15,
      'adhkar-evening-offset': 15,
      'adhkar-post-prayer-offset': 30,
      'adhkar-post-fajr': true,
      'adhkar-post-dhuhr': true,
      'adhkar-post-asr': true,
      'adhkar-post-maghrib': true,
      'adhkar-post-isha': true,
      'prayer-method': 0,
      'asr-method': 0,
      'high-latitude-method': 3,
    },
    get_boolean(key) { return this._data[key] ?? true; },
    get_int(key) { return this._data[key] ?? 0; },
    get_string(key) { return this._data[key] ?? ''; },
  };

  const provider = createAdhkarProvider({
    location,
    settings: mockSettings,
    now: () => fakeNow,
  });
  const events = provider(new Date(2025, 5, 21));

  // Should have 1 morning + 1 evening + 5 post-prayer = 7 events
  assertEq(events.length, 7, '7 events (morning + evening + 5 post-prayer)');

  // Verify types
  const morningEvents = events.filter(e => e.type === 'adhkar' && e.title === 'Morning Adhkar');
  assertEq(morningEvents.length, 1, '1 morning adhkar event');

  const eveningEvents = events.filter(e => e.type === 'adhkar' && e.title === 'Evening Adhkar');
  assertEq(eveningEvents.length, 1, '1 evening adhkar event');

  const postPrayerEvents = events.filter(e => e.type === 'adhkar-post-prayer');
  assertEq(postPrayerEvents.length, 5, '5 post-prayer adhkar events');
}

// ============================================================
//  4. Per-prayer toggle — disable Fajr and Isha post-prayer
// ============================================================
print(`${LOG_PREFIX} === per-prayer toggle ===`);

{
  const location = { latitude: 36.75, longitude: 3.06, source: 'test', timestamp: 0 };
  const fakeNow = new Date(2025, 5, 21, 0, 0, 0);
  const mockSettings = {
    _data: {
      'adhkar-enabled': true,
      'adhkar-language': 'en',
      'adhkar-morning-offset': 15,
      'adhkar-evening-offset': 15,
      'adhkar-post-prayer-offset': 30,
      'adhkar-post-fajr': false,
      'adhkar-post-dhuhr': true,
      'adhkar-post-asr': true,
      'adhkar-post-maghrib': true,
      'adhkar-post-isha': false,
      'prayer-method': 0,
      'asr-method': 0,
      'high-latitude-method': 3,
    },
    get_boolean(key) { return this._data[key] ?? true; },
    get_int(key) { return this._data[key] ?? 0; },
    get_string(key) { return this._data[key] ?? ''; },
  };

  const provider = createAdhkarProvider({
    location,
    settings: mockSettings,
    now: () => fakeNow,
  });
  const events = provider(new Date(2025, 5, 21));

  // 1 morning + 1 evening + 3 post-prayer (dhuhr, asr, maghrib) = 5
  assertEq(events.length, 5, '5 events (morning + evening + 3 post-prayer)');

  const postPrayer = events.filter(e => e.type === 'adhkar-post-prayer');
  assertEq(postPrayer.length, 3, '3 post-prayer events (Fajr and Isha disabled)');

  const titles = postPrayer.map(e => e.title);
  assert(!titles.includes('Post-Fajr Adhkar'), 'Fajr post-prayer excluded');
  assert(!titles.includes('Post-Isha Adhkar'), 'Isha post-prayer excluded');
}

// ============================================================
//  5. All events have valid shape
// ============================================================
print(`${LOG_PREFIX} === valid event shape ===`);

{
  const location = { latitude: 36.75, longitude: 3.06, source: 'test', timestamp: 0 };
  const fakeNow = new Date(2025, 5, 21, 0, 0, 0);
  const provider = createAdhkarProvider({
    location,
    settings: null,
    now: () => fakeNow,
  });
  const events = provider(new Date(2025, 5, 21));

  for (const event of events) {
    assert(event.id.length > 0, `${event.title} has non-empty id`);
    assert(event.time instanceof Date, `${event.title} has valid Date`);
    assert(!isNaN(event.time.getTime()), `${event.title} time is not NaN`);
    assert(event.title.length > 0, `${event.title} has non-empty title`);
    assert(event.description.length > 0, `${event.title} has non-empty description`);
    assert(event.priority === 3, `${event.title} has priority 3`);
    assert(event.actions.length > 0, `${event.title} has actions`);
  }
}

// ============================================================
//  6. Event IDs are unique
// ============================================================
print(`${LOG_PREFIX} === unique IDs ===`);

{
  const location = { latitude: 36.75, longitude: 3.06, source: 'test', timestamp: 0 };
  const fakeNow = new Date(2025, 5, 21, 0, 0, 0);
  const provider = createAdhkarProvider({
    location,
    settings: null,
    now: () => fakeNow,
  });
  const events = provider(new Date(2025, 5, 21));

  const ids = events.map(e => e.id);
  const uniqueIds = new Set(ids);
  assertEq(uniqueIds.size, ids.length, 'all event IDs are unique');
}

// ============================================================
//  7. Past events are filtered out
// ============================================================
print(`${LOG_PREFIX} === past events filtered ===`);

{
  const location = { latitude: 36.75, longitude: 3.06, source: 'test', timestamp: 0 };
  // Set "now" to 23:00 — most adhkar events will be in the past
  const fakeNow = new Date(2025, 5, 21, 23, 0, 0);
  const provider = createAdhkarProvider({
    location,
    settings: null,
    now: () => fakeNow,
  });
  const events = provider(new Date(2025, 5, 21));

  // All events should be in the future relative to fakeNow
  for (const event of events) {
    assert(event.time.getTime() > fakeNow.getTime(),
      `${event.title} is in the future`);
  }
}

// ============================================================
//  8. Invalid date → empty
// ============================================================
print(`${LOG_PREFIX} === invalid date ===`);

{
  const location = { latitude: 36.75, longitude: 3.06, source: 'test', timestamp: 0 };
  const provider = createAdhkarProvider({ location, settings: null });
  const events = provider(new Date('invalid'));
  assert(Array.isArray(events), 'returns array on invalid date');
  assertEq(events.length, 0, 'returns empty on invalid date');
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
