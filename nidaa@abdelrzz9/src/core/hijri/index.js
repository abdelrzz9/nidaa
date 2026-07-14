/*
 * Hijri (Islamic lunar) date calculation.
 *
 * Uses the Kuwaiti tabular algorithm — a pure arithmetic method with a
 * 30-year cycle and alternating 29/30-day months.  Zero external API
 * dependencies; identical in structure to the prayer math in src/core/prayer/.
 *
 * IMPORTANT: Tabular Hijri calculations can differ by ±1 day from local
 * moon-sighting announcements.  This is an inherent limitation of any
 * calculated (non-observation-based) Islamic calendar.  We do NOT claim
 * precision beyond what the algorithm provides.
 *
 * Reference: Microsoft .NET HijriCalendar (Kuwaiti Algorithm),
 *            also used by ICU and most Linux distributions.
 *
 * Leap years in the 30-year cycle: 2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29.
 */

const LOG_PREFIX = '[Nidaa:Hijri]';

// ------------------------------------------------------------------
//  Month names (1-indexed: 1 = Muharram, 12 = Dhul Hijjah)
// ------------------------------------------------------------------

export const MONTH_NAMES_AR = [
  '', // placeholder for index 0
  'محرّم',
  'صفر',
  'ربيع الأول',
  'ربيع الثاني',
  'جمادى الأولى',
  'جمادى الآخرة',
  'رجب',
  'شعبان',
  'رمضان',
  'شوّال',
  'ذو القعدة',
  'ذو الحجّة',
];

export const MONTH_NAMES_EN = [
  '',
  'Muharram',
  'Safar',
  'Rabi al-Awwal',
  'Rabi al-Thani',
  'Jumada al-Ula',
  'Jumada al-Thani',
  'Rajab',
  'Sha\'ban',
  'Ramadan',
  'Shawwal',
  'Dhu al-Qa\'dah',
  'Dhu al-Hijjah',
];

export const MONTH_NAMES_FR = [
  '',
  'Mouharram',
  'Safar',
  'Rabia al-Aoual',
  'Rabia al-Thani',
  'Djoumada al-Oula',
  'Djoumada al-Thani',
  'Rajab',
  'Cha\'ban',
  'Ramadan',
  'Chawwal',
  'Dhou al-Qa\'da',
  'Dhou al-Hijja',
];

/**
 * Get month names in the given language.
 *
 * @param {'ar'|'en'|'fr'} lang
 * @returns {string[]} Array indexed 0–12 (index 0 is empty string)
 */
export function getMonthNames(lang = 'en') {
  switch (lang) {
    case 'ar': return MONTH_NAMES_AR;
    case 'fr': return MONTH_NAMES_FR;
    default:   return MONTH_NAMES_EN;
  }
}

// ------------------------------------------------------------------
//  Kuwaiti tabular algorithm — month lengths
// ------------------------------------------------------------------

/**
 * Month lengths for each year in the 30-year cycle.
 * Each entry is an array of 12 month lengths (months 1–12).
 * Months 1, 3, 5, 7, 9, 11 = 30 days; months 2, 4, 6, 8, 10 = 29 days.
 * Month 12 (Dhul Hijjah) = 30 in leap years, 29 otherwise.
 */
const LEAP_YEARS = new Set([2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29]);

function _monthLengths(year) {
  const cycleYear = ((year - 1) % 30) + 1;
  const isLeap = LEAP_YEARS.has(cycleYear);
  return [
    30, 29, 30, 29, 30, 29,  // Muharram–Dhu al-Qa'dah
    30, 29, 30, 29, 30, isLeap ? 30 : 29,  // Dhul Hijjah
  ];
}

/**
 * Days in a given Hijri year.
 */
export function daysInHijriYear(year) {
  let total = 0;
  for (const len of _monthLengths(year)) {
    total += len;
  }
  return total;
}

/**
 * Days in a given Hijri month.
 */
export function daysInHijriMonth(year, month) {
  return _monthLengths(year)[month - 1] || 0;
}

// ------------------------------------------------------------------
//  Julian Day Number helpers
// ------------------------------------------------------------------

/**
 * Compute the Julian Day Number (JDN) for a Gregorian date.
 * Standard astronomical formula (Meeus, "Astronomical Algorithms").
 */
function _gregorianToJDN(year, month, day) {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y +
    Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

/**
 * Convert a JDN back to a Gregorian date.
 * Returns { year, month, day }.
 */
function _jdnToGregorian(jdn) {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor(146097 * b / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor(1461 * d / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);
  return { year, month, day };
}

// ------------------------------------------------------------------
//  Kuwaiti algorithm — Hijri ↔ JDN
// ------------------------------------------------------------------

/**
 * Convert a Hijri date to a JDN.
 * Formula: JDN = ⌊(11y+3)/30⌋ + 354y + 30m − ⌊(m−1)/2⌋ + d + 1948055
 *
 * Reference: "Calendrical Calculations" by Dershowitz & Reingold,
 *            and the Microsoft .NET HijriCalendar documentation.
 */
function _hijriToJDN(year, month, day) {
  return Math.floor((11 * year + 3) / 30) +
    354 * year +
    30 * month -
    Math.floor((month - 1) / 2) +
    day +
    1948055;
}

/**
 * Kuwaiti tabular algorithm: JDN → Hijri date.
 *
 * This is the reverse of _hijriToJDN.  We solve for (y, m, d) given
 * a Julian Day Number.  The algorithm is iterative but fast (at most
 * ~1500 iterations for dates in the range AH 1–9999).
 */
function _jdnToHijri(jdn) {
  // Step 1: Estimate the Hijri year.
  // Average Hijri year = 354 + 11/30 = 10631/30 ≈ 354.3667 days.
  // The epoch offset means: z = JDN - 1948055, and z ≈ 10631y/30.
  const z = jdn - 1948055;
  let y = Math.floor(30 * z / 10631);

  // Step 2: Refine — find the exact year.
  // The Hijri year y starts at JDN = _hijriToJDN(y, 1, 1).
  // We need the largest y such that _hijriToJDN(y, 1, 1) <= jdn.
  while (_hijriToJDN(y + 1, 1, 1) <= jdn) y++;
  while (_hijriToJDN(y, 1, 1) > jdn) y--;

  // Step 3: Find the month.
  // The Hijri month m of year y starts at _hijriToJDN(y, m, 1).
  let m = 1;
  for (let i = 1; i <= 12; i++) {
    if (_hijriToJDN(y, i, 1) > jdn) break;
    m = i;
  }

  // Step 4: Find the day.
  const d = jdn - _hijriToJDN(y, m, 1) + 1;

  return { year: y, month: m, day: d };
}

// ------------------------------------------------------------------
//  Core conversion API
// ------------------------------------------------------------------

/**
 * Convert a Gregorian Date to a Hijri date.
 *
 * Uses the Kuwaiti tabular algorithm.  Note: tabular Hijri calculations
 * can differ by ±1 day from local moon-sighting announcements.  This is
 * an inherent limitation of any calculated (non-observation-based)
 * Islamic calendar.
 *
 * @param {Date} gregorianDate
 * @returns {{ day: number, month: number, monthName: string, monthNameAr: string, year: number }|null}
 */
export function getHijriDate(gregorianDate) {
  if (!(gregorianDate instanceof Date) || isNaN(gregorianDate.getTime())) {
    console.warn(`${LOG_PREFIX} invalid date`);
    return null;
  }

  const jdn = _gregorianToJDN(
    gregorianDate.getFullYear(),
    gregorianDate.getMonth() + 1,
    gregorianDate.getDate()
  );

  const { year, month, day } = _jdnToHijri(jdn);

  return {
    day,
    month,
    monthName: MONTH_NAMES_EN[month] || '',
    monthNameAr: MONTH_NAMES_AR[month] || '',
    year,
  };
}

/**
 * Convert a Hijri date to a Gregorian Date.
 *
 * @param {number} year   - Hijri year (AH)
 * @param {number} month  - Hijri month (1–12)
 * @param {number} day    - Hijri day
 * @returns {Date|null}
 */
export function hijriToGregorian(year, month, day) {
  if (year < 1 || month < 1 || month > 12 || day < 1) {
    console.warn(`${LOG_PREFIX} invalid Hijri date: ${year}/${month}/${day}`);
    return null;
  }

  const maxDay = daysInHijriMonth(year, month);
  if (day > maxDay) {
    console.warn(`${LOG_PREFIX} day ${day} exceeds month length ${maxDay} for ${year}/${month}`);
    return null;
  }

  const jdn = _hijriToJDN(year, month, day);

  const greg = _jdnToGregorian(jdn);
  return new Date(greg.year, greg.month - 1, greg.day);
}

// ------------------------------------------------------------------
//  Islamic event helpers
// ------------------------------------------------------------------

/**
 * Number of days from a reference Gregorian date until a specific
 * Hijri month starts.
 *
 * @param {number} targetMonth - Hijri month number (1–12)
 * @param {Date}   [from]      - Reference date (default: today)
 * @returns {number|null} Days until the target month, or 0 if we're in it
 */
export function daysUntilHijriMonth(targetMonth, from) {
  const now = from || new Date();
  const hijri = getHijriDate(now);
  if (!hijri) return null;

  if (hijri.month === targetMonth) return 0;

  // If target month is later this Hijri year, count forward
  if (targetMonth > hijri.month) {
    let days = daysInHijriMonth(hijri.year, hijri.month) - hijri.day;
    for (let m = hijri.month + 1; m < targetMonth; m++) {
      days += daysInHijriMonth(hijri.year, m);
    }
    return days + 1; // +1 because day 1 of target is what we want
  }

  // Target month is next Hijri year
  let days = daysInHijriMonth(hijri.year, hijri.month) - hijri.day;
  for (let m = hijri.month + 1; m <= 12; m++) {
    days += daysInHijriMonth(hijri.year, m);
  }
  for (let m = 1; m < targetMonth; m++) {
    days += daysInHijriMonth(hijri.year + 1, m);
  }
  return days + 1;
}

/**
 * Days until Ramadan (month 9).
 */
export function daysUntilRamadan(from) {
  return daysUntilHijriMonth(9, from);
}

/**
 * Days until Eid al-Fitr (1 Shawwal, month 10).
 */
export function daysUntilEidAlFitr(from) {
  return daysUntilHijriMonth(10, from);
}

/**
 * Days until Eid al-Adha (10 Dhu al-Hijjah, month 12).
 */
export function daysUntilEidAlAdha(from) {
  const now = from || new Date();
  const hijri = getHijriDate(now);
  if (!hijri) return null;

  if (hijri.month === 12 && hijri.day >= 10) return 0;

  let days;
  if (hijri.month < 12) {
    days = daysInHijriMonth(hijri.year, hijri.month) - hijri.day;
    for (let m = hijri.month + 1; m < 12; m++) {
      days += daysInHijriMonth(hijri.year, m);
    }
  } else {
    // We're in Dhul Hijjah but before the 10th
    days = 10 - hijri.day;
    return days;
  }
  return days + 10; // 10th of Dhul Hijjah
}

/**
 * Days until Ashura (10 Muharram, month 1).
 */
export function daysUntilAshura(from) {
  const now = from || new Date();
  const hijri = getHijriDate(now);
  if (!hijri) return null;

  if (hijri.month === 1 && hijri.day >= 10) return 0;

  let days;
  if (hijri.month === 1) {
    days = 10 - hijri.day;
    return days;
  }

  // Count to end of current month
  days = daysInHijriMonth(hijri.year, hijri.month) - hijri.day;
  // Count through remaining months to Muharram
  for (let m = hijri.month + 1; m <= 12; m++) {
    days += daysInHijriMonth(hijri.year, m);
  }
  // First 10 days of next Muharram
  return days + 10;
}

/**
 * Days until Arafah (9 Dhu al-Hijjah, month 12).
 */
export function daysUntilArafah(from) {
  const now = from || new Date();
  const hijri = getHijriDate(now);
  if (!hijri) return null;

  if (hijri.month === 12 && hijri.day >= 9) return 0;

  let days;
  if (hijri.month < 12) {
    days = daysInHijriMonth(hijri.year, hijri.month) - hijri.day;
    for (let m = hijri.month + 1; m < 12; m++) {
      days += daysInHijriMonth(hijri.year, m);
    }
  } else {
    days = 9 - hijri.day;
    return days;
  }
  return days + 9;
}

/**
 * Check if today (or a given date) falls on the White Days
 * (13th–15th of any Hijri month).
 *
 * @param {Date} [from]
 * @returns {{ isWhiteDay: boolean, monthName: string }|null}
 */
export function isWhiteDays(from) {
  const now = from || new Date();
  const hijri = getHijriDate(now);
  if (!hijri) return null;

  const isWhite = hijri.day >= 13 && hijri.day <= 15;
  return {
    isWhiteDay: isWhite,
    monthName: hijri.monthName,
  };
}

/**
 * Days until the next White Days (13th of the current or next Hijri month).
 *
 * @param {Date} [from]
 * @returns {number|null}
 */
export function daysUntilWhiteDays(from) {
  const now = from || new Date();
  const hijri = getHijriDate(now);
  if (!hijri) return null;

  if (hijri.day >= 13 && hijri.day <= 15) return 0;

  if (hijri.day < 13) {
    return 13 - hijri.day;
  }

  // After the 15th — count to 13th of next month
  let days = daysInHijriMonth(hijri.year, hijri.month) - hijri.day;
  return days + 13;
}
