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
 * Zero GNOME Shell UI imports — purely St widget construction.
 */

import St from 'gi://St';
import Clutter from 'gi://Clutter';

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
        text: 'Waiting for location…',
        style_class: 'nidaa-prayer-placeholder',
      });
      this.actor.add_child(placeholder);
      this._rows.push(placeholder);
      return;
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

      const row = buildRow(label, timeStr, state, minutesLeft);
      this.actor.add_child(row);
      this._rows.push(row);
    }
  }

  destroy() {
    this._clear();
    this.actor.destroy();
    this.actor = null;
  }
}
