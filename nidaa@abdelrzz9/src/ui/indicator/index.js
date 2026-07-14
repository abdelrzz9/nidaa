/*
 * Top-panel prayer times indicator.
 *
 * Extends PanelMenu.Button to show an icon + live-updating countdown
 * (e.g. "Asr in 18 min") in the GNOME Shell top bar.  Clicking opens
 * a popup with today's full prayer schedule.
 *
 * Lifecycle:
 *   1. Created by extension.enable() with a location object.
 *   2. Immediately computes prayer times and starts a 60-second
 *      refresh timer + a midnight-recalc scheduler.
 *   3. extension.disable() must call indicator.destroy() to clear
 *      all GLib timeouts and disconnect signals.
 *
 * Zero dependency on GNOME Shell internals beyond PanelMenu and PopupMenu.
 */

import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import { PanelMenu } from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { PopupMenu } from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { calculatePrayerTimes } from '../../core/prayer/times.js';
import { PrayerPopupSection } from '../popup/index.js';
import { _ } from '../../core/i18n/index.js';

const LOG_PREFIX = '[Nidaa:Indicator]';

/** Which calculation method to use until a preferences UI exists. */
const DEFAULT_METHOD = 'MWL';

/**
 * Format a minutes-till-prayer value for the panel label.
 *   - "< 60 min"  → "Asr in 18 min"
 *   - "≥ 60 min"  → "Asr in 2h 5m"
 *   - "0 min"     → "Asr now"
 *   - null        → "Nidaa"
 */
function countdownText(prayerName, minutesLeft) {
  if (minutesLeft == null) return _('Nidaa');
  if (minutesLeft <= 0) return `${prayerName} ${_('now')}`;
  if (minutesLeft < 60) return `${prayerName} ${_('in')} ${minutesLeft} ${_('min')}`;
  const h = Math.floor(minutesLeft / 60);
  const m = minutesLeft % 60;
  return m > 0
    ? `${prayerName} ${_('in')} ${h}${_('h')} ${m}${_('min')}`
    : `${prayerName} ${_('in')} ${h}${_('h')}`;
}

/**
 * Compute the local UTC offset in hours using pure JavaScript.
 * Avoids the GLib.DateTime.get_utc_offset() issue where the return
 * value may be in microseconds (GTimeSpan) depending on the GJS version.
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

export class PrayerIndicator extends PanelMenu.Button {
  /**
   * @param {object} location - { latitude, longitude, source, timestamp }
   */
  constructor(location) {
    super(0.0, 'Nidaa', false);

    this._location = location;
    this._prayerTimes = null;
    this._tickId = 0;
    this._midnightId = 0;

    // ---- Panel actor (icon + label) ----
    this._panelBox = new St.BoxLayout({
      style_class: 'panel-status-menu-box nidaa-indicator',
    });

    this._icon = new St.Icon({
      icon_name: 'alarm-symbolic',
      style_class: 'system-status-icon nidaa-icon',
    });
    this._panelBox.add_child(this._icon);

    this._label = new St.Label({
      text: _('Resolving location…'),
      style_class: 'nidaa-label',
      y_align: Clutter.ActorAlign.CENTER,
    });
    this._panelBox.add_child(this._label);

    this.add_child(this._panelBox);

    // ---- Popup menu ----
    this._popupSection = new PrayerPopupSection();
    this._popupItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
    this._popupItem.add_child(this._popupSection.actor);
    this.menu.addMenuItem(this._popupItem);

    // ---- Initial computation ----
    this._refresh();
    this._scheduleTick();
    this._scheduleMidnight();
  }

  // -------------------------------------------------------------------
  //  Prayer time computation
  // -------------------------------------------------------------------

  _computePrayerTimes() {
    if (!this._location) return null;

    const tzHours = localTimezoneOffset();
    const now = new Date();

    return calculatePrayerTimes({
      latitude: this._location.latitude,
      longitude: this._location.longitude,
      timezone: tzHours,
      date: now,
      method: DEFAULT_METHOD,
    });
  }

  /**
   * Recompute prayer times and update all UI elements.
   */
  _refresh() {
    this._prayerTimes = this._computePrayerTimes();
    const now = new Date();
    const tzHours = localTimezoneOffset();

    // --- Panel label: next prayer countdown ---
    this._label.set_text(this._nextPrayerText(now));

    // --- Popup: full list ---
    this._popupSection.update(this._prayerTimes, tzHours, now);
  }

  /**
   * Find the upcoming prayer and return a human-readable countdown.
   * @returns {string}
   */
  _nextPrayerText(now) {
    if (!this._prayerTimes) return _('Resolving location…');

    const prayers = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
    for (const key of prayers) {
      const t = this._prayerTimes[key];
      if (t && t.getTime() > now.getTime()) {
        const minutesLeft = Math.round((t.getTime() - now.getTime()) / 60000);
        const label = key.charAt(0).toUpperCase() + key.slice(1);
        return countdownText(label, minutesLeft);
      }
    }

    // All prayers passed → "Isha passed" or just show the last one
    return 'Nidaa';
  }

  // -------------------------------------------------------------------
  //  Timers
  // -------------------------------------------------------------------

  /**
   * Fire every 60 seconds to refresh the countdown label.
   */
  _scheduleTick() {
    this._tickId = GLib.timeout_add_seconds(
      GLib.PRIORITY_DEFAULT,
      60,
      () => {
        this._refresh();
        return GLib.SOURCE_CONTINUE; // keep ticking
      }
    );
    // GLib.timeout_add_seconds returns 0 on failure in some GJS versions;
    // store the id regardless — destroy() will ignore 0.
  }

  /**
   * Schedule a one-shot timeout to fire at the next local midnight,
   * then recompute prayer times for the new day and reschedule.
   */
  _scheduleMidnight() {
    if (this._midnightId) {
      GLib.source_remove(this._midnightId);
      this._midnightId = 0;
    }

    const now = GLib.DateTime.new_now_local();
    const secsToday = now.get_hour() * 3600 + now.get_minute() * 60 + now.get_second();
    const secondsUntilMidnight = 86400 - secsToday; // seconds remaining in the day

    this._midnightId = GLib.timeout_add_seconds(
      GLib.PRIORITY_DEFAULT,
      Math.max(1, secondsUntilMidnight),
      () => {
        console.log(`${LOG_PREFIX} midnight — recomputing prayer times`);
        this._refresh();
        this._scheduleMidnight(); // reschedule for the following midnight
        return GLib.SOURCE_REMOVE; // one-shot
      }
    );
  }

  // -------------------------------------------------------------------
  //  Location update (called by extension if location changes)
  // -------------------------------------------------------------------

  /**
   * @param {object} location - { latitude, longitude, source, timestamp }
   */
  setLocation(location) {
    this._location = location;
    this._refresh();
  }

  // -------------------------------------------------------------------
  //  Cleanup
  // -------------------------------------------------------------------

  destroy() {
    console.log(`${LOG_PREFIX} destroying`);

    if (this._tickId) {
      GLib.source_remove(this._tickId);
      this._tickId = 0;
    }
    if (this._midnightId) {
      GLib.source_remove(this._midnightId);
      this._midnightId = 0;
    }

    this._popupSection.destroy();
    this._popupSection = null;
    this._popupItem = null;

    super.destroy();
  }
}
