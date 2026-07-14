import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import Extension from 'resource:///org/gnome/shell/extensions/extension.js';
import { PopupMenu } from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { resolveLocation } from './src/core/location/index.js';
import { PrayerIndicator } from './src/ui/indicator/index.js';
import { Scheduler } from './src/core/scheduler/index.js';
import { createPrayerProvider } from './src/core/prayer/index.js';
import { createAdhkarProvider } from './src/core/adhkar/index.js';
import { createQuranProvider } from './src/core/quran/provider.js';
import { showNotification, destroyNotifications } from './src/core/notifications/index.js';
import { QuranPopupSection } from './src/ui/popup/index.js';
import { setup as setupI18n, setLanguage } from './src/core/i18n/index.js';
import { createRamadanProvider } from './src/core/ramadan/index.js';
import { createIslamicEventsProvider } from './src/core/events/index.js';

const LOG_PREFIX = '[Nidaa]';
const SCHEMA_ID = 'org.gnome.shell.extensions.nidaa';

/**
 * Settings keys that affect prayer time calculation.
 * When any of these change, the scheduler must be refreshed.
 */
const CALC_SETTINGS_KEYS = [
  'prayer-method',
  'asr-method',
  'high-latitude-method',
  'fajr-angle',
  'isha-angle',
  'offset-fajr',
  'offset-dhuhr',
 'offset-asr',
  'offset-maghrib',
  'offset-isha',
  'notifications-enabled',
  'notify-fajr',
  'notify-dhuhr',
  'notify-asr',
  'notify-maghrib',
  'notify-isha',
  'prayer-iqamah-reminder-offset',
  'prayer-ending-soon-offset',
  'adhkar-enabled',
  'adhkar-language',
  'adhkar-morning-offset',
  'adhkar-evening-offset',
  'adhkar-post-prayer-offset',
  'adhkar-post-fajr',
  'adhkar-post-dhuhr',
  'adhkar-post-asr',
  'adhkar-post-maghrib',
  'adhkar-post-isha',
  'quran-enabled',
  'quran-frequency',
  'quran-daily-goal',
  'quran-offset',
  'quran-window-start',
  'quran-window-end',
  'ui-language',
  'ramadan-enabled',
  'force-ramadan',
  'ramadan-taraweeh-enabled',
  'ramadan-taraweeh-offset',
  'ramadan-laylat-qadr-enabled',
  'ramadan-daily-dua-enabled',
  'events-friday-enabled',
  'events-friday-thursday-hour',
  'events-friday-morning-hour',
  'events-friday-afternoon-hour',
  'events-ashura-enabled',
  'events-ashura-daybefore',
  'events-arafah-enabled',
  'events-arafah-daybefore',
  'events-whitedays-enabled',
];

/**
 * Settings keys that affect location resolution.
 * When any of these change, location must be re-resolved.
 */
const LOCATION_SETTINGS_KEYS = [
  'location-mode',
  'manual-latitude',
  'manual-longitude',
];

export default class NidaaExtension extends Extension {
  enable() {
    console.log(`${LOG_PREFIX} enabling`);
    this._indicator = null;
    this._resolveAttempted = false;
    this._providerUnsub = null;
    this._adhkarUnsub = null;
    this._quranUnsub = null;
    this._ramadanUnsub = null;
    this._eventsUnsub = null;
    this._quranSection = null;
    this._signalIds = [];
    this._currentLocation = null;

    // --- Settings ---
    this._settings = this._loadSettings();

    // --- i18n ---
    try {
      setupI18n(this.path);
      const lang = this._settings ? this._settings.get_string('ui-language') : 'en';
      setLanguage(lang && lang !== '' ? lang : 'en');
    } catch (err) {
      console.warn(`${LOG_PREFIX} i18n setup failed: ${err}`);
    }

    // --- Scheduler ---
    this._scheduler = new Scheduler({
      onEvent: (event) => {
        showNotification(event);
        // Refresh quran popup so page count stays current
        if (this._quranSection) this._quranSection.update();
      },
    });
    this._scheduler.enable();

    // --- Connect GSettings change signals ---
    this._connectSettingsSignals();

    // Start location resolution; indicator is created once we have a fix.
    this._startLocationResolution();
  }

  disable() {
    console.log(`${LOG_PREFIX} disabling`);

    // Disconnect all GSettings signals
    this._disconnectSettingsSignals();

    if (this._scheduler) {
      this._scheduler.disable();
      this._scheduler = null;
    }

    if (this._providerUnsub) {
      this._providerUnsub();
      this._providerUnsub = null;
    }

    if (this._adhkarUnsub) {
      this._adhkarUnsub();
      this._adhkarUnsub = null;
    }

    if (this._quranUnsub) {
      this._quranUnsub();
      this._quranUnsub = null;
    }

    if (this._ramadanUnsub) {
      this._ramadanUnsub();
      this._ramadanUnsub = null;
    }

    if (this._eventsUnsub) {
      this._eventsUnsub();
      this._eventsUnsub = null;
    }

    if (this._quranSection) {
      this._quranSection.destroy();
      this._quranSection = null;
    }

    destroyNotifications();

    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }

    this._settings = null;
    this._resolveAttempted = false;
    this._currentLocation = null;
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
  //  GSettings change signal wiring
  // ------------------------------------------------------------------

  _connectSettingsSignals() {
    if (!this._settings) return;

    // Prayer calculation settings → refresh scheduler
    for (const key of CALC_SETTINGS_KEYS) {
      try {
        const id = this._settings.connect(`changed::${key}`, () => {
          console.log(`${LOG_PREFIX} setting "${key}" changed — refreshing scheduler`);
          this._onCalcSettingsChanged();
        });
        this._signalIds.push(id);
      } catch (err) {
        console.warn(`${LOG_PREFIX} could not connect to changed::${key}: ${err}`);
      }
    }

    // Location settings → re-resolve location
    for (const key of LOCATION_SETTINGS_KEYS) {
      try {
        const id = this._settings.connect(`changed::${key}`, () => {
          console.log(`${LOG_PREFIX} setting "${key}" changed — re-resolving location`);
          this._onLocationSettingsChanged();
        });
        this._signalIds.push(id);
      } catch (err) {
        console.warn(`${LOG_PREFIX} could not connect to changed::${key}: ${err}`);
      }
    }

    console.log(`${LOG_PREFIX} connected ${this._signalIds.length} settings signals`);
  }

  _disconnectSettingsSignals() {
    if (this._settings && this._signalIds.length > 0) {
      for (const id of this._signalIds) {
        this._settings.disconnect(id);
      }
      this._signalIds = [];
    }
  }

  /**
   * Called when any prayer calculation setting changes.
   * Re-registers the provider and refreshes the scheduler so new events
   * are generated with the updated calculation parameters.
   */
  _onCalcSettingsChanged() {
    if (!this._scheduler) return;

    // Re-register all providers with current location (they read settings live)
    if (this._currentLocation) {
      this._registerPrayerProvider(this._currentLocation);
      this._registerAdhkarProvider(this._currentLocation);
      this._registerQuranProvider(this._currentLocation);
      this._registerRamadanProvider();
      this._registerEventsProvider();
    }

    // Refresh quran popup if visible
    if (this._quranSection) this._quranSection.update();

    this._scheduler.refresh();
    console.log(`${LOG_PREFIX} scheduler refreshed after calc settings change`);
  }

  /**
   * Called when any location setting changes.
   * Re-resolves the location and refreshes the scheduler.
   */
  _onLocationSettingsChanged() {
    if (!this._scheduler) return;
    this._resolveAttempted = false;
    this._startLocationResolution();
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
        this._currentLocation = location;
        this._indicator.setLocation(location);

        // Register the real prayer provider with the scheduler
        this._registerPrayerProvider(location);

        // Register the adhkar provider
        this._registerAdhkarProvider(location);

        // Register the quran provider
        this._registerQuranProvider(location);

        // Register the ramadan provider (conditionally active)
        this._registerRamadanProvider();

        // Register the Islamic events provider
        this._registerEventsProvider();

        // Attach quran popup section to the indicator
        this._ensureQuranSection();

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
   * Register the adhkar event provider with the scheduler.
   * Unregisters any previous adhkar provider first.
   */
  _registerAdhkarProvider(location) {
    if (this._adhkarUnsub) {
      this._adhkarUnsub();
      this._adhkarUnsub = null;
    }

    const provider = createAdhkarProvider({
      location,
      settings: this._settings,
    });

    this._adhkarUnsub = this._scheduler.addProvider(provider);
    console.log(`${LOG_PREFIX} adhkar provider registered`);
  }

  /**
   * Register the quran event provider with the scheduler.
   * Unregisters any previous quran provider first.
   */
  _registerQuranProvider(location) {
    if (this._quranUnsub) {
      this._quranUnsub();
      this._quranUnsub = null;
    }

    const provider = createQuranProvider({
      location,
      settings: this._settings,
    });

    this._quranUnsub = this._scheduler.addProvider(provider);
    console.log(`${LOG_PREFIX} quran provider registered`);
  }

  /**
   * Register the ramadan event provider with the scheduler.
   * The ramadan provider uses the current prayer times and settings.
   */
  _registerRamadanProvider() {
    if (this._ramadanUnsub) {
      this._ramadanUnsub();
      this._ramadanUnsub = null;
    }

    if (!this._currentLocation) return;

    const provider = createRamadanProvider({
      prayerTimes: this._indicator ? this._indicator._prayerTimes : null,
      settings: this._settings,
    });

    this._ramadanUnsub = this._scheduler.addProvider(provider);
    console.log(`${LOG_PREFIX} ramadan provider registered`);
  }

  /**
   * Register the Islamic events provider with the scheduler.
   */
  _registerEventsProvider() {
    if (this._eventsUnsub) {
      this._eventsUnsub();
      this._eventsUnsub = null;
    }

    const provider = createIslamicEventsProvider({
      settings: this._settings,
    });

    this._eventsUnsub = this._scheduler.addProvider(provider);
    console.log(`${LOG_PREFIX} islamic events provider registered`);
  }

  /**
   * Attach the QuranPopupSection to the indicator's popup menu.
   * Also wraps showNotification to refresh the quran popup on each event.
   */
  _ensureQuranSection() {
    if (!this._indicator) return;

    try {
      this._quranSection = new QuranPopupSection();
      this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
      const quranItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
      quranItem.add_child(this._quranSection.actor);
      this._indicator.menu.addMenuItem(quranItem);
      this._quranSection.update();
      console.log(`${LOG_PREFIX} quran popup section attached`);
    } catch (err) {
      console.error(`${LOG_PREFIX} failed to attach quran section: ${err}`);
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
