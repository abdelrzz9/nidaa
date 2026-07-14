/*
 * Islamic Events — scheduled reminders for Friday, Ashura, Arafah, White Days.
 *
 * Each event type is individually toggleable via GSettings.
 * All events are generated as Scheduler events.
 *
 * Friday reminders:
 *   - Thursday night: "Tomorrow is Friday. Don't forget Surah Al-Kahf."
 *   - Friday morning: "Read Surah Al-Kahf today."
 *   - Friday afternoon: "Increase Salawat upon Prophet Muhammad ﷺ."
 *
 * Ashura (Muharram 10): brief notification + optional day-before.
 * Arafah (Dhul Hijjah 9): brief notification + day-before recommended.
 * White Days (13th–15th of each Hijri month): single notification on 13th.
 */

import { getHijriDate } from '../hijri/index.js';
import { createEvent } from '../scheduler/event.js';
import { _ } from '../i18n/index.js';

const LOG_PREFIX = '[Nidaa:Events]';

/**
 * Check if a given Gregorian date is a Friday.
 *
 * @param {Date} [date]
 * @returns {boolean}
 */
export function isFriday(date) {
  return (date || new Date()).getDay() === 5;
}

/**
 * Get the Hijri day of month for a Gregorian date.
 *
 * @param {Date} [date]
 * @returns {number|null} 1–30 or null
 */
function hijriDay(date) {
  const h = getHijriDate(date || new Date());
  return h ? h.day : null;
}

/**
 * Get the Hijri month for a Gregorian date.
 *
 * @param {Date} [date]
 * @returns {number|null} 1–12 or null
 */
function hijriMonth(date) {
  const h = getHijriDate(date || new Date());
  return h ? h.month : null;
}

/**
 * Create a Date object for a specific hour/minute on a given date.
 *
 * @param {Date}   date
 * @param {number} hour   - 0–23
 * @param {number} minute - 0–59
 * @returns {Date}
 */
function timeOnDate(date, hour, minute) {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/**
 * Creates the Islamic events provider.
 *
 * @param {object} opts
 * @param {object} opts.settings - GSettings instance
 * @param {Date}   [opts.now]    - Injected Date (testing)
 * @returns {function(Date): Event[]} Provider function
 */
export function createIslamicEventsProvider({ settings, now }) {
  return function islamicEventsProvider(currentDate) {
    const ref = now || currentDate || new Date();
    const events = [];

    if (!settings) return events;

    // ── Friday reminders ─────────────────────────────────────────────
    if (settings.get_boolean('events-friday-enabled')) {
      const thursdayHour = settings.get_int('events-friday-thursday-hour');
      const fridayMorningHour = settings.get_int('events-friday-morning-hour');
      const fridayAfternoonHour = settings.get_int('events-friday-afternoon-hour');

      const dayOfWeek = ref.getDay();

      // Thursday night reminder (sent on Thursday evening)
      if (dayOfWeek === 4) { // Thursday
        const thursdayTime = timeOnDate(ref, thursdayHour, 0);
        if (thursdayTime.getTime() > ref.getTime()) {
          events.push(createEvent({
            id: `friday-thursday-${ref.toISOString().slice(0, 10)}`,
            type: 'reminder',
            title: '🌙 ' + _('Tomorrow is Friday'),
            description: _("Don't forget to read Surah Al-Kahf tomorrow."),
            time: thursdayTime,
            priority: 5,
          }));
        }
      }

      // Friday morning reminder
      if (dayOfWeek === 5) { // Friday
        const morningTime = timeOnDate(ref, fridayMorningHour, 0);
        if (morningTime.getTime() > ref.getTime()) {
          events.push(createEvent({
            id: `friday-morning-${ref.toISOString().slice(0, 10)}`,
            type: 'reminder',
            title: '📖 ' + _('Read Surah Al-Kahf'),
            description: _('Today is Friday — read Surah Al-Kahf.'),
            time: morningTime,
            priority: 5,
          }));
        }
      }

      // Friday afternoon reminder
      if (dayOfWeek === 5) { // Friday
        const afternoonTime = timeOnDate(ref, fridayAfternoonHour, 0);
        if (afternoonTime.getTime() > ref.getTime()) {
          events.push(createEvent({
            id: `friday-afternoon-${ref.toISOString().slice(0, 10)}`,
            type: 'reminder',
            title: '🤲 ' + _('Increase Salawat'),
            description: _('Increase your Salawat upon Prophet Muhammad ﷺ today.'),
            time: afternoonTime,
            priority: 4,
          }));
        }
      }
    }

    // ── Ashura (Muharram 10) ─────────────────────────────────────────
    if (settings.get_boolean('events-ashura-enabled')) {
      const day = hijriDay(ref);
      const month = hijriMonth(ref);

      if (month === 1) { // Muharram
        // Day before Ashura (9th)
        if (day === 9 && settings.get_boolean('events-ashura-daybefore')) {
          const reminderTime = timeOnDate(ref, 9, 0); // 9 AM
          if (reminderTime.getTime() > ref.getTime()) {
            events.push(createEvent({
              id: `ashura-before-${ref.toISOString().slice(0, 10)}`,
              type: 'reminder',
              title: '🌙 ' + _('Tomorrow is Ashura'),
              description: _('Tomorrow (Muharram 10) is the Day of Ashura. The Prophet ﷺ recommended fasting this day.'),
              time: reminderTime,
              priority: 6,
            }));
          }
        }

        // Ashura day
        if (day === 10) {
          const reminderTime = timeOnDate(ref, 9, 0);
          if (reminderTime.getTime() > ref.getTime()) {
            events.push(createEvent({
              id: `ashura-${ref.toISOString().slice(0, 10)}`,
              type: 'reminder',
              title: '🕌 ' + _('Today is Ashura'),
              description: _('Today is the 10th of Muharram, the Day of Ashura. The Prophet ﷺ recommended fasting this day. (Sahih Muslim 1162)'),
              time: reminderTime,
              priority: 7,
            }));
          }
        }
      }
    }

    // ── Arafah (Dhul Hijjah 9) ───────────────────────────────────────
    if (settings.get_boolean('events-arafah-enabled')) {
      const day = hijriDay(ref);
      const month = hijriMonth(ref);

      if (month === 12) { // Dhul Hijjah
        // Day before Arafah (8th)
        if (day === 8 && settings.get_boolean('events-arafah-daybefore')) {
          const reminderTime = timeOnDate(ref, 9, 0);
          if (reminderTime.getTime() > ref.getTime()) {
            events.push(createEvent({
              id: `arafah-before-${ref.toISOString().slice(0, 10)}`,
              type: 'reminder',
              title: '🌙 ' + _('Tomorrow is the Day of Arafah'),
              description: _('Tomorrow (Dhul Hijjah 9) is the Day of Arafah. Fasting this day expiates the sins of the previous and coming year. (Sahih Muslim 1162)'),
              time: reminderTime,
              priority: 6,
            }));
          }
        }

        // Arafah day
        if (day === 9) {
          const reminderTime = timeOnDate(ref, 9, 0);
          if (reminderTime.getTime() > ref.getTime()) {
            events.push(createEvent({
              id: `arafah-${ref.toISOString().slice(0, 10)}`,
              type: 'reminder',
              title: '🕌 ' + _('Today is the Day of Arafah'),
              description: _('Today is the 9th of Dhul Hijjah, the Day of Arafah. Fasting this day expiates the sins of the previous and coming year. (Sahih Muslim 1162)'),
              time: reminderTime,
              priority: 7,
            }));
          }
        }
      }
    }

    // ── White Days (13th–15th of each Hijri month) ───────────────────
    if (settings.get_boolean('events-whitedays-enabled')) {
      const day = hijriDay(ref);
      if (day === 13) {
        const reminderTime = timeOnDate(ref, 9, 0);
        if (reminderTime.getTime() > ref.getTime()) {
          const hijri = getHijriDate(ref);
          const monthName = hijri ? hijri.monthName : 'this Hijri month';
          events.push(createEvent({
            id: `whitedays-${ref.toISOString().slice(0, 10)}`,
            type: 'reminder',
            title: '🤍 ' + _('White Days'),
            description: _('These are the White Days (13th–15th of the month). The Prophet ﷺ recommended fasting these three days each month. (Sahih Muslim 721)'),
            time: reminderTime,
            priority: 4,
          }));
        }
      }
    }

    return events;
  };
}

/**
 * Get the next upcoming Islamic event for display in the popup.
 *
 * @param {Date}   [date]
 * @param {object} [settings]
 * @returns {{ name: string, daysLeft: number, hijriDate: string } | null}
 */
export function getNextIslamicEvent(date, settings) {
  const now = date || new Date();
  const hijri = getHijriDate(now);
  if (!hijri) return null;

  const candidates = [];

  // Ramadan (month 9) — only if not currently in Ramadan
  if (hijri.month !== 9) {
    // Rough estimate
  }

  // Ashura (Muharram 10)
  if (hijri.month === 1 && hijri.day < 10) {
    candidates.push({ name: 'Ashura', daysLeft: 10 - hijri.day, hijriDate: `10 Muharram ${hijri.year}` });
  } else if (hijri.month > 1 || (hijri.month === 1 && hijri.day > 10)) {
    // Next year's Ashura
    const daysLeft = (12 - hijri.month) * 29 + (10 - hijri.day) + 29; // rough
    candidates.push({ name: 'Ashura', daysLeft, hijriDate: `10 Muharram ${hijri.year + 1}` });
  }

  // Arafah (Dhul Hijjah 9)
  if (hijri.month === 12 && hijri.day < 9) {
    candidates.push({ name: 'Arafah', daysLeft: 9 - hijri.day, hijriDate: `9 Dhul Hijjah ${hijri.year}` });
  } else if (hijri.month < 12 || (hijri.month === 12 && hijri.day > 9)) {
    const daysLeft = (12 - hijri.month) * 29 + (9 - hijri.day);
    candidates.push({ name: 'Arafah', daysLeft: Math.max(0, daysLeft), hijriDate: `9 Dhul Hijjah ${hijri.year}` });
  }

  // Eid al-Fitr (Shawwal 1)
  if (hijri.month === 9 && hijri.day < 30) {
    candidates.push({ name: 'Eid al-Fitr', daysLeft: 30 - hijri.day, hijriDate: `1 Shawwal ${hijri.year}` });
  } else if (hijri.month === 10 && hijri.day < 1) {
    candidates.push({ name: 'Eid al-Fitr', daysLeft: 1 - hijri.day, hijriDate: `1 Shawwal ${hijri.year}` });
  }

  // Eid al-Adha (Dhul Hijjah 10)
  if (hijri.month === 12 && hijri.day < 10) {
    candidates.push({ name: 'Eid al-Adha', daysLeft: 10 - hijri.day, hijriDate: `10 Dhul Hijjah ${hijri.year}` });
  }

  if (candidates.length === 0) return null;

  // Return the nearest event
  candidates.sort((a, b) => a.daysLeft - b.daysLeft);
  return candidates[0];
}
