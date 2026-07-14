#!/usr/bin/env gjs
/*
 * Test location resolution — IP fallback path.
 *
 * Usage:  gjs tests/test-location.js
 */

const LOG_PREFIX = '[Nidaa:Test:Location]';

function tryImport(name) {
  try {
    return imports.gi[name];
  } catch (e) {
    return null;
  }
}

function testCacheRoundtrip() {
  print(`${LOG_PREFIX} --- cache round-trip ---`);

  const GLib = tryImport('GLib');
  const Gio = tryImport('Gio');
  if (!GLib || !Gio) {
    print(`${LOG_PREFIX} SKIP: GLib/Gio not available`);
    return true;
  }

  try {
    const dataDir = GLib.get_user_data_dir();
    const cacheDir = GLib.build_filenamev([dataDir, 'nidaa']);
    const cachePath = GLib.build_filenamev([cacheDir, 'last-location.json']);
    GLib.mkdir_with_parents(cacheDir, 0o755);

    const file = Gio.File.new_for_path(cachePath);
    const testPayload = JSON.stringify({
      latitude: 36.8065,
      longitude: 10.1815,
      timestamp: Date.now(),
      source: 'ip',
    });
    const encoder = new TextEncoder();
    file.replace_contents(encoder.encode(testPayload), null, false, Gio.FileCreateFlags.NONE, null);

    const [, contents] = file.load_contents(null);
    const decoded = JSON.parse(new TextDecoder().decode(contents));

    const ok = decoded.latitude === 36.8065 && decoded.longitude === 10.1815;
    print(`${LOG_PREFIX} cache round-trip: ${ok ? 'PASS' : 'FAIL'}`);

    file.delete(null);
    return ok;
  } catch (e) {
    print(`${LOG_PREFIX} FAIL: ${String(e)}`);
    return false;
  }
}

function testIPGeo(loop, cb) {
  print(`${LOG_PREFIX} --- IP geo (ipwho.is) ---`);

  const Soup = tryImport('Soup');
  if (!Soup) {
    print(`${LOG_PREFIX} SKIP: Soup3 not available on this system`);
    cb(true);
    return;
  }

  const session = new Soup.Session();
  const message = Soup.Message.new('GET', 'https://ipwho.is/');

  session.send_and_read_async(
    message,
    Soup.MessagePriority.NORMAL,
    null,
    (source, result) => {
      try {
        const bytes = session.send_and_read_finish(result);
        if (message.status_code !== 200) {
          print(`${LOG_PREFIX} FAIL: HTTP ${message.status_code}`);
          cb(false);
          return;
        }

        const raw = new TextDecoder().decode(bytes.toArray());
        const data = JSON.parse(raw);

        if (!data.success) {
          print(`${LOG_PREFIX} FAIL: API returned success=false`);
          cb(false);
          return;
        }

        print(`  city:      ${data.city}`);
        print(`  country:   ${data.country}`);
        print(`  latitude:  ${data.latitude}`);
        print(`  longitude: ${data.longitude}`);
        print(`  timezone:  ${data.timezone.id}`);
        print(`  flag:      ${data.flag ? data.flag.emoji : ''}`);

        if (typeof data.latitude !== 'number' || typeof data.longitude !== 'number') {
          print(`${LOG_PREFIX} FAIL: missing coordinates`);
          cb(false);
          return;
        }

        print(`${LOG_PREFIX} PASS: got valid coordinates`);
        cb(true);
      } catch (e) {
        print(`${LOG_PREFIX} FAIL: ${String(e)}`);
        cb(false);
      } finally {
        loop.quit();
      }
    }
  );
}

function main() {
  print(`${LOG_PREFIX} === Location module tests ===`);

  const GLib = tryImport('GLib');
  const loop = GLib ? new GLib.MainLoop(null, false) : null;

  const results = [];
  results.push(testCacheRoundtrip());

  if (loop) {
    testIPGeo(loop, function(ipOk) {
      results.push(ipOk);

      const passed = results.filter(Boolean).length;
      const total = results.length;
      print(`${LOG_PREFIX} === ${passed}/${total} tests passed ===`);

      imports.system.exit(passed < total ? 1 : 0);
    });

    loop.run();
  } else {
    const passed = results.filter(Boolean).length;
    const total = results.length;
    print(`${LOG_PREFIX} === ${passed}/${total} tests passed ===`);
    imports.system.exit(passed < total ? 1 : 0);
  }
}

main();
