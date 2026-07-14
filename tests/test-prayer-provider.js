#!/usr/bin/env gjs --module
/*
 * Tests for src/core/prayer/provider.js — prayer event provider.
 *
 * Validates that the provider factory:
 *   - Returns empty arrays when location is null
 *   - Generates correct events per day
 *   - Respects per-prayer notification toggles
 *   - Emits iqamah reminders when offset > 0
 *   - Emits "prayer ending soon" warnings when offset > 0
 *   - Each event has the required shape and valid future timestamps
 *
 * Usage:  gjs --module tests/test-prayer-provider.js
 */

import { createPrayerProvider } from '../nidaa@abdelrzz9/src/core/prayer/provider.js';

const LOG_PREFIX = '[Nidaa:Test:PrayerProvider]';

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
  const provider = createPrayerProvider({ location: null });
  const events = provider(new Date());
  assertEq(events.length, 0, 'null location returns empty array');
}

// ============================================================
//  2. Default settings → 5 prayer events
// ============================================================
print(`${LOG_PREFIX} === default settings → 5 events ===`);

{
  const location = { latitude: 36.75, longitude: 3.06, source: 'test', timestamp: 0 };
  const provider = createPrayerProvider({ location, settings: null });
  const testDate = new Date(2025, 5, 21); // June 21, 2025
  const events = provider(testDate);

  assertEq(events.length, 5, '5 prayer events with default settings');

  // Verify each event has the required shape
  const types = events.map(e => e.type);
  assert(types.every(t => t === 'prayer'), 'all events are type "prayer"');

  const titles = events.map(e => e.title);
  assert(titles.includes('Fajr — Adhan'), 'has Fajr event');
  assert(titles.includes('Dhuhr — Adhan'), 'has Dhuhr event');
  assert(titles.includes('Asr — Adhan'), 'has Asr event');
  assert(titles.includes('Maghrib — Adhan'), 'has Maghrib event');
  assert(titles.includes('Isha — Adhan'), 'has Isha event');

  // Each event should have actions
  for (const event of events) {
    assert(event.actions.length === 2, `${event.title} has 2 actions (Snooze, Mark as Prayed)`);
    assertEq(event.actions[0].label, 'Snooze', `${event.title} has Snooze action`);
    assertEq(event.actions[1].label, 'Mark as Prayed', `${event.title} has Mark as Prayed action`);
  }

  // Priority should be 8 (HIGH) for all adhan events
  assert(events.every(e => e.priority === 8), 'all adhan events have priority 8');
}

// ============================================================
//  3. Per-prayer notification toggle
// ============================================================
print(`${LOG_PREFIX} === per-prayer notification toggle ===`);

{
  const location = { latitude: 36.75, longitude: 3.06, source: 'test', timestamp: 0 };

  // Mock settings that disable Fajr and Isha notifications
  const mockSettings = {
    _data: {
      'notifications-enabled': true,
      'notify-fajr': false,
      'notify-dhuhr': true,
      'notify-asr': true,
      'notify-maghrib': true,
      'notify-isha': false,
      'prayer-method': 0,
      'asr-method': 0,
      'high-latitude-method': 1,
      'prayer-snooze-duration': 10,
      'prayer-iqamah-reminder-offset': 0,
      'prayer-ending-soon-offset': 0,
    },
    get_boolean(key) { return this._data[key] ?? true; },
    get_int(key) { return this._data[key] ?? 0; },
    get_string(key) { return this._data[key] ?? ''; },
  };

  const provider = createPrayerProvider({ location, settings: mockSettings });
  const events = provider(new Date(2025, 5, 21));

  assertEq(events.length, 3, '3 events when Fajr and Isha disabled');

  const titles = events.map(e => e.title);
  assert(!titles.includes('Fajr — Adhan'), 'Fajr excluded when disabled');
  assert(!titles.includes('Isha — Adhan'), 'Isha excluded when disabled');
  assert(titles.includes('Dhuhr — Adhan'), 'Dhuhr included');
  assert(titles.includes('Asr — Adhan'), 'Asr included');
  assert(titles.includes('Maghrib — Adhan'), 'Maghrib included');
}

// ============================================================
//  4. Master notifications toggle — iqamah/ending-soon suppressed
// ============================================================
print(`${LOG_PREFIX} === master notifications toggle ===`);

{
  const location = { latitude: 36.75, longitude: 3.06, source: 'test', timestamp: 0 };

  const mockSettings = {
    _data: {
      'notifications-enabled': false,
      'prayer-method': 0,
      'asr-method': 0,
      'high-latitude-method': 1,
      'prayer-iqamah-reminder-offset': 15,
      'prayer-ending-soon-offset': 10,
    },
    get_boolean(key) { return this._data[key] ?? true; },
    get_int(key) { return this._data[key] ?? 0; },
    get_string(key) { return this._data[key] ?? ''; },
  };

  const fakeNow = new Date(2025, 5, 21, 1, 0, 0);
  const provider = createPrayerProvider({
    location,
    settings: mockSettings,
    now: () => fakeNow,
  });
  const events = provider(new Date(2025, 5, 21));

  // Prayer events are still generated (scheduler needs them for indicator),
  // but iqamah and ending-soon are suppressed when notifications are off
  assertEq(events.length, 5, '5 prayer events (iqamah + ending-soon suppressed)');

  const iqamahEvents = events.filter(e => e.type === 'iqamah');
  assertEq(iqamahEvents.length, 0, 'no iqamah events when notifications disabled');

  const endingSoonEvents = events.filter(e => e.type === 'prayer-ending-soon');
  assertEq(endingSoonEvents.length, 0, 'no ending-soon events when notifications disabled');
}

// ============================================================
//  5. Iqamah reminder offset
// ============================================================
print(`${LOG_PREFIX} === iqamah reminder offset ===`);

{
  const location = { latitude: 36.75, longitude: 3.06, source: 'test', timestamp: 0 };

  const mockSettings = {
    _data: {
      'notifications-enabled': true,
      'prayer-method': 0,
      'asr-method': 0,
      'high-latitude-method': 1,
      'prayer-iqamah-reminder-offset': 15,
    },
    get_boolean(key) { return this._data[key] ?? true; },
    get_int(key) { return this._data[key] ?? 0; },
    get_string(key) { return this._data[key] ?? ''; },
  };

  const provider = createPrayerProvider({ location, settings: mockSettings });
  const events = provider(new Date(2025, 5, 21));

  // 5 adhan + 5 iqamah = 10 events
  assertEq(events.length, 10, '10 events (5 adhan + 5 iqamah) with 15-min offset');

  const iqamahEvents = events.filter(e => e.type === 'iqamah');
  assertEq(iqamahEvents.length, 5, '5 iqamah reminder events');

  for (const event of iqamahEvents) {
    assert(event.title.includes('Iqamah in 15 min'), `${event.title} shows 15-min offset`);
    assertEq(event.priority, 5, 'iqamah has priority 5');
    assertEq(event.actions.length, 0, 'iqamah has no actions');
  }
}

// ============================================================
//  6. Iqamah offset disabled (0) → no iqamah events
// ============================================================
print(`${LOG_PREFIX} === iqamah offset disabled ===`);

{
  const location = { latitude: 36.75, longitude: 3.06, source: 'test', timestamp: 0 };

  const mockSettings = {
    _data: {
      'notifications-enabled': true,
      'prayer-method': 0,
      'asr-method': 0,
      'high-latitude-method': 1,
      'prayer-iqamah-reminder-offset': 0,
    },
    get_boolean(key) { return this._data[key] ?? true; },
    get_int(key) { return this._data[key] ?? 0; },
    get_string(key) { return this._data[key] ?? ''; },
  };

  const provider = createPrayerProvider({ location, settings: mockSettings });
  const events = provider(new Date(2025, 5, 21));

  const iqamahEvents = events.filter(e => e.type === 'iqamah');
  assertEq(iqamahEvents.length, 0, 'no iqamah events when offset is 0');
}

// ============================================================
//  7. Ending-soon warning
// ============================================================
print(`${LOG_PREFIX} === ending-soon warning ===`);

{
  const location = { latitude: 36.75, longitude: 3.06, source: 'test', timestamp: 0 };

  const mockSettings = {
    _data: {
      'notifications-enabled': true,
      'prayer-method': 0,
      'asr-method': 0,
      'high-latitude-method': 1,
      'prayer-ending-soon-offset': 10,
    },
    get_boolean(key) { return this._data[key] ?? true; },
    get_int(key) { return this._data[key] ?? 0; },
    get_string(key) { return this._data[key] ?? ''; },
  };

  const testDate = new Date(2025, 5, 21);
  // Use an injectable "now" that is before the first prayer (03:37 UTC+1)
  const fakeNow = new Date(2025, 5, 21, 1, 0, 0);
  const provider = createPrayerProvider({
    location,
    settings: mockSettings,
    now: () => fakeNow,
  });
  const events = provider(testDate);

  const endingSoonEvents = events.filter(e => e.type === 'prayer-ending-soon');

  // Should have 4 ending-soon warnings (no warning before Isha — it's the last prayer)
  assertEq(endingSoonEvents.length, 4, '4 ending-soon warnings (one per preceding prayer)');

  for (const event of endingSoonEvents) {
    assert(event.title.includes('time ending soon'), `${event.title} is ending-soon type`);
    assert(event.description.includes('begins in 10 min'), `${event.description} shows 10-min offset`);
    assertEq(event.priority, 3, 'ending-soon has low priority');
  }
}

// ============================================================
//  8. All events have valid timestamps in the future
// ============================================================
print(`${LOG_PREFIX} === all events have valid future timestamps ===`);

{
  const location = { latitude: 36.75, longitude: 3.06, source: 'test', timestamp: 0 };
  const provider = createPrayerProvider({ location, settings: null });
  const testDate = new Date(2025, 5, 21);
  const events = provider(testDate);

  for (const event of events) {
    assert(event.time instanceof Date, `${event.title} has valid Date`);
    assert(!isNaN(event.time.getTime()), `${event.title} time is not NaN`);
    assert(event.id.length > 0, `${event.title} has non-empty id`);
  }
}

// ============================================================
//  9. Event IDs are unique
// ============================================================
print(`${LOG_PREFIX} === event IDs are unique ===`);

{
  const location = { latitude: 36.75, longitude: 3.06, source: 'test', timestamp: 0 };
  const provider = createPrayerProvider({ location, settings: null });
  const events = provider(new Date(2025, 5, 21));

  const ids = events.map(e => e.id);
  const uniqueIds = new Set(ids);
  assertEq(uniqueIds.size, ids.length, 'all event IDs are unique');
}

// ============================================================
//  10. Provider returns empty on bad date (edge case)
// ============================================================
print(`${LOG_PREFIX} === provider with invalid date ===`);

{
  const location = { latitude: 36.75, longitude: 3.06, source: 'test', timestamp: 0 };
  const provider = createPrayerProvider({ location, settings: null });

  // Invalid date should not crash — returns empty array
  const events = provider(new Date('invalid'));
  assert(Array.isArray(events), 'returns array on invalid date');
  assertEq(events.length, 0, 'returns empty array on invalid date');
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
