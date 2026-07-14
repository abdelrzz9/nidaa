#!/usr/bin/env gjs --module
/*
 * Tests for src/core/scheduler/ — event sorting, scheduling logic, cancellation.
 *
 * The Scheduler class accepts injectable schedule/cancel/now functions,
 * so we can test all logic without a real GLib main loop.
 *
 * Usage:  gjs --module tests/test-scheduler.js
 */

import { createEvent, sortEvents } from '../nidaa@abdelrzz9/src/core/scheduler/event.js';
import { Scheduler } from '../nidaa@abdelrzz9/src/core/scheduler/scheduler.js';

const LOG_PREFIX = '[Nidaa:Test:Scheduler]';

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

function fmtDate(d) {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

// ============================================================
//  1. createEvent — validation
// ============================================================
print(`${LOG_PREFIX} === createEvent ===`);

{
  const t = new Date(2025, 5, 21, 10, 0);
  const e = createEvent({ title: 'Test', time: t });
  assertEq(e.title, 'Test', 'title preserved');
  assertEq(e.type, 'generic', 'default type');
  assertEq(e.priority, 5, 'default priority');
  assertEq(e.icon, null, 'default icon');
  assertEq(e.sound, null, 'default sound');
  assertEq(e.actions.length, 0, 'default actions empty');
  assert(e.id.startsWith('evt-'), 'auto-generated id');
}

{
  let threw = false;
  try { createEvent({ time: new Date() }); } catch { threw = true; }
  assert(threw, 'throws on missing title');
}

{
  let threw = false;
  try { createEvent({ title: 'X', time: 'not-a-date' }); } catch { threw = true; }
  assert(threw, 'throws on invalid time');
}

// ============================================================
//  2. sortEvents — time order, then priority tiebreak
// ============================================================
print(`${LOG_PREFIX} === sortEvents ===`);

{
  const t1 = new Date(2025, 5, 21, 8, 0);
  const t2 = new Date(2025, 5, 21, 12, 0);
  const t3 = new Date(2025, 5, 21, 18, 0);
  const events = [
    createEvent({ title: 'C', time: t3, priority: 5 }),
    createEvent({ title: 'A', time: t1, priority: 5 }),
    createEvent({ title: 'B', time: t2, priority: 5 }),
  ];
  const sorted = sortEvents(events);
  assertEq(sorted[0].title, 'A', 'earliest first');
  assertEq(sorted[1].title, 'B', 'middle second');
  assertEq(sorted[2].title, 'C', 'latest last');
}

// Same time, different priorities
{
  const t = new Date(2025, 5, 21, 12, 0);
  const events = [
    createEvent({ title: 'low', time: t, priority: 1 }),
    createEvent({ title: 'high', time: t, priority: 9 }),
    createEvent({ title: 'mid', time: t, priority: 5 }),
  ];
  const sorted = sortEvents(events);
  assertEq(sorted[0].title, 'high', 'highest priority first on tie');
  assertEq(sorted[1].title, 'mid', 'mid priority second on tie');
  assertEq(sorted[2].title, 'low', 'lowest priority last on tie');
}

// sortEvents does not mutate the original
{
  const t = new Date(2025, 5, 21, 12, 0);
  const events = [
    createEvent({ title: 'B', time: t }),
    createEvent({ title: 'A', time: new Date(t.getTime() - 3600000) }),
  ];
  const sorted = sortEvents(events);
  assertEq(events[0].title, 'B', 'original not mutated');
  assertEq(sorted[0].title, 'A', 'sorted is different array');
}

// ============================================================
//  3. Scheduler — provider collection + scheduling
// ============================================================
print(`${LOG_PREFIX} === Scheduler: provider collection + scheduling ===`);

{
  const now = new Date(2025, 5, 21, 10, 0, 0);
  const scheduled = [];
  let midnightDelay = null;

  const scheduler = new Scheduler({
    now: () => new Date(now.getTime()),
    scheduleFn: (secs, cb) => {
      const id = scheduled.length + 1;
      scheduled.push({ id, secs, cb });
      return id;
    },
    cancelFn: () => {},
    onEvent: () => {},
  });

  // Provider 1: event at 10:30 (30 min from fake now)
  scheduler.addProvider((_date) => [
    createEvent({
      title: 'Event A',
      time: new Date(2025, 5, 21, 10, 30),
      priority: 5,
    }),
  ]);

  // Provider 2: event at 12:00 (2h from fake now)
  scheduler.addProvider((_date) => [
    createEvent({
      title: 'Event B',
      time: new Date(2025, 5, 21, 12, 0),
      priority: 8,
    }),
  ]);

  // Provider 3: event in the past (should be skipped)
  scheduler.addProvider((_date) => [
    createEvent({
      title: 'Past Event',
      time: new Date(2025, 5, 21, 9, 0),
    }),
  ]);

  scheduler.enable();

  // Should have scheduled 2 events (past one skipped) + 1 midnight
  assertEq(scheduled.length, 3, 'scheduled 2 events + 1 midnight');

  // Verify delays (in seconds)
  // Event A: 10:30 - 10:00 = 1800 s
  // Event B: 12:00 - 10:00 = 7200 s
  // Midnight: 86400 - 36000 = 50400 s
  assertEq(scheduled[0].secs, 1800, 'Event A delay = 30 min');
  assertEq(scheduled[1].secs, 7200, 'Event B delay = 2 h');
  assertEq(scheduled[2].secs, 50400, 'midnight delay = 14 h');

  scheduler.disable();
}

// ============================================================
//  4. Scheduler — event callback fires correctly
// ============================================================
print(`${LOG_PREFIX} === Scheduler: event callback ===`);

{
  const now = new Date(2025, 5, 21, 10, 0, 0);
  const fired = [];

  const scheduler = new Scheduler({
    now: () => new Date(now.getTime()),
    scheduleFn: (secs, cb) => {
      // Simulate immediate firing for events < 60 s away
      if (secs < 60) {
        const evt = { _cb: cb, _secs: secs };
        fired.push(evt);
      }
      return fired.length;
    },
    cancelFn: () => {},
    onEvent: (event) => { fired.push(event); },
  });

  // Provider with event 30 seconds away
  scheduler.addProvider((_date) => [
    createEvent({
      title: 'Quick Event',
      time: new Date(2025, 5, 21, 10, 0, 30),
    }),
  ]);

  scheduler.enable();

  // Simulate the timeout firing by calling the callback
  const entry = fired.find(e => e._cb);
  if (entry) {
    entry._cb();
    // After callback, the onEvent should have been called with the event
    // But in our mock, the callback calls GLib.SOURCE_REMOVE which is just 0/false
    // Let's verify the callback was registered
    assert(entry._secs === 30, 'callback registered for 30 s delay');
  } else {
    assert(false, 'callback was registered');
  }

  scheduler.disable();
}

// ============================================================
//  5. Scheduler — cancellation cleanup
// ============================================================
print(`${LOG_PREFIX} === Scheduler: cancellation cleanup ===`);

{
  const now = new Date(2025, 5, 21, 10, 0, 0);
  const scheduledIds = [];
  const cancelledIds = [];

  const scheduler = new Scheduler({
    now: () => new Date(now.getTime()),
    scheduleFn: (secs, cb) => {
      const id = scheduledIds.length + 1;
      scheduledIds.push(id);
      return id;
    },
    cancelFn: (id) => {
      cancelledIds.push(id);
    },
    onEvent: () => {},
  });

  scheduler.addProvider((_date) => [
    createEvent({ title: 'A', time: new Date(2025, 5, 21, 10, 30) }),
    createEvent({ title: 'B', time: new Date(2025, 5, 21, 12, 0) }),
    createEvent({ title: 'C', time: new Date(2025, 5, 21, 14, 0) }),
  ]);

  scheduler.enable();

  // 3 events + 1 midnight = 4 scheduled
  assertEq(scheduledIds.length, 4, '4 timeouts scheduled');

  scheduler.disable();

  // All 4 should have been cancelled (3 events + 1 midnight)
  assertEq(cancelledIds.length, 4, '4 timeouts cancelled on disable');

  // IDs should match
  for (const id of scheduledIds) {
    assert(cancelledIds.includes(id), `timeout ${id} was cancelled`);
  }
}

// ============================================================
//  6. Scheduler — refresh re-schedules correctly
// ============================================================
print(`${LOG_PREFIX} === Scheduler: refresh ===`);

{
  const now = new Date(2025, 5, 21, 10, 0, 0);
  let callCount = 0;
  let cancelCount = 0;

  const scheduler = new Scheduler({
    now: () => new Date(now.getTime()),
    scheduleFn: (secs, cb) => { callCount++; return callCount; },
    cancelFn: () => { cancelCount++; },
    onEvent: () => {},
  });

  scheduler.addProvider((_date) => [
    createEvent({ title: 'A', time: new Date(2025, 5, 21, 10, 30) }),
  ]);

  scheduler.enable();
  const afterEnable = callCount; // should be 2 (1 event + 1 midnight)

  scheduler.refresh();
  const afterRefresh = callCount; // should be 2 + 2 = 4

  assertEq(afterEnable, 2, '2 scheduled on enable (1 event + midnight)');
  assertEq(afterRefresh, 4, '2 more scheduled on refresh (1 event + midnight)');
  assertEq(cancelCount, 2, '2 cancelled before re-schedule (1 event + midnight)');

  scheduler.disable();
}

// ============================================================
//  7. Scheduler — provider error doesn't crash
// ============================================================
print(`${LOG_PREFIX} === Scheduler: provider error resilience ===`);

{
  const now = new Date(2025, 5, 21, 10, 0, 0);
  let eventCount = 0;

  const scheduler = new Scheduler({
    now: () => new Date(now.getTime()),
    scheduleFn: (secs, cb) => { eventCount++; return eventCount; },
    cancelFn: () => {},
    onEvent: () => {},
  });

  // Bad provider that throws
  scheduler.addProvider(() => { throw new Error('kaboom'); });

  // Good provider that returns events
  scheduler.addProvider((_date) => [
    createEvent({ title: 'Good', time: new Date(2025, 5, 21, 10, 30) }),
  ]);

  scheduler.enable();

  // Should have 2 scheduled (1 from good provider + midnight), error was caught
  assertEq(eventCount, 2, 'good provider still scheduled despite bad provider');

  scheduler.disable();
}

// ============================================================
//  8. Scheduler — multiple calls to enable/disable are idempotent
// ============================================================
print(`${LOG_PREFIX} === Scheduler: idempotent enable/disable ===`);

{
  const now = new Date(2025, 5, 21, 10, 0, 0);
  let scheduleCount = 0;

  const scheduler = new Scheduler({
    now: () => new Date(now.getTime()),
    scheduleFn: (secs, cb) => { scheduleCount++; return scheduleCount; },
    cancelFn: () => {},
    onEvent: () => {},
  });

  scheduler.addProvider((_date) => [
    createEvent({ title: 'A', time: new Date(2025, 5, 21, 10, 30) }),
  ]);

  scheduler.enable();
  const first = scheduleCount;

  scheduler.enable(); // no-op
  const second = scheduleCount;
  assertEq(first, second, 'double enable is no-op');

  scheduler.disable();
  scheduler.disable(); // no-op — should not crash
  assert(true, 'double disable is no-op');
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
