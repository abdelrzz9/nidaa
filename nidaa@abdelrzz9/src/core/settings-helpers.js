/**
 * Shared GSettings helper functions and constants reused across
 * prayer, adhkar, and quran providers.
 */

/**
 * Ordered list of supported calculation method identifiers.
 * Index matches the GSettings 'prayer-method' integer key.
 */
export const METHODS_BY_IDX = ['MWL', 'ISNA', 'Egypt', 'UmmAlQura', 'Karachi', 'Tehran', 'Jafari', 'Custom'];

/**
 * Ordered list of high-latitude rule identifiers.
 * Index matches the GSettings 'high-latitude-method' integer key.
 */
export const HIGH_LAT_RULES = ['None', 'MiddleOfNight', 'OneSeventh', 'AngleBased'];

/**
 * Read a boolean key from GSettings; returns fallback on error.
 * @param {object|null} settings
 * @param {string} key
 * @param {boolean} fallback
 * @returns {boolean}
 */
export function _bool(settings, key, fallback) {
  try {
    return settings ? settings.get_boolean(key) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Read an integer key from GSettings; returns fallback on error.
 * @param {object|null} settings
 * @param {string} key
 * @param {number} fallback
 * @returns {number}
 */
export function _int(settings, key, fallback) {
  try {
    return settings ? settings.get_int(key) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Read a string key from GSettings; returns fallback on error.
 * @param {object|null} settings
 * @param {string} key
 * @param {string} fallback
 * @returns {string}
 */
export function _string(settings, key, fallback) {
  try {
    return settings ? settings.get_string(key) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Compute the local UTC offset in hours using pure JavaScript.
 * Avoids the GLib.DateTime.get_utc_offset() issue where the return
 * value may be in microseconds (GTimeSpan) depending on the GJS version.
 *
 * @returns {number} UTC offset in hours (e.g., 1 for UTC+1, -5 for UTC-5)
 */
export function localTimezoneOffset() {
  const now = new Date();
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const localMinutes = now.getHours() * 60 + now.getMinutes();
  let diff = (localMinutes - utcMinutes) / 60;
  if (diff > 12) diff -= 24;
  if (diff < -12) diff += 24;
  return diff;
}
