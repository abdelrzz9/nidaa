/*
 * High-latitude adjustment methods for locations where the sun never
 * reaches the standard twilight angles (e.g., above ~48°N in summer).
 *
 * Three methods are available:
 *
 *   None         — no adjustment; Fajr/Isha will return null if the
 *                  required twilight angle is never reached.
 *
 *   AngleBased   — (Recommended) Let α = twilight angle in degrees.
 *                  Divide the night (sunset to sunrise) into (α/60)
 *                  portions.  Isha starts after the first portion,
 *                  Fajr starts at the beginning of the last portion.
 *                  This interpolates smoothly as latitude increases.
 *
 *   MiddleOfNight— Fajr and Isha are set to the midpoint of the night
 *                  (halfway between sunset and sunrise).  Crude but
 *                  commonly used.
 *
 *   OneSeventh   — Divide the night into 7 equal parts.  Isha after
 *                  the first seventh, Fajr at the start of the last
 *                  seventh.
 *
 * Reference: https://praytimes.org/docs/calculation#higher_latitudes
 */

/**
 * Apply a high-latitude adjustment when the standard hour-angle
 * calculation returns null (sun never reaches the required angle).
 *
 * @param {string} rule - 'AngleBased', 'MiddleOfNight', 'OneSeventh', or 'None'
 * @param {number} sunset - Sunset time in hours
 * @param {number} sunrise - Sunrise time in hours (next day, could be >24)
 * @param {number} angle - The twilight angle that failed
 * @param {boolean} isFajr - true for Fajr, false for Isha
 * @returns {number|null} Adjusted time in hours, or null if rule='None'
 */
export function applyHighLatitudeRule(rule, sunset, sunrise, angle, isFajr) {
  if (rule === 'None') return null;

  // Night length.  Sunrise may be next day (>24) or on the same day.
  let nightLength;
  if (sunrise > sunset) {
    nightLength = sunrise - sunset;
  } else {
    nightLength = (sunrise + 24) - sunset;
  }
  // If nightLength is 0 or negative, fall back to a 6-hour nominal night.
  if (nightLength <= 0) nightLength = 6;

  switch (rule) {
    case 'AngleBased': {
      // Divide the night into 60 parts.  Isha gets the first (angle/60) fraction.
      // Fajr gets the last (angle/60) fraction.
      const portion = angle / 60;
      if (isFajr) {
        return (sunset + nightLength * (1 - portion)) % 24;
      } else {
        return (sunset + nightLength * portion) % 24;
      }
    }
    case 'MiddleOfNight':
      if (isFajr) {
        return (sunset + nightLength / 2) % 24;
      } else {
        return (sunset + nightLength / 2) % 24;
      }
    case 'OneSeventh':
      if (isFajr) {
        return (sunset + nightLength * (6 / 7)) % 24;
      } else {
        return (sunset + nightLength * (1 / 7)) % 24;
      }
    default:
      return null;
  }
}
