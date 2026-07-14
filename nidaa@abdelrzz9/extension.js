import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import Extension from 'resource:///org/gnome/shell/extensions/extension.js';

import { resolveLocation } from './src/core/location/index.js';
import { PrayerIndicator } from './src/ui/indicator/index.js';
import { Scheduler } from './src/core/scheduler/index.js';
import { createPrayerProvider } from './src/core/prayer/index.js';
import { showNotification, destroyNotifications } from './src/core/notifications/index.js';

const LOG_PREFIX = '[Nidaa]';
const SCHEMA_ID = 'org.gnome.shell.extensions.nidaa';

export default class NidaaExtension extends Extension {
  enable() {
    console.log(`${LOG_PREFIX} enabling`);
    this._indicator = null;
    this._resolveAttempted = false;
    this._providerUnsub = null;

    // --- Settings ---
    this._settings = this._loadSettings();

    // --- Scheduler ---
    this._scheduler = new Scheduler({ onEvent: showNotification });
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

    if (this._providerUnsub) {
      this._providerUnsub();
      this._providerUnsub = null;
    }

    destroyNotifications();

    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }

    this._settings = null;
    this._resolveAttempted = false;
  }

  // ------------------------------------------------------------------
  //  Settings
  // ------------------------------------------------------------------

  _loadSettings() {
    try {
      const schemaSource = Gio.SettingsSchemaSource.get_default();
      const schema = schemaSource.lookup(SCHEMA_ID, true);
      if (!schema) {
        console.warn(`${LOG_PREFIX} schema ${SCHEMA_ID} not found — using defaults`);
        return null;
      }
      return new Gio.Settings({ settings_schema: schema });
    } catch (err) {
      console.error(`${LOG_PREFIX} failed to load settings: ${err}`);
      return null;
    }
  }

  // ------------------------------------------------------------------
  //  Location → Indicator + Provider pipeline
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

        // Register the real prayer provider with the scheduler
        this._registerPrayerProvider(location);

        // Tell the scheduler to re-fetch events
        if (this._scheduler) this._scheduler.refresh();
      } else {
        console.warn(`${LOG_PREFIX} no location available — indicator will stay in placeholder state`);
      }
    } catch (err) {
      console.error(`${LOG_PREFIX} location resolution failed: ${err}`);
    }
  }

  /**
   * Register the prayer event provider with the scheduler.
   * Unregisters any previous provider first.
   */
  _registerPrayerProvider(location) {
    if (this._providerUnsub) {
      this._providerUnsub();
      this._providerUnsub = null;
    }

    const provider = createPrayerProvider({
      location,
      settings: this._settings,
    });

    this._providerUnsub = this._scheduler.addProvider(provider);
    console.log(`${LOG_PREFIX} prayer provider registered`);
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
