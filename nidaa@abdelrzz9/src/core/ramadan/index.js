/*
 * Ramadan Mode — auto-detected Hijri month 9 event provider.
 *
 * Provides:
 *   - Suhoor/Iftar countdown framing for the indicator
 *   - Taraweeh reminder after Isha
 *   - Laylat al-Qadr reminders on the odd nights of the last 10
 *   - Daily Ramadan dua
 *
 * All events are only generated when the Hijri month is Ramadan (9),
 * or when the force-ramadan settings override is active.
 */

import { getHijriDate } from '../hijri/index.js';
import { createEvent } from '../scheduler/event.js';
import { _ } from '../i18n/index.js';

const LOG_PREFIX = '[Nidaa:Ramadan]';

// ── Daily Ramadan duas (structured, cited) ───────────────────────────
// Source: Various authentic hadith collections
const DAILY_DUAS = [
  {
    text: 'اللَّهُمَّ إِنَّكَ عَفُوٌّ تُحِبُّ الْعَفْوَ فَاعْفُ عَنِّي',
    translation: 'O Allah, You are the Pardoner, You love to pardon, so pardon me.',
    reference: 'At-Tirmidhi 3513',
  },
  {
    text: 'رَبَّنَا تَقَبَّلْ مِنَّا إِنَّكَ أَنتَ السَّمِيعُ الْعَلِيمُ',
    translation: 'Our Lord, accept from us. Indeed, You are the All-Hearing, the All-Knowing.',
    reference: 'Quran 2:127',
  },
  {
    text: 'اللَّهُمَّ إِنِّي ظَلَمْتُ نَفْسِي ظُلْمًا كَثِيرًا وَلَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ فَاغْفِرْ لِي مَغْفِرَةً مِنْ عِنْدِكَ وَارْحَمْنِي إِنَّكَ أَنْتَ الْغَفُورُ الرَّحِيمُ',
    translation: 'O Allah, I have wronged myself greatly, and none forgives sins except You. Grant me forgiveness and have mercy on me, for You are the Forgiving, the Merciful.',
    reference: 'Sahih al-Bukhari 834',
  },
  {
    text: 'اللَّهُمَّ رَبَّ شَهْرِ رَمَضَانَ الَّذِي أَنزَلْتَ فِيهِ الْقُرْآنَ وَاجْعَلْنِي مِنَ الْمُقْتَنِينَ',
    translation: 'O Allah, Lord of the month of Ramadan, in which You revealed the Quran, make me among those who adhere to it.',
    reference: 'Al-Bayhaqi, Shu\'ab al-Iman',
  },
  {
    text: 'سُبْحَانَ ذِي الْمُلْكِ وَالْمَلَكُوتِ سُبْحَانَ ذِي الْعِزَّةِ وَالْعَظَمَةِ وَالْهَيْبَةِ وَالْقُدْرَةِ وَالْكِبْرِيَاءِ وَالْجَبَرُوتِ',
    translation: 'Glory be to the Possessor of dominion and sovereignty. Glory be to the Possessor of might, majesty, awe, power, pride, and grandeur.',
    reference: 'Sahih Muslim 2730',
  },
  {
    text: 'اللَّهُمَّ أَهِلَّهُ عَلَيْنَا بِالْأَمْنِ وَالْإِيمَانِ وَالسَّلَامَةِ وَالْإِسْلَامِ',
    translation: 'O Allah, let it rise over us with security, faith, safety, and submission to Islam.',
    reference: 'Musnad Ahmad 17485 (on fasting the new moon)',
  },
  {
    text: 'اللَّهُمَّ اغْفِرْ لِي وَارْحَمْنِي وَاهْدِنِي وَعَافِنِي وَارْزُقْنِي',
    translation: 'O Allah, forgive me, have mercy on me, guide me, grant me well-being, and provide for me.',
    reference: 'Sahih Muslim 2738',
  },
];

/**
 * Check if a given Hijri date is in Ramadan.
 *
 * @param {Date} [date] - Gregorian date to check (default: now)
 * @returns {boolean}
 */
export function isRamadan(date) {
  const hijri = getHijriDate(date || new Date());
  return hijri && hijri.month === 9;
}

/**
 * Get today's Ramadan dua.
 *
 * @param {Date} [date] - Gregorian date (default: now)
 * @returns {{ text: string, translation: string, reference: string } | null}
 */
export function getDailyDua(date) {
  const now = date || new Date();
  // Use day of year as simple rotating index
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start;
  const dayOfYear = Math.floor(diff / 86400000);
  return DAILY_DUAS[dayOfYear % DAILY_DUAS.length];
}

/**
 * Determine if tonight is an "odd night" of the last ten (Laylat al-Qadr emphasis).
 *
 * In the last ten nights, odd nights (21, 23, 25, 27, 29) are traditionally
 * emphasized as potentially Laylat al-Qadr.
 *
 * @param {Date} [date] - Gregorian date (default: now)
 * @returns {{ isLaylatAlQadrPeriod: boolean, isOddNight: boolean, hijriDay: number } | null}
 */
export function getLaylatAlQadrInfo(date) {
  const hijri = getHijriDate(date || new Date());
  if (!hijri || hijri.month !== 9) return null;

  const isLastTen = hijri.day >= 21;
  // Odd nights: 21, 23, 25, 27, 29
  const isOddNight = isLastTen && hijri.day % 2 === 1;

  return {
    isLaylatAlQadrPeriod: isLastTen,
    isOddNight,
    hijriDay: hijri.day,
  };
}

/**
 * Creates the Ramadan event provider.
 *
 * @param {object} opts
 * @param {object} opts.prayerTimes - Output of calculatePrayerTimes()
 * @param {object} opts.settings   - GSettings instance
 * @param {Date}   [opts.now]      - Injected Date (testing)
 * @returns {function(Date): Event[]} Provider function
 */
export function createRamadanProvider({ prayerTimes, settings, now }) {
  return function ramadanProvider(currentDate) {
    const ref = now || currentDate || new Date();
    const forced = settings && settings.get_boolean && settings.get_boolean('force-ramadan');
    const enabled = settings && settings.get_boolean && settings.get_boolean('ramadan-enabled');

    if (!enabled) return [];
    if (!isRamadan(ref) && !forced) return [];

    const events = [];

    if (!prayerTimes) return [];

    // --- Taraweeh reminder (after Isha) ---
    const taraweehEnabled = settings.get_boolean('ramadan-taraweeh-enabled');
    if (taraweehEnabled && prayerTimes.isha) {
      const offset = settings.get_int('ramadan-taraweeh-offset');
      const taraweehTime = new Date(prayerTimes.isha.getTime() + offset * 60000);
      if (taraweehTime.getTime() > ref.getTime()) {
        events.push(createEvent({
          id: `ramadan-taraweeh-${currentDate}`,
          type: 'adhkar',
          title: '🕌 ' + _('Taraweeh'),
          description: _('Time for Taraweeh prayer.'),
          time: taraweehTime,
          priority: 4,
        }));
      }
    }

    // --- Laylat al-Qadr reminder (last 10 nights) ---
    const qadrEnabled = settings.get_boolean('ramadan-laylat-qadr-enabled');
    if (qadrEnabled) {
      const qadrInfo = getLaylatAlQadrInfo(ref);
      if (qadrInfo && qadrInfo.isLaylatAlQadrPeriod && prayerTimes.maghrib) {
        // Remind at Maghrib time
        const qadrTime = new Date(prayerTimes.maghrib.getTime() + 15 * 60000); // 15 min after Maghrib
        if (qadrTime.getTime() > ref.getTime()) {
          const isOdd = qadrInfo.isOddNight;
          const title = isOdd
            ? '🌙 ' + _('Laylat al-Qadr (Odd Night)')
            : '🌙 ' + _('Last Ten Nights');
          const body = isOdd
            ? `This may be Laylat al-Qadr — the Night of Decree. The Prophet ﷺ said: "Seek it in the odd nights of the last ten days of Ramadan." (Bukhari 2020)`
            : `We are in the last ten nights of Ramadan. Seek Laylat al-Qadr — the Night of Decree, better than a thousand months.`;

          events.push(createEvent({
            id: `ramadan-qadr-${currentDate}`,
            type: 'reminder',
            title,
            description: body,
            time: qadrTime,
            priority: 8,
          }));
        }
      }
    }

    // --- Daily Ramadan dua ---
    const duaEnabled = settings.get_boolean('ramadan-daily-dua-enabled');
    if (duaEnabled && prayerTimes.fajr) {
      const duaTime = new Date(prayerTimes.fajr.getTime() + 5 * 60000); // 5 min after Fajr
      const dua = getDailyDua(ref);
      if (dua && duaTime.getTime() > ref.getTime()) {
        events.push(createEvent({
          id: `ramadan-dua-${currentDate}`,
          type: 'reminder',
          title: '🤲 ' + _('Daily Ramadan Dua'),
          description: `${dua.text}\n\n${dua.translation}\n\n${dua.reference}`,
          time: duaTime,
          priority: 3,
        }));
      }
    }

    return events;
  };
}

/**
 * Format suhoor countdown for the panel indicator.
 * "Suhoor ends in 1h 23m"
 *
 * @param {object} prayerTimes - Prayer times with fajr
 * @param {number} tzHours     - Timezone offset in hours
 * @param {Date}   [now]       - Current time
 * @returns {string | null} Countdown text or null if not in suhoor window
 */
export function getSuhoorCountdown(prayerTimes, tzHours, now) {
  if (!prayerTimes || !prayerTimes.fajr) return null;
  const ref = now || new Date();

  // Suhoor window: from midnight to Fajr
  const fajrMs = prayerTimes.fajr.getTime();
  const refMs = ref.getTime();

  // Rough midnight check: 2 hours before Fajr is a reasonable cutoff
  const suhoorEndMs = fajrMs;
  const suhoorStartMs = fajrMs - 6 * 3600000; // ~6 hours before Fajr

  if (refMs < suhoorStartMs || refMs >= suhoorEndMs) return null;

  const minutesLeft = Math.round((suhoorEndMs - refMs) / 60000);
  const h = Math.floor(minutesLeft / 60);
  const m = minutesLeft % 60;

  if (h > 0) {
    return m > 0 ? `Suhoor ends in ${h}h ${m}m` : `Suhoor ends in ${h}h`;
  }
  return `Suhoor ends in ${m}m`;
}

/**
 * Format iftar countdown for the panel indicator.
 * "Iftar in 2h 45m"
 *
 * @param {object} prayerTimes - Prayer times with maghrib
 * @param {number} tzHours     - Timezone offset in hours
 * @param {Date}   [now]       - Current time
 * @returns {string | null} Countdown text or null if past Maghrib
 */
export function getIftarCountdown(prayerTimes, tzHours, now) {
  if (!prayerTimes || !prayerTimes.maghrib) return null;
  const ref = now || new Date();

  const maghribMs = prayerTimes.maghrib.getTime();
  const refMs = ref.getTime();

  if (refMs >= maghribMs) return null;

  const minutesLeft = Math.round((maghribMs - refMs) / 60000);
  const h = Math.floor(minutesLeft / 60);
  const m = minutesLeft % 60;

  if (h > 0) {
    return m > 0 ? `Iftar in ${h}h ${m}m` : `Iftar in ${h}h`;
  }
  return `Iftar in ${m}m`;
}
