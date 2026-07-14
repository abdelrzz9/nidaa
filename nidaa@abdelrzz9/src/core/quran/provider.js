/*
 * Quran reading event provider.
 *
 * Implements the Scheduler provider protocol: (date: Date) => Event[]
 *
 * Generates reminder events based on 6 configurable frequency modes:
 *   - daily:       once per day at a fixed hour
 *   - weekly:      once per week on Fridays
 *   - after-fajr:  offset minutes after Fajr prayer
 *   - after-isha:  offset minutes after Isha prayer
 *   - every-6h:    four events spaced 6h apart (08:00, 14:00, 20:00, 02:00)
 *   - random:      one event at a deterministic-random time within a window
 *
 * The "+1 Page" action on each notification calls store.incrementPage(),
 * which persists the count to ~/.local/share/nidaa/quran-progress.json.
 *
 * Zero GNOME Shell dependencies — pure ESM, testable via GJS.
 */

import { calculatePrayerTimes } from '../prayer/times.js';
import { getMethodParams } from '../prayer/methods.js';
import { createEvent } from '../scheduler/event.js';
import { incrementPage } from './store.js';
import { _ } from '../i18n/index.js';

const LOG_PREFIX = '[Nidaa:Quran:Provider]';

// ------------------------------------------------------------------
//  Constants
// ------------------------------------------------------------------

const QURAN_PRIORITY = 2;

const NOTIFICATION_TITLE = _('Quran Reading');
const NOTIFICATION_BODY = _('📖 Have you read Quran today?\nEven one page is progress.');

// ------------------------------------------------------------------
//  GSettings helpers (same pattern as prayer/adhkar providers)
// ------------------------------------------------------------------

function _bool(settings, key, fallback) {
  try {
    return settings ? settings.get_boolean(key) : fallback;
  } catch {
    return fallback;
  }
}

function _int(settings, key, fallback) {
  try {
    return settings ? settings.get_int(key) : fallback;
  } catch {
    return fallback;
  }
}

function _string(settings, key, fallback) {
  try {
    return settings ? settings.get_string(key) : fallback;
  } catch {
    return fallback;
  }
}

// ------------------------------------------------------------------
//  Timezone helper
// ------------------------------------------------------------------

function localTimezoneOffset() {
  const now = new Date();
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const localMinutes = now.getHours() * 60 + now.getMinutes();
  let diff = (localMinutes - utcMinutes) / 60;
  if (diff > 12) diff -= 24;
  if (diff < -12) diff += 24;
  return diff;
}

// ------------------------------------------------------------------
//  Deterministic hash for random scheduling
// ------------------------------------------------------------------

/**
 * Simple hash of a string → non-negative integer.
 * Used so the same date always produces the same "random" time.
 */
function _hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// ------------------------------------------------------------------
//  Prayer time calculation (for after-fajr / after-isha modes)
// ------------------------------------------------------------------

function _resolveMethod(settings) {
  const METHODS_BY_IDX = ['MWL', 'ISNA', 'Egypt', 'UmmAlQura', 'Karachi', 'Tehran', 'Jafari', 'Custom'];
  const idx = _int(settings, 'prayer-method', 0);
  return METHODS_BY_IDX[idx] || 'MWL';
}

function _resolveMadhab(settings) {
  const idx = _int(settings, 'asr-method', 0);
  return idx === 1 ? 'Hanafi' : 'Shafii';
}

function _resolveHighLat(settings) {
  const RULES = ['None', 'MiddleOfNight', 'OneSeventh', 'AngleBased'];
  const idx = _int(settings, 'high-latitude-method', 3);
  return RULES[idx] || 'AngleBased';
}

function _calcPrayerTime(times, settings, location, date, prayer) {
  const methodId = _resolveMethod(settings);
  const methodParams = getMethodParams({ method: methodId });
  const customFajrAngle = methodId === 'Custom' ? _int(settings, 'fajr-angle', 18) : undefined;
  const customIshaAngle = methodId === 'Custom' ? _int(settings, 'isha-angle', 17) : undefined;

  const calculated = calculatePrayerTimes({
    latitude: location.latitude,
    longitude: location.longitude,
    timezone: localTimezoneOffset(),
    date,
    method: methodId,
    madhab: _resolveMadhab(settings),
    highLatitudeRule: _resolveHighLat(settings),
    customFajrAngle,
    customIshaAngle,
  });

  const prayerTime = calculated[prayer];
  if (!prayerTime) return null;

  const offsetMinutes = _int(settings, `offset-${prayer}`, 0);
  return offsetMinutes !== 0
    ? new Date(prayerTime.getTime() + offsetMinutes * 60_000)
    : prayerTime;
}

// ------------------------------------------------------------------
//  Provider factory
// ------------------------------------------------------------------

/**
 * Create a Quran reading event provider.
 *
 * @param {object}   opts
 * @param {object}   opts.location - { latitude, longitude }
 * @param {object}   [opts.settings] - GSettings
 * @param {Function} [opts.now] - Injectable clock for testing
 * @returns {(date: Date) => Event[]}
 */
export function createQuranProvider({ location, settings, now: injectableNow }) {
  if (!location) {
    console.warn(`${LOG_PREFIX} no location — provider will return empty arrays`);
    return () => [];
  }

  return function quranProvider(date) {
    const _now = injectableNow ? injectableNow() : new Date();
    const events = [];

    if (!(date instanceof Date) || isNaN(date.getTime())) {
      console.warn(`${LOG_PREFIX} invalid date — returning empty`);
      return [];
    }

    // --- Read settings ---
    const enabled = _bool(settings, 'quran-enabled', true);
    if (!enabled) {
      console.log(`${LOG_PREFIX} quran reminders disabled`);
      return [];
    }

    const frequency = _string(settings, 'quran-frequency', 'daily');
    const offset = _int(settings, 'quran-offset', 30);
    const windowStart = _int(settings, 'quran-window-start', 8);
    const windowEnd = _int(settings, 'quran-window-end', 21);

    // --- Build events based on frequency ---
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayOfWeek = dayStart.getDay(); // 0=Sun, 5=Fri

    switch (frequency) {
      case 'daily':
        events.push(_makeEvent(dayStart, 9, 0)); // 09:00 daily
        break;

      case 'weekly':
        if (dayOfWeek === 5) { // Friday
          events.push(_makeEvent(dayStart, 9, 0));
        }
        break;

      case 'after-fajr': {
        const fajrTime = _calcPrayerTime(null, settings, location, dayStart, 'fajr');
        if (fajrTime) {
          const eventTime = new Date(fajrTime.getTime() + offset * 60_000);
          if (eventTime.getTime() > _now.getTime()) {
            events.push(_makeEventFromDate(eventTime));
          }
        }
        break;
      }

      case 'after-isha': {
        const ishaTime = _calcPrayerTime(null, settings, location, dayStart, 'isha');
        if (ishaTime) {
          const eventTime = new Date(ishaTime.getTime() + offset * 60_000);
          if (eventTime.getTime() > _now.getTime()) {
            events.push(_makeEventFromDate(eventTime));
          }
        }
        break;
      }

      case 'every-6h':
        // 08:00, 14:00, 20:00, 02:00 (next day)
        for (const h of [8, 14, 20]) {
          events.push(_makeEvent(dayStart, h, 0));
        }
        // 02:00 is technically the next calendar day but same "wake cycle"
        {
          const nextDay = new Date(dayStart);
          nextDay.setDate(nextDay.getDate() + 1);
          events.push(_makeEvent(nextDay, 2, 0));
        }
        break;

      case 'random': {
        const startHour = Math.max(0, Math.min(23, windowStart));
        const endHour = Math.max(startHour + 1, Math.min(24, windowEnd));
        const rangeMinutes = (endHour - startHour) * 60;
        const hash = _hashString(dayStart.toISOString().slice(0, 10));
        const minuteOfDay = startHour * 60 + (hash % rangeMinutes);
        const h = Math.floor(minuteOfDay / 60);
        const m = minuteOfDay % 60;
        events.push(_makeEvent(dayStart, h, m));
        break;
      }

      default:
        console.warn(`${LOG_PREFIX} unknown frequency "${frequency}" — defaulting to daily`);
        events.push(_makeEvent(dayStart, 9, 0));
    }

    console.log(
      `${LOG_PREFIX} generated ${events.length} event(s) for ` +
      `${dayStart.toISOString().slice(0, 10)} [${frequency}]`
    );

    return events;
  };
}

// ------------------------------------------------------------------
//  Event builders
// ------------------------------------------------------------------

function _makeEvent(dayStart, hour, minute) {
  const time = new Date(dayStart);
  time.setHours(hour, minute, 0, 0);
  return _makeEventFromDate(time);
}

function _makeEventFromDate(time) {
  return createEvent({
    id: `quran-reminder-${time.getTime()}`,
    type: 'quran',
    title: NOTIFICATION_TITLE,
    description: NOTIFICATION_BODY,
    time,
    priority: QURAN_PRIORITY,
    icon: 'accessories-dictionary-symbolic',
    sound: null,
    actions: [
      {
        label: _('+1 Page'),
        callback: () => {
          const progress = incrementPage();
          console.log(
            `${LOG_PREFIX} +1 page → ${progress.pagesRead}/${progress.dailyGoal}`
          );
        },
      },
      {
        label: _('Dismiss'),
        callback: () => {},
      },
    ],
  });
}
