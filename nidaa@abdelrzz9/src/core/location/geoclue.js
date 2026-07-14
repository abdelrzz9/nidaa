import Gio from 'gi://Gio';

const LOG_PREFIX = '[Nidaa:Location:Geoclue]';

const GC_BUS_NAME = 'org.freedesktop.GeoClue2';
const GC_MANAGER_PATH = '/org/freedesktop/GeoClue2/Manager';
const GC_MANAGER_IFACE = 'org.freedesktop.GeoClue2.Manager';
const GC_CLIENT_IFACE = 'org.freedesktop.GeoClue2.Client';
const GC_LOCATION_IFACE = 'org.freedesktop.GeoClue2.Location';

export async function resolveViaGeoclue(cancellable = null) {
  try {
    const manager = await Gio.DBusProxy.makeProxyAsync(
      Gio.DBusProxy,
      Gio.DBus.system,
      GC_BUS_NAME,
      GC_MANAGER_PATH,
      GC_MANAGER_IFACE,
      cancellable
    );

    const clientPath = await manager.GetClientRemote(cancellable);
    console.log(`${LOG_PREFIX} client created at ${clientPath}`);

    const client = await Gio.DBusProxy.makeProxyAsync(
      Gio.DBusProxy,
      Gio.DBus.system,
      GC_BUS_NAME,
      clientPath,
      GC_CLIENT_IFACE,
      cancellable
    );

    client.DesktopId = 'nidaa';
    client.RequestedAccuracyLevel = 4;

    await client.StartRemote(cancellable);

    const locationPath = await client.LocationRemote(cancellable);
    if (!locationPath || locationPath === '/') {
      throw new Error('Geoclue returned empty location path');
    }

    const location = await Gio.DBusProxy.makeProxyAsync(
      Gio.DBusProxy,
      Gio.DBus.system,
      GC_BUS_NAME,
      locationPath,
      GC_LOCATION_IFACE,
      cancellable
    );

    const latitude = location.Latitude;
    const longitude = location.Longitude;

    if (latitude === 0 && longitude === 0) {
      throw new Error('Geoclue returned (0, 0) — likely permission denied or no fix');
    }

    console.log(`${LOG_PREFIX} resolved via Geoclue: ${latitude}, ${longitude}`);

    await client.StopRemote(cancellable);

    return {
      latitude,
      longitude,
      source: 'geoclue',
      timestamp: Date.now(),
    };
  } catch (err) {
    console.log(`${LOG_PREFIX} failed: ${err.message || err}`);
    return null;
  }
}
