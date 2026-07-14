import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { resolveViaGeoclue } from './geoclue.js';
import { resolveViaIP } from './ipgeo.js';
import { readCachedLocation, writeCachedLocation } from './cache.js';

const LOG_PREFIX = '[Nidaa:Location:Resolver]';

const SCHEMA_ID = 'org.gnome.shell.extensions.nidaa';

let _settings = null;

function getSettings() {
  if (!_settings) {
    const schemaSource = Gio.SettingsSchemaSource.get_default();
    const schema = schemaSource.lookup(SCHEMA_ID, true);
    if (!schema) {
      console.warn(`${LOG_PREFIX} schema ${SCHEMA_ID} not found — settings will return defaults`);
      return null;
    }
    _settings = new Gio.Settings({ settings_schema: schema });
  }
  return _settings;
}

function readManualLocation() {
  const settings = getSettings();
  if (!settings) return null;

  const mode = settings.get_string('location-mode');
  if (mode !== 'manual') return null;

  const lat = settings.get_double('manual-latitude');
  const lng = settings.get_double('manual-longitude');

  if (lat === 0 && lng === 0) {
    console.log(`${LOG_PREFIX} manual mode selected but coordinates are (0, 0) — skipping`);
    return null;
  }

  console.log(`${LOG_PREFIX} resolved via settings: ${lat}, ${lng}`);
  return {
    latitude: lat,
    longitude: lng,
    source: 'manual',
    timestamp: Date.now(),
  };
}

export async function resolveLocation() {
  console.log(`${LOG_PREFIX} starting location resolution`);

  // Step 1 — manual (cheapest, no I/O beyond GSettings)
  const manual = readManualLocation();
  if (manual) return manual;

  // Step 2 — Geoclue (best accuracy, privacy-respecting)
  const geoclue = await resolveViaGeoclue();
  if (geoclue) {
    writeCachedLocation(geoclue);
    return geoclue;
  }

  // Step 3 — IP geo (network)
  const ip = await resolveViaIP();
  if (ip) {
    writeCachedLocation(ip);
    return ip;
  }

  // Step 4 — cached (offline)
  const cached = readCachedLocation();
  if (cached) return cached;

  console.log(`${LOG_PREFIX} all sources exhausted — returning null`);
  return null;
}
