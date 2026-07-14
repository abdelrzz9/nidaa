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

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { localTimezoneOffset, METHODS_BY_IDX, HIGH_LAT_RULES } from '../../core/settings-helpers.js';
import { calculatePrayerTimes, getMethodParams } from '../../core/prayer/index.js';
import { PrayerPopupSection, AdhkarPopupSection } from '../popup/index.js';
import { _ } from '../../core/i18n/index.js';
import { isRamadan, getSuhoorCountdown, getIftarCountdown, getDailyDua } from '../../core/ramadan/index.js';

const LOG_PREFIX = '[Nidaa:Indicator]';

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

export class PrayerIndicator extends PanelMenu.Button {
  /**
   * @param {object} location - { latitude, longitude, source, timestamp }
   * @param {Gio.Settings} [settings] - GSettings object for reading method/params
   */
  constructor(location, settings) {
    super(0.0, 'Nidaa', false);

    this._location = location;
    this._settings = settings || null;
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

    // ---- Adhkar section ----
    this._adhkarSection = new AdhkarPopupSection(this._settings);
    this._adhkarItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
    this._adhkarItem.add_child(this._adhkarSection.actor);
    this.menu.addMenuItem(this._adhkarItem);

    // ---- Initial computation ----
    this._refresh();
    this._scheduleTick();
    this._scheduleMidnight();
  }

  // -------------------------------------------------------------------
  //  Prayer time computation
  // -------------------------------------------------------------------

  _getCalcMethod() {
    if (!this._settings) return 'MWL';
    const idx = this._settings.get_int('prayer-method');
    return METHODS_BY_IDX[idx] || 'MWL';
  }

  _getMadhab() {
    if (!this._settings) return 'Shafii';
    return this._settings.get_int('asr-method') === 1 ? 'Hanafi' : 'Shafii';
  }

  _getHighLatRule() {
    if (!this._settings) return 'AngleBased';
    return HIGH_LAT_RULES[this._settings.get_int('high-latitude-method')] || 'AngleBased';
  }

  _getCustomAngles() {
    if (!this._settings) return {};
    return {
      customFajrAngle: this._settings.get_double('fajr-angle'),
      customIshaAngle: this._settings.get_double('isha-angle'),
    };
  }

  _computePrayerTimes() {
    if (!this._location) return null;

    const tzHours = localTimezoneOffset();
    const now = new Date();

    const method = this._getCalcMethod();
    const madhab = this._getMadhab();
    const highLatitudeRule = this._getHighLatRule();

    const params = getMethodParams({ method, ...this._getCustomAngles() });

    return calculatePrayerTimes({
      latitude: this._location.latitude,
      longitude: this._location.longitude,
      timezone: tzHours,
      date: now,
      method,
      madhab,
      highLatitudeRule,
      fajrAngle: params.fajrAngle,
      ishaAngle: params.ishaAngle,
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
    this._label.set_text(this._nextPrayerText(now, tzHours));

    // --- Popup: full list ---
    this._popupSection.update(this._prayerTimes, tzHours, now);

    // --- Adhkar status ---
    this._adhkarSection.update();
  }

  /**
   * Find the upcoming prayer and return a human-readable countdown.
   * @returns {string}
   */
  _nextPrayerText(now, tzHours) {
    if (!this._prayerTimes) return _('Resolving location…');

    if (isRamadan(now)) {
      const suhoor = getSuhoorCountdown(this._prayerTimes, tzHours, now);
      if (suhoor) return suhoor;
      const iftar = getIftarCountdown(this._prayerTimes, tzHours, now);
      if (iftar) return iftar;
    }

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

    if (this._adhkarSection) {
      this._adhkarSection.destroy();
      this._adhkarSection = null;
    }
    this._adhkarItem = null;

    super.destroy();
  }
}
