# Nidaa — Islamic Prayer Times for GNOME Shell

**Nidaa** (ندا‎, "the call") is a GNOME Shell extension that brings
accurate Islamic prayer times, notifications, and spiritual tools
directly to your desktop.

Built with **GJS** (GNOME Shell's JavaScript runtime) for **GNOME Shell 45+**,
using the modern ESM module system.

## Features (in development)

- Prayer time calculation (multiple methods)
- Desktop notifications at adhan time
- Hijri calendar integration
- Qibla direction indicator
- Daily adhkar (remembrances)
- Quran verse of the day
- Location auto-detection or manual entry

## Development Install

```bash
# Symlink the source directory so GNOME Shell picks it up
./build.sh install

# Or use make
make install
```

Then **restart GNOME Shell**:

| Session | How to reload |
|---------|--------------|
| **X11**  | Press `Alt+F2`, type `r`, press Enter |
| **Wayland** | Log out and log back in (or restart with `gnome-session-quit --no-prompt`) |

After reloading, enable the extension via:

- **GNOME Extensions** app, or
- `gnome-extensions enable nidaa@abdelrzz9`

## Viewing Logs

```bash
journalctl -f -o cat /usr/bin/gnome-shell
```

Filter to Nidaa messages only:

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep -i nidaa
```

## Packaging

```bash
./build.sh pack        # creates nidaa@abdelrzz9.zip
gnome-extensions install nidaa@abdelrzz9.zip --force
```

## Project Structure

```
nidaa@abdelrzz9/
├── extension.js          # Entry point (ESM Extension class)
├── prefs.js              # Preferences window
├── stylesheet.css        # GNOME Shell styles
├── metadata.json         # Extension metadata
├── src/
│   ├── core/
│   │   ├── scheduler/    # Timer & schedule management
│   │   ├── notifications/ # Desktop notification logic
│   │   ├── prayer/       # Prayer time calculations
│   │   ├── location/     # Geo-lookup & coordinates
│   │   ├── quran/        # Quran data & display
│   │   ├── adhkar/       # Daily remembrances
│   │   ├── hijri/        # Islamic calendar
│   │   ├── settings/     # GSettings schema wrappers
│   │   └── storage/      # Persistent key-value store
│   └── ui/
│       ├── popup/        # Quick Settings / menu popup
│       ├── indicator/    # Panel button
│       └── preferences/  # Preferences widgets
├── assets/
│   ├── icons/
│   ├── audio/            # Adhan audio files
│   └── translations/
├── docs/
└── tests/
```

## License

TBD
