#!/usr/bin/env gjs --module
/*
 * Tests for src/core/events/index.js — Islamic events provider.
 *
 * Validates:
 *   - isFriday day-of-week helper
 *   - getNextIslamicEvent returns nearest event
 *   - Provider returns empty when settings null
 *   - Friday events on Thursday night, Friday morning/afternoon
 *   - Ashura events on Muharram 9 (day-before) and 10
 *   - Arafah events on Dhul Hijjah 8 (day-before) and 9
 *   - White Days events on 13th of Hijri month
 *   - Events respect enable/disable settings
 *   - Past events filtered out
 *
 * Usage:  gjs --module tests/test-events-provider.js
 */

import { createIslamicEventsProvider, getNextIslamicEvent, isFriday } from '../nidaa@abdelrzz9/src/core/events/index.js';
import { hijriToGregorian } from '../nidaa@abdelrzz9/src/core/hijri/index.js';

const LOG_PREFIX = '[Nidaa:Test:EventsProvider]';

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
    'events-friday-enabled': true,
    'events-friday-thursday-hour': 20,
    'events-friday-morning-hour': 9,
    'events-friday-afternoon-hour': 15,
    'events-ashura-enabled': true,
    'events-ashura-daybefore': true,
    'events-arafah-enabled': true,
    'events-arafah-daybefore': true,
    'events-whitedays-enabled': true,
    ...overrides,
  };
  return {
    get_boolean(key) { return !!store[key]; },
    get_int(key) { return typeof store[key] === 'number' ? store[key] : 0; },
    get_string(key) { return String(store[key] || ''); },
  };
}

// ============================================================
//  1. isFriday helper
// ============================================================
print(`${LOG_PREFIX} === isFriday ===`);

{
  const thursday = new Date(2024, 6, 11);
  assertEq(isFriday(thursday), false, 'Thursday returns false');

  const friday = new Date(2024, 6, 12);
  assertEq(isFriday(friday), true, 'Friday returns true');

  const saturday = new Date(2024, 6, 13);
  assertEq(isFriday(saturday), false, 'Saturday returns false');
}

// ============================================================
//  2. getNextIslamicEvent
// ============================================================
print(`${LOG_PREFIX} === getNextIslamicEvent ===`);

{
  // 5 Muharram 1446 → Ashura (5 days to 10th)
  const muh5 = hijriToGregorian(1446, 1, 5);
  const event1 = getNextIslamicEvent(muh5);
  assert(event1 !== null, 'returns event on 5 Muharram');
  assertEq(event1.name, 'Ashura', 'Ashura is next on 5 Muharram');
  assertEq(event1.daysLeft, 5, '5 days left to Ashura from 5 Muharram');

  // 25 Ramadan 1446 → nearest is Eid al-Fitr
  const ram25 = hijriToGregorian(1446, 9, 25);
  const event2 = getNextIslamicEvent(ram25);
  assert(event2 !== null, 'returns event on 25 Ramadan');
  assertEq(event2.name, 'Eid al-Fitr', 'Eid al-Fitr is next on 25 Ramadan');

  // 2 Dhul Hijjah 1446 → nearest is Arafah (7 days to 9th)
  const dh2 = hijriToGregorian(1446, 12, 2);
  const event3 = getNextIslamicEvent(dh2);
  assert(event3 !== null, 'returns event on 2 Dhul Hijjah');
  assertEq(event3.name, 'Arafah', 'Arafah is next on 2 Dhul Hijjah');
  assertEq(event3.daysLeft, 7, '7 days left to Arafah from 2 Dhul Hijjah');

  // Valid year check
  const hijri = getNextIslamicEvent(new Date(2024, 6, 8));
  assert(hijri !== null, 'returns event for known date');
}

// ============================================================
//  3. Provider returns empty when settings null
// ============================================================
print(`${LOG_PREFIX} === null settings ===`);

{
  const provider = createIslamicEventsProvider({ settings: null });
  const events = provider(new Date());
  assertEq(events.length, 0, 'null settings returns empty array');
}

// ============================================================
//  4. Friday events — Thursday night + Friday morning/afternoon
// ============================================================
print(`${LOG_PREFIX} === Friday events ===`);

{
  // Thursday night: 1 Thursday-reminder event
  const thursday8am = new Date(2024, 6, 11, 8, 0, 0, 0);
  const thursProvider = createIslamicEventsProvider({
    settings: mockSettings(),
    now: thursday8am,
  });
  const thursEvents = thursProvider(thursday8am);
  assertEq(thursEvents.length, 1, '1 Thursday night event');
  assert(thursEvents[0].id.startsWith('friday-thursday-'), 'Thursday event has correct id prefix');
  assert(thursEvents[0].title.includes('Tomorrow is Friday'), 'Thursday event title mentions Friday');
  assertEq(thursEvents[0].type, 'reminder', 'Thursday event type is reminder');

  // Friday before 9AM: 2 events (morning + afternoon)
  const friday6am = new Date(2024, 6, 12, 6, 0, 0, 0);
  const friProvider = createIslamicEventsProvider({
    settings: mockSettings(),
    now: friday6am,
  });
  const friEvents = friProvider(friday6am);
  assertEq(friEvents.length, 2, '2 Friday events (morning + afternoon)');

  const morningEvent = friEvents.find(e => e.id.startsWith('friday-morning-'));
  const afternoonEvent = friEvents.find(e => e.id.startsWith('friday-afternoon-'));
  assert(morningEvent !== undefined, 'Friday morning event exists');
  assert(afternoonEvent !== undefined, 'Friday afternoon event exists');
  assertEq(morningEvent.title, '📖 Read Surah Al-Kahf', 'Morning event title');
  assertEq(afternoonEvent.title, '🤲 Increase Salawat', 'Afternoon event title');
  assert(morningEvent.time instanceof Date, 'Morning event time is Date');
  assert(afternoonEvent.time instanceof Date, 'Afternoon event time is Date');

  // Friday at 10AM (after morning at 9AM, before afternoon at 3PM): 1 event (afternoon only)
  const friday10am = new Date(2024, 6, 12, 10, 0, 0, 0);
  const lateProvider = createIslamicEventsProvider({
    settings: mockSettings(),
    now: friday10am,
  });
  const lateEvents = lateProvider(friday10am);
  assertEq(lateEvents.length, 1, '1 Friday event at 10AM (afternoon only)');
  assert(lateEvents[0].id.startsWith('friday-afternoon-'), 'Late Friday event is afternoon');
}

// ============================================================
//  5. Ashura events — Muharram 9 (day-before) and 10
// ============================================================
print(`${LOG_PREFIX} === Ashura events ===`);

{
  // Day before Ashura: Muharram 9 at 8AM → day-before event at 9AM
  const muh9 = hijriToGregorian(1446, 1, 9);
  muh9.setHours(8, 0, 0, 0);
  const ashuraBeforeProvider = createIslamicEventsProvider({
    settings: mockSettings(),
    now: muh9,
  });
  const beforeEvents = ashuraBeforeProvider(muh9);
  assertEq(beforeEvents.length, 1, '1 event on Muharram 9 (day-before)');
  assert(beforeEvents[0].id.startsWith('ashura-before-'), 'Muharram 9 event is day-before');
  assert(beforeEvents[0].title.includes('Tomorrow is Ashura'), 'Day-before title mentions tomorrow');
  assertEq(beforeEvents[0].priority, 6, 'Day-before Ashura priority is 6');

  // Ashura day: Muharram 10 at 8AM → Ashura event at 9AM
  const muh10 = hijriToGregorian(1446, 1, 10);
  muh10.setHours(8, 0, 0, 0);
  const ashuraProvider = createIslamicEventsProvider({
    settings: mockSettings(),
    now: muh10,
  });
  const ashuraEvents = ashuraProvider(muh10);
  assertEq(ashuraEvents.length, 1, '1 event on Muharram 10 (Ashura)');
  assert(ashuraEvents[0].id.startsWith('ashura-'), 'Muharram 10 event is Ashura');
  assert(ashuraEvents[0].title.includes('Today is Ashura'), 'Ashura title');
  assertEq(ashuraEvents[0].priority, 7, 'Ashura priority is 7');
}

// ============================================================
//  6. Arafah events — Dhul Hijjah 8 (day-before) and 9
// ============================================================
print(`${LOG_PREFIX} === Arafah events ===`);

{
  // Day before Arafah: Dhul Hijjah 8 at 8AM → day-before event
  // (Note: 8 Dhul Hijjah 1446 = Thursday, so Friday events may also appear)
  const dh8 = hijriToGregorian(1446, 12, 8);
  dh8.setHours(8, 0, 0, 0);
  const arafahBeforeProvider = createIslamicEventsProvider({
    settings: mockSettings(),
    now: dh8,
  });
  const beforeEvents = arafahBeforeProvider(dh8);
  const beforeArafah = beforeEvents.find(e => e.id.startsWith('arafah-before-'));
  assert(beforeArafah !== undefined, 'Day-before Arafah event exists');
  assert(beforeArafah.id.startsWith('arafah-before-'), 'Dhul Hijjah 8 event is day-before');
  assert(beforeArafah.title.includes('Tomorrow is the Day of Arafah'), 'Day-before title');
  assertEq(beforeArafah.priority, 6, 'Day-before Arafah priority is 6');

  // Arafah day: Dhul Hijjah 9 at 8AM → Arafah event
  // (Note: 9 Dhul Hijjah 1446 = Friday, so Friday events also appear)
  const dh9 = hijriToGregorian(1446, 12, 9);
  dh9.setHours(8, 0, 0, 0);
  const arafahProvider = createIslamicEventsProvider({
    settings: mockSettings(),
    now: dh9,
  });
  const arafahEvents = arafahProvider(dh9);
  const arafahEvent = arafahEvents.find(e => e.id.startsWith('arafah-') && !e.id.startsWith('arafah-before-'));
  assert(arafahEvent !== undefined, 'Arafah event exists');
  assert(arafahEvent.id.startsWith('arafah-'), 'Dhul Hijjah 9 event is Arafah');
  assert(arafahEvent.title.includes('Today is the Day of Arafah'), 'Arafah title');
  assertEq(arafahEvent.priority, 7, 'Arafah priority is 7');
}

// ============================================================
//  7. White Days — 13th of Hijri month
// ============================================================
print(`${LOG_PREFIX} === White Days ===`);

{
  // 13 Muharram 1446 at 8AM → White Days event at 9AM
  const day13 = hijriToGregorian(1446, 1, 13);
  day13.setHours(8, 0, 0, 0);
  const whiteProvider = createIslamicEventsProvider({
    settings: mockSettings(),
    now: day13,
  });
  const whiteEvents = whiteProvider(day13);
  assertEq(whiteEvents.length, 1, '1 White Days event on 13th');
  assert(whiteEvents[0].id.startsWith('whitedays-'), 'White Days event correct id prefix');
  assert(whiteEvents[0].title.includes('White Days'), 'White Days title');
  assertEq(whiteEvents[0].priority, 4, 'White Days priority is 4');

  // 14th of the month should NOT generate a White Days event
  const day14 = hijriToGregorian(1446, 1, 14);
  day14.setHours(8, 0, 0, 0);
  const noWhiteProvider = createIslamicEventsProvider({
    settings: mockSettings(),
    now: day14,
  });
  const noWhiteEvents = noWhiteProvider(day14);
  const whiteIds = noWhiteEvents.filter(e => e.id.startsWith('whitedays-'));
  assertEq(whiteIds.length, 0, 'No White Days event on 14th');
}

// ============================================================
//  8. Events respect enable/disable settings
// ============================================================
print(`${LOG_PREFIX} === enable/disable settings ===`);

{
  // Friday disabled → no Friday events on Friday
  const disabledFriSettings = mockSettings({ 'events-friday-enabled': false });
  const friday6am = new Date(2024, 6, 12, 6, 0, 0, 0);
  const disabledFriProvider = createIslamicEventsProvider({
    settings: disabledFriSettings,
    now: friday6am,
  });
  const friEvents = disabledFriProvider(friday6am);
  const fridayIds = friEvents.filter(e =>
    e.id.startsWith('friday-morning-') || e.id.startsWith('friday-afternoon-') || e.id.startsWith('friday-thursday-')
  );
  assertEq(fridayIds.length, 0, 'No Friday events when disabled');

  // Ashura disabled → no Ashura events on Muharram 10
  const disabledAshuraSettings = mockSettings({ 'events-ashura-enabled': false });
  const muh10 = hijriToGregorian(1446, 1, 10);
  muh10.setHours(8, 0, 0, 0);
  const disabledAshuraProvider = createIslamicEventsProvider({
    settings: disabledAshuraSettings,
    now: muh10,
  });
  const ashuraDisabled = disabledAshuraProvider(muh10);
  const ashuraIds = ashuraDisabled.filter(e => e.id.startsWith('ashura-'));
  assertEq(ashuraIds.length, 0, 'No Ashura event when disabled');

  // Day-before disabled → no day-before event on Muharram 9
  const noDayBefore = mockSettings({ 'events-ashura-daybefore': false });
  const muh9 = hijriToGregorian(1446, 1, 9);
  muh9.setHours(8, 0, 0, 0);
  const noDayBeforeProvider = createIslamicEventsProvider({
    settings: noDayBefore,
    now: muh9,
  });
  const noDayBeforeEvents = noDayBeforeProvider(muh9);
  const beforeIds = noDayBeforeEvents.filter(e => e.id.startsWith('ashura-before-'));
  assertEq(beforeIds.length, 0, 'No day-before Ashura when disabled');

  // Arafah disabled → no Arafah events on Dhul Hijjah 9
  const disabledArafah = mockSettings({ 'events-arafah-enabled': false });
  const dh9 = hijriToGregorian(1446, 12, 9);
  dh9.setHours(8, 0, 0, 0);
  const disabledArafahProvider = createIslamicEventsProvider({
    settings: disabledArafah,
    now: dh9,
  });
  const arafahDisabled = disabledArafahProvider(dh9);
  const arafahIds = arafahDisabled.filter(e => e.id.startsWith('arafah-'));
  assertEq(arafahIds.length, 0, 'No Arafah event when disabled');

  // White Days disabled → no White Days on 13th
  const disabledWhite = mockSettings({ 'events-whitedays-enabled': false });
  const day13 = hijriToGregorian(1446, 1, 13);
  day13.setHours(8, 0, 0, 0);
  const disabledWhiteProvider = createIslamicEventsProvider({
    settings: disabledWhite,
    now: day13,
  });
  const whiteDisabled = disabledWhiteProvider(day13);
  const whiteIds = whiteDisabled.filter(e => e.id.startsWith('whitedays-'));
  assertEq(whiteIds.length, 0, 'No White Days event when disabled');
}

// ============================================================
//  9. Past events are filtered out
// ============================================================
print(`${LOG_PREFIX} === past events filtered ===`);

{
  // Friday at 4PM (after afternoon event at 3PM) → no Friday events
  const friday4pm = new Date(2024, 6, 12, 16, 0, 0, 0);
  const pastProvider = createIslamicEventsProvider({
    settings: mockSettings(),
    now: friday4pm,
  });
  const pastEvents = pastProvider(friday4pm);
  const fridayIds = pastEvents.filter(e =>
    e.id.startsWith('friday-morning-') || e.id.startsWith('friday-afternoon-')
  );
  assertEq(fridayIds.length, 0, 'No Friday events when past 3PM');

  // Thursday at 10PM (after Thursday night event at 8PM) → no Thursday event
  const thursday10pm = new Date(2024, 6, 11, 22, 0, 0, 0);
  const lateThursdayProvider = createIslamicEventsProvider({
    settings: mockSettings(),
    now: thursday10pm,
  });
  const lateThursdayEvents = lateThursdayProvider(thursday10pm);
  const thursIds = lateThursdayEvents.filter(e => e.id.startsWith('friday-thursday-'));
  assertEq(thursIds.length, 0, 'No Thursday event when past 8PM');
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
