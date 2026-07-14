/*
 * Prayer popup menu section.
 *
 * Displays today's six times (Fajr → Isha) inside the indicator's
 * PopupMenu.  Each row is styled according to its state:
 *
 *   ✓ Fajr      05:30      (passed)
 *   ▶ Dhuhr     12:30  18m (next — highlighted, countdown)
 *     Asr       15:45      (future — dimmed)
 *     Maghrib   18:20
 *     Isha      19:45
 *
 * Also exports QuranPopupSection showing daily reading progress:
 *   📖 Quran
 *   Today's Goal
 *     2 / 5 Pages
 *     [ +1 Page ]
 *
 * Zero GNOME Shell UI imports — purely St widget construction.
 */

import St from 'gi://St';
import Clutter from 'gi://Clutter';

import { readProgress, incrementPage } from '../../core/quran/store.js';
import { getHijriDate } from '../../core/hijri/index.js';
import { isRamadan } from '../../core/ramadan/index.js';
import { getNextIslamicEvent } from '../../core/events/index.js';
import { _ } from '../../core/i18n/index.js';

const LOG_PREFIX = '[Nidaa:Popup]';

/**
 * Ordered list of prayer entries.
 * `key` matches the property name returned by calculatePrayerTimes().
 */
const PRAYER_ORDER = [
  { key: 'fajr',    label: 'Fajr' },
  { key: 'sunrise', label: 'Sunrise' },
  { key: 'dhuhr',   label: 'Dhuhr' },
  { key: 'asr',     label: 'Asr' },
  { key: 'maghrib', label: 'Maghrib' },
  { key: 'isha',    label: 'Isha' },
];

/**
 * Format a Date as "HH:MM" in the given UTC-offset timezone.
 *
 * calculatePrayerTimes returns Date objects whose UTC value encodes
 * the local prayer time.  We recover local HH:MM by adding the
 * timezone offset to the UTC timestamp and reading the UTC components.
 */
function formatTime(date, tzHours) {
  if (!date) return '--:--';
  const localMs = date.getTime() + tzHours * 3600000;
  const d = new Date(localMs);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Build a St.BoxLayout for a single prayer row.
 *
 * @param {string} label      - Display name ("Fajr", "Asr", …)
 * @param {string} timeStr    - Formatted "HH:MM"
 * @param {'passed'|'next'|'future'} state
 * @param {number|null} minutesLeft - Minutes until next prayer (only for 'next')
 * @returns {St.BoxLayout}
 */
function buildRow(label, timeStr, state, minutesLeft) {
  const box = new St.BoxLayout({
    style_class: `nidaa-prayer-row nidaa-prayer-${state}`,
    x_expand: true,
    x_fill: true,
    reactive: false,
  });

  // Status indicator
  let statusText;
  if (state === 'passed') {
    statusText = '✓';
  } else if (state === 'next') {
    statusText = '▶';
  } else {
    statusText = '  ';
  }

  const statusLabel = new St.Label({
    text: statusText,
    style_class: 'nidaa-prayer-status',
    y_align: Clutter.ActorAlign.CENTER,
  });
  box.add_child(statusLabel);

  // Prayer name
  const nameLabel = new St.Label({
    text: label,
    style_class: 'nidaa-prayer-name',
    y_align: Clutter.ActorAlign.CENTER,
    x_expand: true,
  });
  box.add_child(nameLabel);

  // Time
  const timeLabel = new St.Label({
    text: timeStr,
    style_class: 'nidaa-prayer-time',
    y_align: Clutter.ActorAlign.CENTER,
  });
  box.add_child(timeLabel);

  // Countdown (only for next prayer)
  if (state === 'next' && minutesLeft != null) {
    const countdownText = minutesLeft < 60
      ? `${minutesLeft}m`
      : `${Math.floor(minutesLeft / 60)}h${minutesLeft % 60 > 0 ? ` ${minutesLeft % 60}m` : ''}`;
    const countdownLabel = new St.Label({
      text: countdownText,
      style_class: 'nidaa-prayer-countdown',
      y_align: Clutter.ActorAlign.CENTER,
    });
    box.add_child(countdownLabel);
  }

  return box;
}

/**
 * A container that holds prayer rows and can be refreshed.
 *
 * Usage:
 *   const popup = new PrayerPopupSection();
 *   menu.addMenuItem(popup);
 *   popup.update(prayerTimes, tzHours, now);
 */
export class PrayerPopupSection {
  constructor() {
    /** @type {St.BoxLayout} */
    this.actor = new St.BoxLayout({
      style_class: 'nidaa-prayer-popup',
      vertical: true,
      x_fill: true,
    });

    /** @type {St.BoxLayout[]} row references for cleanup */
    this._rows = [];
  }

  /**
   * Remove all current rows.
   */
  _clear() {
    for (const row of this._rows) {
      row.destroy();
    }
    this._rows = [];
  }

  /**
   * Rebuild the popup with current prayer data.
   *
   * @param {object} prayerTimes - Output of calculatePrayerTimes()
   * @param {number} tzHours     - UTC offset in hours for the prayer timezone
   * @param {Date}   [now]       - Current time (default: new Date())
   */
  update(prayerTimes, tzHours, now = new Date()) {
    this._clear();

    if (!prayerTimes) {
      const placeholder = new St.Label({
        text: _('Waiting for location…'),
        style_class: 'nidaa-prayer-placeholder',
      });
      this.actor.add_child(placeholder);
      this._rows.push(placeholder);
      return;
    }

    // --- Ramadan Mode banner ---
    if (isRamadan(now)) {
      const banner = new St.Label({
        text: `🌙 ${_('Ramadan Mode')}`,
        style_class: 'nidaa-ramadan-banner',
      });
      this.actor.add_child(banner);
      this._rows.push(banner);
    }

    // Find the next prayer (first one whose Date is in the future)
    let nextKey = null;
    for (const { key } of PRAYER_ORDER) {
      const t = prayerTimes[key];
      if (t && t.getTime() > now.getTime()) {
        nextKey = key;
        break;
      }
    }

    // If all prayers have passed today, the "next" is tomorrow's Fajr.
    // For display purposes we just highlight the last prayer as most recent.
    // (Midnight recalc will fix this once the date rolls.)

    for (const { key, label } of PRAYER_ORDER) {
      const time = prayerTimes[key];
      if (!time) continue;

      const timeStr = formatTime(time, tzHours);
      let state;
      let minutesLeft = null;

      if (key === nextKey) {
        state = 'next';
        minutesLeft = Math.round((time.getTime() - now.getTime()) / 60000);
      } else if (nextKey === null || time.getTime() <= now.getTime()) {
        state = 'passed';
      } else {
        state = 'future';
      }

      const row = buildRow(_(label), timeStr, state, minutesLeft);
      this.actor.add_child(row);
      this._rows.push(row);
    }

    // --- Hijri date footer ---
    const hijri = getHijriDate(now);
    if (hijri) {
      const hijriText = `${hijri.day} ${hijri.monthName} ${hijri.year} AH`;
      const gregText = now.toLocaleDateString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      });
      const footerText = `${hijriText}  •  ${gregText}`;
      const footer = new St.Label({
        text: footerText,
        style_class: 'nidaa-hijri-footer',
      });
      this.actor.add_child(footer);
      this._rows.push(footer);

      // --- Next upcoming Islamic event ---
      const nextEvent = getNextIslamicEvent(now);
      if (nextEvent && nextEvent.daysLeft > 0) {
        const eventText = `📅 ${nextEvent.name} in ${nextEvent.daysLeft} day${nextEvent.daysLeft > 1 ? 's' : ''}`;
        const eventLabel = new St.Label({
          text: eventText,
          style_class: 'nidaa-hijri-footer',
        });
        this.actor.add_child(eventLabel);
        this._rows.push(eventLabel);
      }
    }
  }

  destroy() {
    this._clear();
    this.actor.destroy();
    this.actor = null;
  }
}

// ------------------------------------------------------------------
//  Quran progress popup section
// ------------------------------------------------------------------

/**
 * Displays daily Quran reading progress in the popup menu:
 *
 *   📖 Quran
 *   Today's Goal
 *     2 / 5 Pages
 *     [ +1 Page ]
 *
 * Usage:
 *   const quran = new QuranPopupSection();
 *   menu.addMenuItem(quran);
 *   quran.update();   // refreshes the display from the store
 */
export class QuranPopupSection {
  constructor() {
    /** @type {St.BoxLayout} */
    this.actor = new St.BoxLayout({
      style_class: 'nidaa-quran-popup',
      vertical: true,
      x_fill: true,
    });

    this._children = [];
  }

  _clear() {
    for (const child of this._children) {
      child.destroy();
    }
    this._children = [];
  }

  /**
   * Refresh the display from the store.
   * Call this after any event fires or after the user taps +1 Page.
   */
  update() {
    this._clear();

    const progress = readProgress();

    // Section header
    const header = new St.Label({
      text: `📖 ${_('Quran')}`,
      style_class: 'nidaa-quran-header',
    });
    this.actor.add_child(header);
    this._children.push(header);

    // Goal label
    const goalLabel = new St.Label({
      text: _("Today's Goal"),
      style_class: 'nidaa-quran-goal-label',
    });
    this.actor.add_child(goalLabel);
    this._children.push(goalLabel);

    // Progress row: "2 / 5 Pages" + button
    const progressBox = new St.BoxLayout({
      style_class: 'nidaa-quran-progress-box',
      x_fill: true,
      x_expand: true,
    });

    const pagesText = `${progress.pagesRead} / ${progress.dailyGoal} ${_('Pages')}`;
    const pagesLabel = new St.Label({
      text: pagesText,
      style_class: 'nidaa-quran-pages',
      y_align: Clutter.ActorAlign.CENTER,
      x_expand: true,
    });
    progressBox.add_child(pagesLabel);

    // +1 Page button
    const plusButton = new St.Button({
      label: _('+1 Page'),
      style_class: 'nidaa-quran-button',
      reactive: true,
      track_hover: true,
      y_align: Clutter.ActorAlign.CENTER,
    });
    plusButton.connect('clicked', () => {
      incrementPage();
      this.update(); // re-render with new count
    });
    progressBox.add_child(plusButton);

    this.actor.add_child(progressBox);
    this._children.push(progressBox);
  }

  destroy() {
    this._clear();
    this.actor.destroy();
    this.actor = null;
  }
}
