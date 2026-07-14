/*
 * Adhkar event provider — generates daily adhkar reminder events.
 *
 * Implements the Scheduler provider protocol: (date: Date) => Event[]
 *
 * Content sources:
 *   - Morning and evening adhkar are from Hisnul Muslim (Fortress of the Muslim)
 *     by Sa'id ibn Wahf al-Qahtani, the standard reference for daily adhkar.
 *   - Post-prayer adhkar follows the hadith in Sahih Muslim 723: the Prophet ﷺ
 *     taught that after prayer one should say SubhanAllah ×33, Alhamdulillah ×33,
 *     Allahu Akbar ×34, and the closing declaration.
 *   - Arabic text is transcribed exactly as printed in the standard Saudi edition
 *     of Hisnul Muslim. No paraphrase or creative rewriting.
 *
 * Scheduling:
 *   - Morning adhkar: sunrise + offset (default 15 min after sunrise)
 *   - Evening adhkar: maghrib - offset (default 15 min before Maghrib)
 *   - Post-prayer adhkar: each prayer + offset (default 30 min after each)
 *     Per-prayer toggles are configurable via GSettings.
 *
 * Zero GNOME Shell dependencies for pure logic; GLib used only for file I/O.
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { calculatePrayerTimes } from '../prayer/times.js';
import { createEvent } from '../scheduler/event.js';
import { _ } from '../i18n/index.js';

const LOG_PREFIX = '[Nidaa:Adhkar]';

/** Priority for adhkar notifications (gentle nudge, not urgent). */
const ADHKAR_PRIORITY = 3;

// ------------------------------------------------------------------
//  Content loading
// ------------------------------------------------------------------

/**
 * Load adhkar content from the bundled JSON file.
 * Uses GLib file I/O to read from the extension's assets directory.
 *
 * @returns {object|null} The parsed adhkar content, or null on error.
 */
function loadAdhkarContent() {
  try {
    const candidates = [
      // From the extension directory (when running as installed extension)
      `${GLib.get_current_dir()}/assets/translations/adhkar-content.json`,
      `${GLib.get_current_dir()}/../assets/translations/adhkar-content.json`,
      // When installed as a GNOME extension
      `${GLib.get_home_dir()}/.local/share/gnome-shell/extensions/nidaa@abdelrzz9/assets/translations/adhkar-content.json`,
      // When running tests from the project root
      `${GLib.get_current_dir()}/nidaa@abdelrzz9/assets/translations/adhkar-content.json`,
      `${GLib.get_current_dir()}/../nidaa@abdelrzz9/assets/translations/adhkar-content.json`,
    ];

    for (const path of candidates) {
      const file = Gio.File.new_for_path(path);
      if (file.query_exists(null)) {
        const [success, contents] = file.load_contents(null);
        if (success) {
          const parsed = JSON.parse(new TextDecoder().decode(contents));
          console.log(`${LOG_PREFIX} loaded adhkar content from ${path}`);
          return parsed;
        }
      }
    }

    console.warn(`${LOG_PREFIX} adhkar-content.json not found`);
    return null;
  } catch (err) {
    console.error(`${LOG_PREFIX} failed to load adhkar content: ${err}`);
    return null;
  }
}

// ------------------------------------------------------------------
//  GSettings helpers
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

/**
 * Compute the local UTC offset in hours using pure JavaScript.
 */
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
//  Adhkar summaries (short text for notifications)
// ------------------------------------------------------------------

/**
 * Short notification summaries for each adhkar type.
 * These are brief excerpts shown in the desktop notification.
 * The full text lives in the detail view (src/ui/adhkar/detail.js).
 */
const MORNING_SUMMARY = _('Morning Adhkar — Ayat al-Kursi, the Three Quls, and daily formulas');
const EVENING_SUMMARY = _('Evening Adhkar — Ayat al-Kursi, the Three Quls, and daily formulas');
const POST_PRAYER_SUMMARY = _('Post-Prayer Adhkar — SubhanAllah ×33, Alhamdulillah ×33, Allahu Akbar ×34');

/** Display names for prayer keys. */
const PRAYER_NAMES = {
  fajr: 'Fajr',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha',
};

// ------------------------------------------------------------------
//  Provider factory
// ------------------------------------------------------------------

/**
 * Create an adhkar event provider suitable for the Scheduler.
 *
 * @param {object}   opts
 * @param {object}   opts.location - { latitude, longitude, source, timestamp }
 * @param {object}   [opts.settings] - GSettings (optional in tests)
 * @param {Function} [opts.now] - Injectable clock returning Date (for testing)
 * @returns {(date: Date) => Event[]} Provider function
 */
export function createAdhkarProvider({ location, settings, now: injectableNow }) {
  if (!location) {
    console.warn(`${LOG_PREFIX} no location — provider will return empty arrays`);
    return () => [];
  }

  // Load content once at factory creation
  const content = loadAdhkarContent();
  if (!content) {
    console.warn(`${LOG_PREFIX} no adhkar content — provider will return empty arrays`);
    return () => [];
  }

  const tzHours = localTimezoneOffset();

  return function adhkarProvider(date) {
    const _now = injectableNow ? injectableNow() : new Date();
    const events = [];

    if (!(date instanceof Date) || isNaN(date.getTime())) {
      console.warn(`${LOG_PREFIX} invalid date — returning empty`);
      return [];
    }

    const adhkarEnabled = _bool(settings, 'adhkar-enabled', true);
    if (!adhkarEnabled) return [];

    const lang = _string(settings, 'adhkar-language', 'en');

    // --- Calculate prayer times for sunrise and maghrib ---
    let times;
    try {
      times = calculatePrayerTimes({
        latitude: location.latitude,
        longitude: location.longitude,
        timezone: tzHours,
        date,
        method: _resolveMethod(settings),
        madhab: _resolveMadhab(settings),
        highLatitudeRule: _resolveHighLat(settings),
      });
    } catch (err) {
      console.error(`${LOG_PREFIX} prayer time calculation failed: ${err}`);
      return [];
    }

    // --- Morning adhkar: sunrise + offset ---
    const morningOffset = _int(settings, 'adhkar-morning-offset', 15);
    if (times.sunrise) {
      const morningTime = new Date(times.sunrise.getTime() + morningOffset * 60_000);
      if (morningTime.getTime() > _now.getTime()) {
        const summary = lang === 'fr'
          ? 'Adhkar du matin — Ayat al-Kursi, les trois Quls et formules quotidiennes'
          : MORNING_SUMMARY;

        events.push(createEvent({
          id: `adhkar-morning-${date.getTime()}`,
          type: 'adhkar',
          title: _('Morning Adhkar'),
          description: summary,
          time: morningTime,
          priority: ADHKAR_PRIORITY,
          icon: 'weather-clear-symbolic',
          actions: [
            {
              label: _('Open Adhkar'),
              callback: () => console.log(`${LOG_PREFIX} morning adhkar opened`),
            },
          ],
        }));
      }
    }

    // --- Evening adhkar: maghrib - offset ---
    const eveningOffset = _int(settings, 'adhkar-evening-offset', 15);
    if (times.maghrib) {
      const eveningTime = new Date(times.maghrib.getTime() - eveningOffset * 60_000);
      if (eveningTime.getTime() > _now.getTime()) {
        const summary = lang === 'fr'
          ? 'Adhkar du soir — Ayat al-Kursi, les trois Quls et formules quotidiennes'
          : EVENING_SUMMARY;

        events.push(createEvent({
          id: `adhkar-evening-${date.getTime()}`,
          type: 'adhkar',
          title: _('Evening Adhkar'),
          description: summary,
          time: eveningTime,
          priority: ADHKAR_PRIORITY,
          icon: 'weather-clear-night-symbolic',
          actions: [
            {
              label: _('Open Adhkar'),
              callback: () => console.log(`${LOG_PREFIX} evening adhkar opened`),
            },
          ],
        }));
      }
    }

    // --- Post-prayer adhkar: each prayer + offset ---
    const postPrayerOffset = _int(settings, 'adhkar-post-prayer-offset', 30);
    for (const prayer of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']) {
      if (!_bool(settings, `adhkar-post-${prayer}`, true)) continue;

      const prayerTime = times[prayer];
      if (!prayerTime) continue;

      const postTime = new Date(prayerTime.getTime() + postPrayerOffset * 60_000);
      if (postTime.getTime() <= _now.getTime()) continue;

      const name = PRAYER_NAMES[prayer];
      const summary = lang === 'fr'
        ? `Adhkar après ${name} — SubhanAllah ×33, Alhamdulillah ×33, Allahu Akbar ×34`
        : POST_PRAYER_SUMMARY;

      events.push(createEvent({
        id: `adhkar-post-${prayer}-${date.getTime()}`,
        type: 'adhkar-post-prayer',
        title: `${_('Post-Prayer Adhkar')} — ${name}`,
        description: summary,
        time: postTime,
        priority: ADHKAR_PRIORITY,
        icon: 'appointment-soon-symbolic',
        actions: [
          {
            label: _('Open Adhkar'),
            callback: () => console.log(`${LOG_PREFIX} post-${name} adhkar opened`),
          },
        ],
      }));
    }

    console.log(
      `${LOG_PREFIX} generated ${events.length} event(s) for ` +
      `${date.toISOString().slice(0, 10)}`
    );

    return events;
  };
}

// ------------------------------------------------------------------
//  Settings resolution helpers
// ------------------------------------------------------------------

const METHODS_BY_IDX = ['MWL', 'ISNA', 'Egypt', 'UmmAlQura', 'Karachi', 'Tehran', 'Jafari', 'Custom'];
const HIGH_LAT_RULES = ['None', 'MiddleOfNight', 'OneSeventh', 'AngleBased'];

function _resolveMethod(settings) {
  const idx = _int(settings, 'prayer-method', 0);
  return METHODS_BY_IDX[idx] || 'MWL';
}

function _resolveMadhab(settings) {
  const idx = _int(settings, 'asr-method', 0);
  return idx === 1 ? 'Hanafi' : 'Shafii';
}

function _resolveHighLat(settings) {
  const idx = _int(settings, 'high-latitude-method', 3);
  return HIGH_LAT_RULES[idx] || 'AngleBased';
}

// ------------------------------------------------------------------
//  Content access (for the detail view)
// ------------------------------------------------------------------

/**
 * Get the full adhkar content for a specific category.
 * Used by the detail view (src/ui/adhkar/detail.js) to display
 * the full Arabic text, transliteration, and translation.
 *
 * @param {'morning'|'evening'|'post_prayer'} category
 * @returns {Array|null} Array of adhkar items, or null if content not loaded.
 */
export function getAdhkarContent(category) {
  const content = loadAdhkarContent();
  if (!content) return null;
  return content[category] || null;
}
