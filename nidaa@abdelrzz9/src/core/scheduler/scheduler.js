/*
 * Generic event scheduler.
 *
 * Accepts "event provider" functions — each provider, given a Date,
 * returns an array of Events for that day.  The Scheduler collects
 * events from all providers, sorts them by time, and fires a callback
 * each moment an event is due.
 *
 * Designed to be notification-agnostic: it just fires a callback.
 * The caller decides whether to show a desktop notification, update
 * a panel label, play a sound, etc.
 *
 * Requires GLib (for timeouts) — this is the only GNOME dependency.
 * Everything else is pure data flow.
 *
 * Usage:
 *   const s = new Scheduler({ onEvent });
 *   s.addProvider(myProvider);
 *   s.enable();
 *   // … later …
 *   s.disable();
 */

import GLib from 'gi://GLib';
import { sortEvents } from './event.js';

const LOG_PREFIX = '[Nidaa:Scheduler]';

export class Scheduler {
  /**
   * @param {object} opts
   * @param {Function} opts.onEvent  - Called as onEvent(event) when a scheduled event fires
   * @param {Function} [opts.now]    - Injectable clock for testing: () => Date
   * @param {Function} [opts.scheduleFn] - Injectable GLib.timeout_add_seconds for testing
   * @param {Function} [opts.cancelFn]   - Injectable GLib.source_remove for testing
   */
  constructor(opts = {}) {
    this._onEvent = opts.onEvent || (() => {});
    this._providers = [];

    /** @type {Map<string, number>} eventId → GLib source ID */
    this._pending = new Map();
    this._midnightId = 0;
    this._enabled = false;

    // Injectable dependencies for testing (default to real GLib)
    this._now = opts.now || (() => new Date());
    this._scheduleFn = opts.scheduleFn || ((secs, cb) =>
      GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, secs, cb)
    );
    this._cancelFn = opts.cancelFn || ((id) => {
      if (id) GLib.source_remove(id);
    });
  }

  // -----------------------------------------------------------------
  //  Provider management
  // -----------------------------------------------------------------

  /**
   * Register an event provider.
   *
   * A provider is a function: (date: Date) => Event[]
   * where `date` is the day to generate events for (time component ignored).
   *
   * @param {Function} provider
   * @returns {Function} unsubscribe — call to remove the provider
   */
  addProvider(provider) {
    this._providers.push(provider);
    return () => {
      this._providers = this._providers.filter(p => p !== provider);
    };
  }

  // -----------------------------------------------------------------
  //  Lifecycle
  // -----------------------------------------------------------------

  enable() {
    if (this._enabled) return;
    this._enabled = true;
    console.log(`${LOG_PREFIX} enabled`);
    this._scheduleDay(this._now());
  }

  disable() {
    if (!this._enabled) return;
    this._enabled = false;
    console.log(`${LOG_PREFIX} disabled`);
    this._cancelAll();
  }

  // -----------------------------------------------------------------
  //  External refresh trigger
  // -----------------------------------------------------------------

  /**
   * Call this when location or timezone changes.
   * Cancels all pending timeouts and re-schedules from the current moment.
   */
  refresh() {
    if (!this._enabled) return;
    console.log(`${LOG_PREFIX} refreshing`);
    this._cancelAll();
    this._scheduleDay(this._now());
  }

  // -----------------------------------------------------------------
  //  Internal scheduling
  // -----------------------------------------------------------------

  /**
   * Collect events from all providers for the given day, sort them,
   * and schedule a one-shot GLib timeout for each future event.
   */
  _scheduleDay(date) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);

    // Collect from all providers
    let events = [];
    for (const provider of this._providers) {
      try {
        events = events.concat(provider(dayStart));
      } catch (err) {
        console.error(`${LOG_PREFIX} provider error: ${err}`);
      }
    }

    events = sortEvents(events);

    const now = this._now();
    let scheduled = 0;

    for (const event of events) {
      const delayMs = event.time.getTime() - now.getTime();
      if (delayMs < 0) continue; // already past

      const delaySecs = Math.ceil(delayMs / 1000);
      const id = this._scheduleFn(delaySecs, () => {
        this._pending.delete(event.id);
        this._onEvent(event);
        return GLib.SOURCE_REMOVE; // one-shot
      });

      if (id) {
        this._pending.set(event.id, id);
        scheduled++;
      }
    }

    console.log(
      `${LOG_PREFIX} scheduled ${scheduled} event(s) for ` +
      `${dayStart.toISOString().slice(0, 10)}`
    );

    this._scheduleMidnight();
  }

  /**
   * Schedule a one-shot timeout that fires at the next local midnight,
   * then re-collects events for the new day.
   */
  _scheduleMidnight() {
    if (this._midnightId) {
      this._cancelFn(this._midnightId);
      this._midnightId = 0;
    }

    const now = this._now();
    const gNow = GLib.DateTime.new_from_unix_utc(Math.floor(now.getTime() / 1000));
    const gLocal = gNow.to_timezone(GLib.TimeZone.new_local());
    const secsToday = gLocal.get_hour() * 3600 + gLocal.get_minute() * 60 + gLocal.get_second();
    const secondsUntilMidnight = 86400 - secsToday;

    this._midnightId = this._scheduleFn(
      Math.max(1, secondsUntilMidnight),
      () => {
        console.log(`${LOG_PREFIX} midnight — rescheduling`);
        this._midnightId = 0;
        if (this._enabled) {
          this._scheduleDay(this._now());
        }
        return GLib.SOURCE_REMOVE; // one-shot
      }
    );
  }

  /**
   * Cancel every pending timeout (events + midnight).
   */
  _cancelAll() {
    for (const [eventId, id] of this._pending) {
      this._cancelFn(id);
    }
    this._pending.clear();

    if (this._midnightId) {
      this._cancelFn(this._midnightId);
      this._midnightId = 0;
    }
  }
}
