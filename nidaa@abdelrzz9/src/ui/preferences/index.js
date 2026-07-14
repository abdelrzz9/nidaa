/*
 * Nidaa preferences window — assembles all preference pages.
 *
 * The Extension.Preferences.fillPreferencesWindow() method receives
 * an Adw.PreferencesWindow. We add our pages to it.
 *
 * Pages:
 *   1. Prayer — calculation method, madhab, high-latitude, per-prayer offsets
 *   2. Location — mode, manual lat/lng, city search, current status
 *   3. Adhkar — enable/disable, language, timing, per-prayer toggles
 */

import Gio from 'gi://Gio';

import { buildPrayerPage } from './prayer_page.js';
import { buildLocationPage } from './location_page.js';
import { buildAdhkarPage } from './adhkar_page.js';

const LOG_PREFIX = '[Nidaa:Prefs]';
const SCHEMA_ID = 'org.gnome.shell.extensions.nidaa';

/**
 * Load the extension's GSettings.
 * Returns null if the schema is not found (graceful degradation).
 *
 * @returns {Gio.Settings|null}
 */
function _loadSettings() {
  try {
    const schemaSource = Gio.SettingsSchemaSource.get_default();
    const schema = schemaSource.lookup(SCHEMA_ID, true);
    if (!schema) {
      console.warn(`${LOG_PREFIX} schema ${SCHEMA_ID} not found`);
      return null;
    }
    return new Gio.Settings({ settings_schema: schema });
  } catch (err) {
    console.error(`${LOG_PREFIX} failed to load settings: ${err}`);
    return null;
  }
}

/**
 * Fill the Adw.PreferencesWindow with our pages.
 *
 * @param {Adw.PreferencesWindow} window
 */
export function fillPreferencesWindow(window) {
  const settings = _loadSettings();
  if (!settings) {
    console.error(`${LOG_PREFIX} cannot build preferences — settings unavailable`);
    return;
  }

  // Add pages in order
  const prayerPage = buildPrayerPage(settings);
  const locationPage = buildLocationPage(settings);
  const adhkarPage = buildAdhkarPage(settings);

  window.add(prayerPage);
  window.add(locationPage);
  window.add(adhkarPage);

  // Set a reasonable default size for the preferences window
  window.set_default_size(600, 500);

  console.log(`${LOG_PREFIX} preferences window filled`);
}
