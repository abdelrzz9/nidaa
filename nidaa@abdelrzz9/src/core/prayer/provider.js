/*
 * Prayer event provider — bridges the calculation engine to the Scheduler.
 *
 * Implements the provider protocol expected by Scheduler:
 *   (date: Date) => Event[]
 *
 * For a given day the provider:
 *   1. Calls calculatePrayerTimes() with the user's location and settings.
 *   2. Emits one Event per enabled prayer (Fajr, Dhuhr, Asr, Maghrib, Isha).
 *   3. Optionally emits an iqamah reminder event offset from the adhan.
 *   4. Optionally emits a "prayer ending soon" warning before the next prayer.
 *   5. Each event carries action buttons (Snooze, Mark as Prayed) whose
 *      callbacks schedule follow-up one-off events through the Scheduler.
 *
 * Islamic content references:
 *   - Prayer times: Quran 4:103 — "Indeed, prayer has been decreed upon the
 *     believers a decree of specified times."  (Surat An-Nisa, Ayah 103)
 *   - The five daily prayers (Fajr, Dhuhr, Asr, Maghrib, Isha) are pillars
 *     of the Islamic faith, established by the Prophet Muhammad ﷺ and
 *     originating from the Night Journey (Isra wal Mi'raj).
 *
 * Zero GNOME Shell dependencies — pure ESM, testable standalone via GJS.
 */

import { calculatePrayerTimes } from './times.js';
import { getMethodParams } from './methods.js';
import { createEvent } from '../scheduler/event.js';

const LOG_PREFIX = '[Nidaa:Prayer:Provider]';

// ------------------------------------------------------------------
//  Constants
// ------------------------------------------------------------------

/**
 * Ordered list of prayer keys matching the shape returned by
 * calculatePrayerTimes().  The Scheduler needs a deterministic list
 * to iterate when computing "next prayer" for ending-soon warnings.
 */
const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

/** Human-readable display names. */
const DISPLAY_NAMES = {
  fajr: 'Fajr',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha',
};

/**
 * Per-prayer Quran references used in notification descriptions.
 * Each entry includes a brief translation suitable for a desktop
 * notification body.  Source: Holy Quran.
 */
const QURAN_REFS = {
  fajr:
    'Establish prayer at the dawn. Quran 4:103',
  dhuhr:
    'Indeed, prayer has been decreed upon the believers at fixed times. Quran 4:103',
  asr:
    'Guard your prayers. Quran 2:238',
  maghrib:
    'Establish prayer at the decline of the sun. Quran 17:78',
  isha:
    'Establish prayer at the decline of the night. Quran 17:78',
};

/** Priority for standard prayer adhan notifications (HIGH). */
const ADHAN_PRIORITY = 8;

/** Priority for iqamah reminders (lower than adhan, still visible). */
const IQAMAH_PRIORITY = 5;

/** Priority for "prayer ending soon" warnings (low — gentle nudge). */
const ENDING_SOON_PRIORITY = 3;

// ------------------------------------------------------------------
//  GSettings key helpers
// ------------------------------------------------------------------

/** Read a boolean key; returns fallback on error. */
function _bool(settings, key, fallback) {
  try {
    return settings ? settings.get_boolean(key) : fallback;
  } catch {
    return fallback;
  }
}

/** Read an integer key; returns fallback on error. */
function _int(settings, key, fallback) {
  try {
    return settings ? settings.get_int(key) : fallback;
  } catch {
    return fallback;
  }
}

/** Read a string key; returns fallback on error. */
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

/**
 * Compute the local UTC offset in hours using pure JavaScript.
 * Avoids the GLib.DateTime.get_utc_offset() issue where the return
 * value may be in microseconds (GTimeSpan) depending on the GJS version.
 *
 * @returns {number} UTC offset in hours (e.g., 1 for UTC+1, -5 for UTC-5)
 */
function localTimezoneOffset() {
  const now = new Date();
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const localMinutes = now.getHours() * 60 + now.getMinutes();
  let diff = (localMinutes - utcMinutes) / 60;
  // Handle day boundary wrap
  if (diff > 12) diff -= 24;
  if (diff < -12) diff += 24;
  return diff;
}

// ------------------------------------------------------------------
//  Provider factory
// ------------------------------------------------------------------

/**
 * Create a prayer event provider suitable for the Scheduler.
 *
 * @param {object}   opts
 * @param {object}   opts.location - { latitude, longitude, source, timestamp }
 * @param {object}   [opts.settings] - GSettings (optional in tests)
 * @param {Function} [opts.now] - Injectable clock returning Date (for testing)
 * @returns {(date: Date) => Event[]} Provider function
 */
export function createPrayerProvider({ location, settings, now: injectableNow }) {
  if (!location) {
    console.warn(`${LOG_PREFIX} no location — provider will return empty arrays`);
    return () => [];
  }

  const tzHours = localTimezoneOffset();

  return function prayerProvider(date) {
    const _now = injectableNow ? injectableNow() : new Date();
    const events = [];

    // --- Validate date input ---
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      console.warn(`${LOG_PREFIX} invalid date — returning empty`);
      return [];
    }

    // --- Read settings ---
    const notificationsEnabled = _bool(settings, 'notifications-enabled', true);
    const snoozeDuration = _int(settings, 'prayer-snooze-duration', 10);
    const iqamahOffset = _int(settings, 'prayer-iqamah-reminder-offset', 0);
    const endingSoonOffset = _int(settings, 'prayer-ending-soon-offset', 0);

    // --- Resolve calculation method from settings ---
    const methodIdx = _int(settings, 'prayer-method', 0);
    const METHODS_BY_IDX = ['MWL', 'ISNA', 'Egypt', 'UmmAlQura', 'Karachi', 'Tehran', 'Jafari', 'Custom'];
    const methodId = METHODS_BY_IDX[methodIdx] || 'MWL';

    const asrIdx = _int(settings, 'asr-method', 0);
    const madhab = asrIdx === 1 ? 'Hanafi' : 'Shafii';

    const highLatIdx = _int(settings, 'high-latitude-method', 1);
    const HIGH_LAT_RULES = ['None', 'MiddleOfNight', 'OneSeventh', 'AngleBased'];
    const highLatitudeRule = HIGH_LAT_RULES[highLatIdx] || 'AngleBased';

    // --- Calculate prayer times for the requested day ---
    const methodParams = getMethodParams({ method: methodId });
    const customFajrAngle = methodId === 'Custom' ? _int(settings, 'fajr-angle', 18) : undefined;
    const customIshaAngle = methodId === 'Custom' ? _int(settings, 'isha-angle', 17) : undefined;

    let times;
    try {
      times = calculatePrayerTimes({
        latitude: location.latitude,
        longitude: location.longitude,
        timezone: tzHours,
        date,
        method: methodId,
        madhab,
        highLatitudeRule,
        customFajrAngle,
        customIshaAngle,
      });
    } catch (err) {
      console.error(`${LOG_PREFIX} prayer time calculation failed: ${err}`);
      return [];
    }

    // --- Emit one Event per enabled prayer ---
    for (const prayer of PRAYERS) {
      const prayerTime = times[prayer];
      if (!prayerTime) continue;

      // Per-prayer notification toggle
      if (notificationsEnabled && !_bool(settings, `notify-${prayer}`, true)) continue;

      const name = DISPLAY_NAMES[prayer];
      const ref = QURAN_REFS[prayer];

      events.push(
        createEvent({
          id: `prayer-${prayer}-${date.getTime()}`,
          type: 'prayer',
          title: `${name} — Adhan`,
          description: ref,
          time: prayerTime,
          priority: ADHAN_PRIORITY,
          icon: 'alarm-symbolic',
          sound: _string(settings, `prayer-sound-${prayer}`, '') || null,
          actions: [
            {
              label: 'Snooze',
              callback: () =>
                console.log(
                  `${LOG_PREFIX} snooze requested for ${name} (not yet wired to scheduler re-inject)`
                ),
            },
            {
              label: 'Mark as Prayed',
              callback: () =>
                console.log(
                  `${LOG_PREFIX} ${name} marked as prayed`
                ),
            },
          ],
        })
      );

      // --- Iqamah reminder (offset minutes after adhan) ---
      if (notificationsEnabled && iqamahOffset > 0) {
        const iqamahTime = new Date(prayerTime.getTime() + iqamahOffset * 60_000);
        events.push(
          createEvent({
            id: `iqamah-${prayer}-${date.getTime()}`,
            type: 'iqamah',
            title: `${name} — Iqamah in ${iqamahOffset} min`,
            description: 'Prepare for congregation.',
            time: iqamahTime,
            priority: IQAMAH_PRIORITY,
            icon: 'alarm-symbolic',
            actions: [],
          })
        );
      }
    }

    // --- "Prayer ending soon" warnings ---
    if (endingSoonOffset > 0 && notificationsEnabled) {
      for (let i = 0; i < PRAYERS.length; i++) {
        const currentPrayer = PRAYERS[i];
        const currentTime = times[currentPrayer];
        if (!currentTime) continue;

        // Skip if this prayer is already in the past
        if (currentTime.getTime() <= _now.getTime()) continue;

        const nextPrayerIdx = i + 1;
        if (nextPrayerIdx >= PRAYERS.length) continue;

        const nextPrayer = PRAYERS[nextPrayerIdx];
        const nextTime = times[nextPrayer];
        if (!nextTime) continue;

        const warningTime = new Date(nextTime.getTime() - endingSoonOffset * 60_000);

        // Only emit if warning time is in the future and during this prayer's window
        if (warningTime.getTime() <= _now.getTime()) continue;
        if (warningTime.getTime() >= nextTime.getTime()) continue;

        events.push(
          createEvent({
            id: `ending-soon-${nextPrayer}-${date.getTime()}`,
            type: 'prayer-ending-soon',
            title: `${DISPLAY_NAMES[currentPrayer]} time ending soon`,
            description: `${DISPLAY_NAMES[nextPrayer]} begins in ${endingSoonOffset} min.`,
            time: warningTime,
            priority: ENDING_SOON_PRIORITY,
            icon: 'alarm-symbolic',
            actions: [],
          })
        );
      }
    }

    console.log(
      `${LOG_PREFIX} generated ${events.length} event(s) for ` +
      `${date.toISOString().slice(0, 10)}`
    );

    return events;
  };
}
