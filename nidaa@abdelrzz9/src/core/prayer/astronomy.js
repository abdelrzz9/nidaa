/*
 * Astronomical calculations for prayer times.
 *
 * Based on U.S. Naval Observatory's algorithm for Sun position
 * (accurate to ~1 arcminute within ±2 centuries of 2000).
 *
 * Key concepts:
 *
 *   Julian Day (JD) — continuous day count used in astronomy.
 *   The Julian day starts at noon UT.  We use the modified
 *   convention where d = JD - 2451545.0 (J2000 epoch).
 *
 *   Equation of Time (EqT) — difference between apparent solar
 *   time (sundial) and mean solar time (clock).  Caused by
 *   Earth's axial tilt and elliptical orbit.
 *     EqT = q/15 - RA   (in hours, where q is mean longitude
 *     and RA is right ascension of the Sun).
 *
 *   Declination (D) — the Sun's angular distance north/south of
 *   the celestial equator.  Varies between ~±23.44° over the year.
 *     D = asin(sin(e) * sin(L)), where e = obliquity, L = true
 *     longitude of the Sun.
 *
 *   Hour Angle (HA) — the angular distance of the Sun from the
 *   observer's meridian, measured westward.  At sunrise/sunset
 *   the Sun's zenith angle defines the hour angle:
 *     cos(HA) = (sin(α) - sin(Lat)*sin(D)) / (cos(Lat)*cos(D))
 *   where α is the solar altitude (angle below horizon).
 *
 *   Time from solar noon:
 *     T(α) = HA / 15   (in hours, where HA is in degrees)
 *
 * References:
 *   - U.S. Naval Observatory: https://aa.usno.navy.mil/faq/sun_approx
 *   - PrayTimes.org: https://praytimes.org/docs/calculation
 *   - "The Determination of Salat Times" by Dr. Monzur Ahmed
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Julian Day for a given date (UT). */
export function julianDay(year, month, day) {
  if (month <= 2) {
    year -= 1;
    month += 12;
  }
  const A = Math.floor(year / 100);
  const B = 2 - A + Math.floor(A / 4);
  const JD = Math.floor(365.25 * (year + 4716))
    + Math.floor(30.6001 * (month + 1))
    + day + B - 1524.5;
  return JD;
}

function sin(x) { return Math.sin(x * DEG); }
function cos(x) { return Math.cos(x * DEG); }
function asin(x) { return Math.asin(x) * RAD; }
function acos(x) { return Math.acos(x) * RAD; }
function atan2(y, x) { return Math.atan2(y, x) * RAD; }

/**
 * Compute Sun declination and equation of time for a given date.
 *
 * @param {number} jd - Julian Day (UT)
 * @returns {{ declination: number, equationOfTime: number }}
 *   declination in degrees, equation of time in hours.
 */
export function sunPosition(jd) {
  const d = jd - 2451545.0;

  // Mean anomaly of the Sun
  const g = (357.529 + 0.98560028 * d) % 360;
  // Mean longitude of the Sun
  const q = (280.459 + 0.98564736 * d) % 360;

  // True (ecliptic) longitude
  const L = (q + 1.915 * Math.sin(g * DEG) + 0.020 * Math.sin(2 * g * DEG)) % 360;

  // Obliquity of the ecliptic
  const e = 23.439 - 0.00000036 * d;

  // Right ascension of the Sun (in degrees)
  const RAdeg = atan2(cos(e) * sin(L), cos(L));
  // Right ascension in hours (15° = 1 hour)
  const RA = RAdeg / 15;

  // Declination (in degrees)
  const declination = asin(sin(e) * sin(L));

  // Equation of Time (in hours)
  // q/15 is the mean solar time (hours), RA is apparent solar time (hours)
  let EqT = q / 15 - RA;
  // Normalize to [-0.5, 0.5] hours
  if (EqT > 0.5) EqT -= 24;
  if (EqT < -0.5) EqT += 24;

  return { declination, equationOfTime: EqT };
}

/**
 * Compute the hour angle for a given solar altitude α.
 *
 * @param {number} angle - Solar altitude in degrees (negative = below horizon)
 * @param {number} lat - Observer latitude in degrees
 * @param {number} dec - Sun declination in degrees
 * @returns {number|null} Hour angle in degrees, or null if the sun never
 *   reaches that altitude (e.g., polar night/midnight sun).
 */
export function hourAngle(angle, lat, dec) {
  const arg = (sin(angle) - sin(lat) * sin(dec)) / (cos(lat) * cos(dec));
  if (arg > 1 || arg < -1) return null;
  return acos(arg);
}

/**
 * Compute the Asr shadow time.
 *
 * For Shafii (factor=1): shadow length = object height + noon shadow.
 * For Hanafi (factor=2): shadow length = 2 * object height + noon shadow.
 *
 * The formula:
 *   cot(A) = factor + tan(|lat - dec|)
 * where A is the solar altitude at Asr time.
 *
 * @param {number} factor - 1 (Shafii) or 2 (Hanafi)
 * @param {number} lat - Observer latitude in degrees
 * @param {number} dec - Sun declination in degrees
 * @returns {number} Solar altitude for Asr in degrees
 */
export function asrAltitude(factor, lat, dec) {
  const D = Math.abs(lat - dec);
  const arg = factor + Math.tan(D * DEG);
  return atan2(1, arg);
}

/**
 * Convert hours to a Date object for the given date + timezone offset.
 *
 * @param {number} hours - Time of day in hours (0-24)
 * @param {number} year
 * @param {number} month - 1-indexed
 * @param {number} day
 * @param {number} tzOffset - Timezone offset from UTC in hours
 * @returns {Date}
 */
export function hoursToDate(hours, year, month, day, tzOffset) {
  const utcHours = hours - tzOffset;
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) + utcHours * 3600000);
}

/**
 * Normalize a time in hours to [0, 24).
 */
export function normalizeHours(h) {
  h = h % 24;
  if (h < 0) h += 24;
  return h;
}

/**
 * Clamp a value between min and max.
 */
export function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}
