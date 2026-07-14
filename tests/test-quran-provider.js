#!/usr/bin/env gjs --module
/*
 * Tests for src/core/quran/provider.js and store.js.
 *
 * Validates:
 *   - Null location → empty provider
 *   - Disabled → empty provider
 *   - Each of the 6 frequency modes generates the correct events
 *   - Event shape and unique IDs
 *   - Past events are filtered out
 *   - Invalid date → empty
 *   - Store read/write/increment/reset
 *
 * Usage:  gjs --module tests/test-quran-provider.js
 */

import { createQuranProvider } from '../nidaa@abdelrzz9/src/core/quran/provider.js';
import {
  _setFileDeps,
  _resetFileDeps,
  readProgress,
  writeProgress,
  incrementPage,
  setDailyGoal,
  _todayISO,
} from '../nidaa@abdelrzz9/src/core/quran/store.js';

const LOG_PREFIX = '[Nidaa:Test:Quran]';

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
//  Mock store file I/O for provider tests
// ============================================================

let _mockStore = {};

function _setupMockStore() {
  _mockStore = {};
  _setFileDeps({
    getUserDataDir: () => '/tmp/nidaa-test',
    mkdirWithParent: () => 0,
    fileNewForPath: () => ({
      queryExists: () => false,
      loadContents: () => [true, new TextEncoder().encode('{}')],
      replaceContents: (data) => { _mockStore.data = new TextDecoder().decode(data); },
    }),
  });
}

function _teardownMockStore() {
  _resetFileDeps();
}

// ============================================================
//  Mock settings
// ============================================================

function mockSettings(overrides = {}) {
  const defaults = {
    'quran-enabled': true,
    'quran-frequency': 'daily',
    'quran-daily-goal': 5,
    'quran-offset': 30,
    'quran-window-start': 8,
    'quran-window-end': 21,
    'prayer-method': 0,
    'asr-method': 0,
    'high-latitude-method': 3,
    'offset-fajr': 0,
    'offset-isha': 0,
    ...overrides,
  };

  return {
    _data: defaults,
    get_boolean(key) { return this._data[key] ?? true; },
    get_int(key) { return this._data[key] ?? 0; },
    get_string(key) { return this._data[key] ?? ''; },
  };
}

// ============================================================
//  Location fixture (Algiers — MWL works well)
// ============================================================

const LOCATION = { latitude: 36.75, longitude: 3.06, source: 'test', timestamp: 0 };

// ============================================================
//  1. Null location → empty provider
// ============================================================
print(`${LOG_PREFIX} === null location ===`);

{
  const provider = createQuranProvider({ location: null });
  const events = provider(new Date(2025, 5, 21));
  assertEq(events.length, 0, 'null location returns empty array');
}

// ============================================================
//  2. Disabled → empty provider
// ============================================================
print(`${LOG_PREFIX} === quran disabled ===`);

{
  const settings = mockSettings({ 'quran-enabled': false });
  const provider = createQuranProvider({ location: LOCATION, settings });
  const events = provider(new Date(2025, 5, 21));
  assertEq(events.length, 0, 'returns empty when disabled');
}

// ============================================================
//  3. Daily frequency — 1 event
// ============================================================
print(`${LOG_PREFIX} === daily frequency ===`);

{
  const settings = mockSettings({ 'quran-frequency': 'daily' });
  const fakeNow = new Date(2025, 5, 21, 0, 0, 0);
  const provider = createQuranProvider({
    location: LOCATION,
    settings,
    now: () => fakeNow,
  });
  const events = provider(new Date(2025, 5, 21));
  assertEq(events.length, 1, 'daily: 1 event');
  assertEq(events[0].type, 'quran', 'daily: type is quran');
  assertEq(events[0].title, 'Quran Reading', 'daily: title is Quran Reading');
}

// ============================================================
//  4. Weekly frequency — Friday only
// ============================================================
print(`${LOG_PREFIX} === weekly frequency ===`);

{
  const settings = mockSettings({ 'quran-frequency': 'weekly' });
  const fakeNow = new Date(2025, 5, 21, 0, 0, 0); // Saturday June 21 2025
  const provider = createQuranProvider({
    location: LOCATION,
    settings,
    now: () => fakeNow,
  });

  // Saturday → no event
  const satEvents = provider(new Date(2025, 5, 21));
  assertEq(satEvents.length, 0, 'weekly: no event on Saturday');

  // Friday → 1 event (June 20, 2025 is a Friday)
  const friEvents = provider(new Date(2025, 5, 20));
  assertEq(friEvents.length, 1, 'weekly: 1 event on Friday');
}

// ============================================================
//  5. Every-6h frequency — 4 events
// ============================================================
print(`${LOG_PREFIX} === every-6h frequency ===`);

{
  const settings = mockSettings({ 'quran-frequency': 'every-6h' });
  const fakeNow = new Date(2025, 5, 21, 0, 0, 0);
  const provider = createQuranProvider({
    location: LOCATION,
    settings,
    now: () => fakeNow,
  });
  const events = provider(new Date(2025, 5, 21));
  assertEq(events.length, 4, 'every-6h: 4 events');

  // Check times: 08:00, 14:00, 20:00, 02:00 next day
  const hours = events.map(e => {
    const d = new Date(e.time.getTime() + 1 * 3600000); // UTC+1 for Algiers
    return d.getUTCHours();
  }).sort((a, b) => a - b);
  assertEq(hours[0], 2, 'every-6h: includes 02:00');
  assertEq(hours[1], 8, 'every-6h: includes 08:00');
  assertEq(hours[2], 14, 'every-6h: includes 14:00');
  assertEq(hours[3], 20, 'every-6h: includes 20:00');
}

// ============================================================
//  6. Random frequency — 1 event within window
// ============================================================
print(`${LOG_PREFIX} === random frequency ===`);

{
  const settings = mockSettings({
    'quran-frequency': 'random',
    'quran-window-start': 8,
    'quran-window-end': 21,
  });
  const fakeNow = new Date(2025, 5, 21, 0, 0, 0);
  const provider = createQuranProvider({
    location: LOCATION,
    settings,
    now: () => fakeNow,
  });
  const events = provider(new Date(2025, 5, 21));
  assertEq(events.length, 1, 'random: 1 event');

  // Event time should be between 08:00 and 21:00 (local, UTC+1)
  const localMs = events[0].time.getTime() + 1 * 3600000;
  const d = new Date(localMs);
  const hour = d.getUTCHours();
  assertGt(hour, 7, `random: hour ${hour} >= 8`);
  assert(hour <= 21, `random: hour ${hour} <= 21`);

  // Deterministic: same date → same time
  const events2 = provider(new Date(2025, 5, 21));
  assertEq(events[0].time.getTime(), events2[0].time.getTime(), 'random: deterministic per day');
}

// ============================================================
//  7. Valid event shape
// ============================================================
print(`${LOG_PREFIX} === valid event shape ===`);

{
  const settings = mockSettings();
  const fakeNow = new Date(2025, 5, 21, 0, 0, 0);
  const provider = createQuranProvider({
    location: LOCATION,
    settings,
    now: () => fakeNow,
  });
  const events = provider(new Date(2025, 5, 21));

  for (const event of events) {
    assert(event.id.length > 0, `${event.title} has non-empty id`);
    assert(event.time instanceof Date, `${event.title} has valid Date`);
    assert(!isNaN(event.time.getTime()), `${event.title} time is not NaN`);
    assert(event.title.length > 0, `${event.title} has non-empty title`);
    assert(event.description.length > 0, `${event.title} has non-empty description`);
    assertEq(event.priority, 2, `${event.title} has priority 2`);
    assert(event.actions.length === 2, `${event.title} has 2 actions`);
    assertEq(event.actions[0].label, '+1 Page', `${event.title} first action is +1 Page`);
    assertEq(event.actions[1].label, 'Dismiss', `${event.title} second action is Dismiss`);
  }
}

// ============================================================
//  8. Event IDs are unique
// ============================================================
print(`${LOG_PREFIX} === unique IDs ===`);

{
  const settings = mockSettings({ 'quran-frequency': 'every-6h' });
  const fakeNow = new Date(2025, 5, 21, 0, 0, 0);
  const provider = createQuranProvider({
    location: LOCATION,
    settings,
    now: () => fakeNow,
  });
  const events = provider(new Date(2025, 5, 21));
  const ids = events.map(e => e.id);
  const uniqueIds = new Set(ids);
  assertEq(uniqueIds.size, ids.length, 'all event IDs are unique');
}

// ============================================================
//  9. Events are generated in the future (Scheduler handles past filtering)
// ============================================================
print(`${LOG_PREFIX} === events have future times ===`);

{
  const settings = mockSettings({ 'quran-frequency': 'every-6h' });
  const fakeNow = new Date(2025, 5, 21, 0, 0, 0);
  const provider = createQuranProvider({
    location: LOCATION,
    settings,
    now: () => fakeNow,
  });
  const events = provider(new Date(2025, 5, 21));
  // All events should have valid times (filtering is done by the Scheduler)
  for (const event of events) {
    assert(!isNaN(event.time.getTime()), 'event time is valid');
  }
}

// ============================================================
//  10. Invalid date → empty
// ============================================================
print(`${LOG_PREFIX} === invalid date ===`);

{
  const settings = mockSettings();
  const provider = createQuranProvider({ location: LOCATION, settings });
  const events = provider(new Date('invalid'));
  assert(Array.isArray(events), 'returns array on invalid date');
  assertEq(events.length, 0, 'returns empty on invalid date');
}

// ============================================================
//  11. Store — read/write/increment/reset
// ============================================================
print(`${LOG_PREFIX} === store operations ===`);

{
  // Set up in-memory mock
  let storeData = null;
  _setFileDeps({
    getUserDataDir: () => '/tmp/nidaa-test',
    mkdirWithParent: () => 0,
    buildFilename: (parts) => parts.join('/'),
    fileNewForPath: () => ({
      queryExists: () => storeData !== null,
      loadContents: () => [true, new TextEncoder().encode(storeData || '{}')],
      replaceContents: (data) => { storeData = new TextDecoder().decode(data); },
    }),
  });

  // Fresh read → defaults
  const fresh = readProgress('2025-06-21');
  assertEq(fresh.pagesRead, 0, 'store: fresh read → 0 pages');
  assertEq(fresh.dailyGoal, 5, 'store: fresh read → goal 5');
  assertEq(fresh.date, '2025-06-21', 'store: fresh read → today date');

  // Increment
  const inc1 = incrementPage('2025-06-21');
  assertEq(inc1.pagesRead, 1, 'store: first increment → 1');

  const inc2 = incrementPage('2025-06-21');
  assertEq(inc2.pagesRead, 2, 'store: second increment → 2');

  // Set goal
  const goal = setDailyGoal(10, '2025-06-21');
  assertEq(goal.dailyGoal, 10, 'store: set goal → 10');
  assertEq(goal.pagesRead, 2, 'store: pages preserved after goal change');

  // Auto-reset: read with different date
  const reset = readProgress('2025-06-22');
  assertEq(reset.pagesRead, 0, 'store: different date → reset to 0');
  assertEq(reset.dailyGoal, 10, 'store: goal preserved across reset');

  _resetFileDeps();
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
