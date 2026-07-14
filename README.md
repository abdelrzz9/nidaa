# Nidaa — Islamic Prayer Times for GNOME Shell

**Nidaa** (نِداء, "the call") is a GNOME Shell extension that brings accurate Islamic prayer times, adhkar reminders, Quran reading tracking, and spiritual tools directly to your desktop.

Built with **GJS** (GNOME Shell's JavaScript runtime) for **GNOME Shell 45/46/47**, using the modern ESM module system.

## Features

- **Prayer Times** — 9 calculation methods (MWL, ISNA, Egypt, Umm Al-Qura, Karachi, Tehran, Jafari, Moonsighting, Custom), 2 madhabs, high-latitude rules, elevation adjustment
- **Desktop Notifications** — Adhan alerts with per-prayer sound, iqamah reminders, "prayer ending soon" warnings
- **Adhkar Reminders** — Morning, evening, and post-prayer adhkar with Arabic RTL text, transliteration, and translations (English/French)
- **Quran Reading Tracker** — 6 frequency modes, daily page counter, "+1 Page" button in popup
- **Hijri Calendar** — Kuwaiti tabular algorithm with month names in Arabic/English/French
- **Ramadan Mode** — Auto-detected, suhoor/iftar countdown framing, Taraweeh reminders, Laylat al-Qadr alerts, daily Ramadan dua
- **Islamic Events** — Friday (3 configurable), Ashura, Arafah, White Days reminders
- **Location Resolution** — Geoclue → IP geolocation → file cache cascading fallback
- **Multi-Language** — Arabic, English, French with RTL support and per-extension language override
- **Export/Import Settings** — JSON backup with version validation

## Installation

### From Source (Development)

```bash
# Clone the repository
git clone https://github.com/abdelrzz9/nidaa.git
cd nidaa

# Compile schemas
glib-compile-schemas nidaa@abdelrzz9/schemas/

# Symlink to GNOME extensions directory
ln -sf "$(pwd)/nidaa@abdelrzz9" \
  ~/.local/share/gnome-shell/extensions/nidaa@abdelrzz9
```

### From ZIP (Release)

```bash
# Download the release ZIP from GitHub, then:
gnome-extensions install nidaa@abdelrzz9.zip --force
```

### Enable the Extension

```bash
gnome-extensions enable nidaa@abdelrzz9
```

Or open the **GNOME Extensions** app and toggle "Nidaa" on.

### Restart GNOME Shell

| Session | How to reload |
|---------|--------------|
| **X11**  | Press `Alt+F2`, type `r`, press Enter |
| **Wayland** | Log out and log back in |

## Testing

### Unit Tests (no GNOME Shell required)

```bash
cd nidaa

# Run all tests
for f in tests/test-*.js; do
  echo "=== $f ==="
  gjs --module "$f" 2>&1 | tail -3
done
```

Expected output: **316/316 assertions passed** across 7 test files.

### Individual Tests

```bash
gjs --module tests/test-prayer-calc.js      # 13/13
gjs --module tests/test-scheduler.js        # 34/34
gjs --module tests/test-prayer-provider.js  # 82/82
gjs --module tests/test-adhkar-provider.js  # 62/62
gjs --module tests/test-quran-provider.js   # 41/41
gjs --module tests/test-hijri.js            # 82/82
gjs --module tests/test-location.js         #  2/2
```

### Manual Testing

1. Enable the extension: `gnome-extensions enable nidaa@abdelrzz9`
2. Check the panel indicator shows the next prayer countdown
3. Click the indicator to open the popup with all 6 prayer times
4. Open preferences: `gnome-extensions prefs nidaa@abdelrzz9`
5. Test each preferences page (Prayer, Location, Adhkar, Quran, Ramadan, Islamic Events, Settings)
6. In Settings page, try the Language dropdown (Arabic/French) and Export/Import buttons

### View Logs

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep -i nidaa
```

## Uninstall

```bash
gnome-extensions disable nidaa@abdelrzz9
rm ~/.local/share/gnome-shell/extensions/nidaa@abdelrzz9
```

## Project Structure

```
nidaa@abdelrzz9/
├── extension.js                    # Main entry point (ESM Extension class)
├── prefs.js                        # Preferences window entry
├── stylesheet.css                  # GNOME Shell styles
├── metadata.json                   # Extension metadata
├── schemas/
│   └── org.gnome.shell.extensions.nidaa.gschema.xml
├── src/
│   ├── core/
│   │   ├── prayer/                 # Prayer time calculation engine
│   │   │   ├── astronomy.js        #   Julian day, sun position
│   │   │   ├── methods.js          #   9 calculation methods
│   │   │   ├── highlatitude.js     #   High-latitude rules
│   │   │   ├── times.js            #   calculatePrayerTimes()
│   │   │   ├── provider.js         #   Scheduler event factory
│   │   │   └── index.js            #   Re-exports
│   │   ├── location/               # Location resolution
│   │   │   ├── resolver.js         #   Cascading fallback
│   │   │   ├── geoclue.js          #   D-Bus geolocation
│   │   │   ├── ipgeo.js            #   IP geolocation
│   │   │   ├── cache.js            #   File cache
│   │   │   └── index.js
│   │   ├── scheduler/              # Generic event scheduler
│   │   │   ├── event.js            #   Event factory + sorting
│   │   │   ├── scheduler.js        #   Scheduler class
│   │   │   └── index.js
│   │   ├── notifications/          # Desktop notifications
│   │   │   ├── notifications.js    #   MessageTray + canberra
│   │   │   └── index.js
│   │   ├── adhkar/                 # Adhkar reminders
│   │   │   └── index.js
│   │   ├── quran/                  # Quran reading tracker
│   │   │   ├── store.js            #   Progress persistence
│   │   │   └── provider.js         #   6-frequency provider
│   │   ├── hijri/                  # Hijri date calculation
│   │   │   └── index.js
│   │   ├── ramadan/                # Ramadan mode
│   │   │   └── index.js
│   │   ├── events/                 # Islamic events
│   │   │   └── index.js
│   │   └── i18n/                   # Internationalization
│   │       └── index.js
│   └── ui/
│       ├── indicator/              # Top panel indicator
│       │   └── index.js
│       ├── popup/                  # Popup menu
│       │   └── index.js
│       ├── preferences/            # Preferences window (7 pages)
│       │   ├── index.js
│       │   ├── prayer_page.js
│       │   ├── location_page.js
│       │   ├── adhkar_page.js
│       │   ├── quran_page.js
│       │   ├── ramadan_page.js
│       │   ├── events_page.js
│       │   └── settings_page.js
│       └── adhkar/
│           └── detail.js           # Adhkar modal dialog
├── assets/
│   ├── cities.json                 # 275 cities (offline)
│   └── translations/
│       └── adhkar-content.json     # Adhkar text (AR/EN/FR)
├── locale/
│   ├── ar/LC_MESSAGES/nidaa.mo
│   └── fr/LC_MESSAGES/nidaa.mo
├── po/
│   ├── nidaa.pot
│   ├── ar.po
│   └── fr.po
├── docs/
│   └── ARCHITECTURE.md
└── tests/
    ├── test-prayer-calc.js
    ├── test-scheduler.js
    ├── test-prayer-provider.js
    ├── test-adhkar-provider.js
    ├── test-quran-provider.js
    ├── test-hijri.js
    └── test-location.js
```

## Contributing

See [docs/ARCHITECTURE.md](nidaa@abdelrzz9/docs/ARCHITECTURE.md) for the full module map and data flow.

To add a new language:
1. Copy `po/nidaa.pot` to `po/<lang>.po`
2. Translate the `msgstr` entries
3. Compile: `msgfmt -o locale/<lang>/LC_MESSAGES/nidaa.mo po/<lang>.po`
4. Add the language to `src/core/i18n/index.js` dictionaries

## License

MIT
