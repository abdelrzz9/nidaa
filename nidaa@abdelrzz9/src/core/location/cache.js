import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const LOG_PREFIX = '[Nidaa:Location:Cache]';

export function getCacheDir() {
  return GLib.buildFilenamev([GLib.getUserDataDir(), 'nidaa']);
}

export function getCachePath() {
  return GLib.buildFilenamev([getCacheDir(), 'last-location.json']);
}

export function ensureCacheDir() {
  const dir = getCacheDir();
  GLib.mkdirWithParent(dir, 0o755);
  return dir;
}

export function readCachedLocation() {
  const path = getCachePath();
  try {
    const file = Gio.File.newForPath(path);
    if (!file.queryExists(null)) {
      console.log(`${LOG_PREFIX} no cache file at ${path}`);
      return null;
    }
    const [, contents] = file.loadContents(null);
    const data = JSON.parse(new TextDecoder().decode(contents));
    if (data && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
      console.log(`${LOG_PREFIX} loaded cached location from ${path}`);
      return { ...data, source: 'cached' };
    }
    console.log(`${LOG_PREFIX} invalid cache data`);
    return null;
  } catch (err) {
    console.log(`${LOG_PREFIX} failed to read cache: ${err}`);
    return null;
  }
}

export function writeCachedLocation(location) {
  try {
    ensureCacheDir();
    const path = getCachePath();
    const file = Gio.File.newForPath(path);
    const payload = {
      latitude: location.latitude,
      longitude: location.longitude,
      timestamp: location.timestamp || Date.now(),
      source: location.source || 'unknown',
    };
    const encoder = new TextEncoder();
    file.replaceContents(
      encoder.encode(JSON.stringify(payload, null, 2)),
      null,
      false,
      Gio.FileCreateFlags.NONE,
      null
    );
    console.log(`${LOG_PREFIX} cached location to ${path}`);
  } catch (err) {
    console.log(`${LOG_PREFIX} failed to write cache: ${err}`);
  }
}
