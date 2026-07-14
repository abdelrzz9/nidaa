import GLib from 'gi://GLib';

import Extension from 'resource:///org/gnome/shell/extensions/extension.js';

import { resolveLocation } from './src/core/location/index.js';
import { PrayerIndicator } from './src/ui/indicator/index.js';
import { Scheduler } from './src/core/scheduler/index.js';
import { createEvent } from './src/core/scheduler/event.js';
import { showNotification, destroyNotifications } from './src/core/notifications/index.js';

const LOG_PREFIX = '[Nidaa]';

export default class NidaaExtension extends Extension {
  enable() {
    console.log(`${LOG_PREFIX} enabling`);
    this._indicator = null;
    this._resolveAttempted = false;

    // --- Scheduler + demo provider ---
    this._scheduler = new Scheduler({ onEvent: showNotification });
    this._scheduler.addProvider(_demoProvider);
    this._scheduler.enable();

    // Start location resolution; indicator is created once we have a fix.
    this._startLocationResolution();
  }

  disable() {
    console.log(`${LOG_PREFIX} disabling`);

    if (this._scheduler) {
      this._scheduler.disable();
      this._scheduler = null;
    }

    destroyNotifications();

    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }

    this._resolveAttempted = false;
  }

  // ------------------------------------------------------------------
  //  Location → Indicator pipeline
  // ------------------------------------------------------------------

  async _startLocationResolution() {
    if (this._resolveAttempted) return;
    this._resolveAttempted = true;

    // Create indicator immediately so the panel has something;
    // it will show "Resolving location…" until the async resolve finishes.
    this._ensureIndicator(null);

    try {
      const location = await resolveLocation();

      // Guard: extension may have been disabled while we were awaiting.
      if (!this._resolveAttempted) return;

      if (location) {
        console.log(
          `${LOG_PREFIX} location resolved: ` +
          `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)} ` +
          `(${location.source})`
        );
        this._indicator.setLocation(location);

        // Tell the scheduler to re-fetch events (prayer times depend on location)
        if (this._scheduler) this._scheduler.refresh();
      } else {
        console.warn(`${LOG_PREFIX} no location available — indicator will stay in placeholder state`);
      }
    } catch (err) {
      console.error(`${LOG_PREFIX} location resolution failed: ${err}`);
    }
  }

  /**
   * Ensure a PrayerIndicator exists in the panel.
   * If location is null the indicator starts in "Resolving…" state.
   */
  _ensureIndicator(location) {
    if (this._indicator) return;

    try {
      this._indicator = new PrayerIndicator(location);
      console.log(`${LOG_PREFIX} indicator added to panel`);
    } catch (err) {
      console.error(`${LOG_PREFIX} failed to create indicator: ${err}`);
    }
  }
}

// ------------------------------------------------------------------
//  Demo event provider — proves the scheduler + notification pipeline
// ------------------------------------------------------------------

/**
 * Fires a test notification 30 seconds after being queried.
 * This is intentionally trivial — real providers (prayer, adhkar, etc.)
 * will be added in later prompts.
 */
function _demoProvider(date) {
  const now = new Date();
  const fireTime = new Date(now.getTime() + 30 * 1000); // 30 s from now

  return [
    createEvent({
      type: 'demo',
      title: 'Nidaa is active',
      description: 'Scheduler and notification pipeline working. This demo fires 30 s after enable.',
      time: fireTime,
      priority: 2, // low priority — gentle nudge, not urgent
      icon: 'alarm-symbolic',
      actions: [
        { label: 'Got it', callback: () => console.log(`${LOG_PREFIX} demo: "Got it" clicked`) },
      ],
    }),
  ];
}
