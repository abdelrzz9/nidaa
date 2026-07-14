# Nidaa — Architecture Overview

A GNOME Shell extension for Islamic prayer times, adhkar reminders, Quran reading, and more.

## Module Map

### Core Modules

#### `src/core/prayer/` — Prayer Time Calculation
Pure offline math engine for calculating the six daily prayer times (Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha). No GNOME Shell or network dependencies — fully testable standalone via `gjs --module`.

- **`astronomy.js`**: Julian day calculation, sun position (declination, equation of time), hour angle, ASR altitude. Based on the U.S. Naval Observatory algorithm.
- **`methods.js`**: 9 calculation methods (MWL, ISNA, Egypt, Umm Al-Qura, Karachi, Tehran, Jafari, Moonsighting, Custom). Each defines Fajr/Isha twilight angles, Maghrib angle, and midnight method.
- **`highlatitude.js`**: Three high-latitude rules (AngleBased, MiddleOfNight, OneSeventh) for locations above ~48° where twilight persists.
- **`times.js`**: `calculatePrayerTimes()` — the main calculation function. Takes lat/lng, timezone, date, method, madhab, high-latitude rule, elevation, and custom angles. Returns Date objects for each prayer.
- **`provider.js`**: `createPrayerProvider()` — Scheduler event factory. Generates adhan events, iqamah reminders, and "prayer ending soon" warnings based on settings.
- **`index.js`**: Re-exports all public APIs.

#### `src/core/location/` — Location Resolution
Async location resolution with cascading fallback: Manual/City → Geoclue D-Bus → IP geolocation → file cache.

- **`resolver.js`**: Main resolver — checks settings mode, tries each source in order, returns `{ latitude, longitude, source, timestamp }`.
- **`geoclue.js`**: D-Bus call to GeoClue2 service (GNOME's geolocation daemon). Fires once per resolution.
- **`ipgeo.js`**: HTTP GET to `https://ipwho.is/` using libsoup3. Only fires if Geoclue fails. **This is the only network call in the extension.**
- **`cache.js`**: File-based cache at `~/.local/share/nidaa/last-location.json`. Avoids re-resolving on every startup.
- **`index.js`**: Re-exports all public APIs.

#### `src/core/scheduler/` — Event Scheduler
Generic event scheduler that collects events from all providers, sorts by time, and fires callbacks via GLib timeouts.

- **`event.js`**: `createEvent()` — validated Event object factory. `sortEvents()` — sorts by time with priority tiebreaking.
- **`scheduler.js`**: `Scheduler` class. `addProvider(fn)` registers a provider, returns an unsubscribe function. `enable()` starts the scheduler, `refresh()` re-fetches events, `disable()` cancels all timeouts. Auto-reschedules at midnight.
- **`index.js`**: Re-exports all public APIs.

#### `src/core/notifications/` — Desktop Notifications
Wraps GNOME Shell's MessageTray for displaying desktop notifications with urgency levels, action buttons, and sound playback.

- **`notifications.js`**: `showNotification(event)` — displays a notification. Maps event priority to urgency (LOW/NORMAL/HIGH/CRITICAL). Wires action buttons. Plays sound via `canberra-gtk-play`. `destroyNotifications()` — cleans up the singleton source.
- **`index.js`**: Re-exports.

#### `src/core/adhkar/` — Adhkar (Islamic Reminders)
Morning, evening, and post-prayer adhkar notification provider.

- **`index.js`**: `createAdhkarProvider()` — Scheduler event factory. Generates morning adhkar (sunrise + offset), evening adhkar (maghrib - offset), and post-prayer adhkar events (each prayer + offset). `getAdhkarContent(category)` — loads full adhkar text from bundled JSON for display in the detail dialog.

#### `src/core/quran/` — Quran Reading Tracker
Daily Quran reading progress tracker with multiple reminder frequencies.

- **`store.js`**: `readProgress()`, `writeProgress()`, `incrementPage()`, `setDailyGoal()`. Persists to `~/.local/share/nidaa/quran-progress.json`. Auto-resets at midnight. Injectable I/O for testing.
- **`provider.js`**: `createQuranProvider()` — 6 frequency modes: daily, weekly/Friday, after-Fajr, after-Isha, every-6h, random (deterministic per day). Events include a "+1 Page" action button.

#### `src/core/hijri/` — Hijri Date Calculation
Offline Kuwaiti tabular Hijri calendar algorithm.

- **`index.js`**: `getHijriDate(gregorianDate)` → `{ day, month, monthName, year }`. `hijriToGregorian()` for reverse conversion. Month names in Arabic, English, and French. Event helpers: `daysUntilRamadan()`, `daysUntilEidAlFitr()`, `daysUntilEidAlAdha()`, `daysUntilAshura()`, `daysUntilArafah()`, `isWhiteDays()`, `daysUntilWhiteDays()`.

**Note**: Tabular Hijri calculations can be off by ±1 day from local moon-sighting announcements. This is an inherent limitation of any calculated (non-observation-based) Islamic calendar.

#### `src/core/ramadan/` — Ramadan Mode
Auto-detected Hijri month 9 event provider.

- **`index.js`**: `isRamadan()`, `getDailyDua()`, `getLaylatAlQadrInfo()`, `createRamadanProvider()`. Provides: Taraweeh reminder after Isha, Laylat al-Qadr reminders on the odd nights of the last 10 days, daily Ramadan dua (structured JSON with proper citations). `getSuhoorCountdown()` and `getIftarCountdown()` for the panel indicator.

#### `src/core/events/` — Islamic Events
Scheduled reminders for Friday, Ashura, Arafah, and White Days.

- **`index.js`**: `createIslamicEventsProvider()` — Friday (3 events: Thursday night, Friday morning, Friday afternoon), Ashura (Muharram 10 + day-before), Arafah (Dhul Hijjah 9 + day-before), White Days (13th of each month). All individually toggleable. `getNextIslamicEvent()` for popup footer display.

#### `src/core/i18n/` — Internationalization
Multi-language support with gettext infrastructure and JSON fallback.

- **`index.js`**: `setup(extPath)`, `setLanguage(lang)`, `_(str)`. Uses gettext for system locale, falls back to bundled JSON dictionaries for language override. Supports English (default), Arabic, and French.

### UI Modules

#### `src/ui/indicator/` — Top Panel Indicator
- **`index.js`**: `PrayerIndicator extends PanelMenu.Button`. Shows icon + live countdown (e.g., "Asr in 18 min"). Refreshes every 60 seconds. Recomputes at midnight. Contains a `PrayerPopupSection` in its popup menu.

#### `src/ui/popup/` — Popup Menu
- **`index.js`**: `PrayerPopupSection` — renders today's 6 prayer times with passed/next/future states, countdown, Hijri date footer, next Islamic event, and Ramadan Mode banner. `QuranPopupSection` — renders daily Quran reading progress with "+1 Page" button.

#### `src/ui/preferences/` — Preferences Window
- **`index.js`**: Assembles 7 preference pages into an `Adw.PreferencesWindow`.
- **`prayer_page.js`**: Calculation method, custom angles, madhab, high-latitude rule, per-prayer offsets.
- **`location_page.js`**: Location mode, manual lat/lng, searchable city list (bundled `cities.json`).
- **`adhkar_page.js`**: Enable/disable, language, timing offsets, per-prayer toggles.
- **`quran_page.js`**: Enable/disable, frequency, daily goal, offset, window hours.
- **`ramadan_page.js`**: Ramadan mode toggle, force override, Taraweeh, Laylat al-Qadr, daily dua.
- **`events_page.js`**: Friday reminders (3 configurable times), Ashura, Arafah, White Days.
- **`settings_page.js`**: Language override, Import/Export settings (JSON with version field).

#### `src/ui/adhkar/` — Adhkar Detail Dialog
- **`detail.js`**: `showAdhkarDetail(category, lang)` — GNOME Shell ModalDialog showing full adhkar text (Arabic RTL, transliteration, translation, repeat count, reference).

### Entry Points

- **`extension.js`**: Main extension entry. `NidaaExtension.enable()` initializes i18n, settings, scheduler, indicator, and all providers. `disable()` cleans up everything (all timeouts removed, all signals disconnected, all providers unsubscribed).
- **`prefs.js`**: Preferences entry. Delegates to `src/ui/preferences/index.js`.

## Data Flow

```
Location Resolution → Prayer Times Calculation
         ↓                        ↓
    Scheduler ←── Provider (date) → Event[]
         ↓
    Notification / Indicator Update / Popup Update
```

1. **Location** is resolved async (Geoclue → IP → cache).
2. **Providers** (prayer, adhkar, quran, ramadan, events) are registered with the Scheduler.
3. **Scheduler** calls each provider daily, collects Events, sorts by time.
4. **GLib timeouts** fire callbacks at event times → `showNotification()`.
5. **Indicator** refreshes every 60s with next-prayer countdown.
6. **Popup** updates on each refresh with full prayer list, Hijri date, Quran progress.

## Settings (GSettings)

45+ keys across 8 groups: Location, Prayer Calculation, Per-Prayer Offsets, Notifications, Adhkar, Quran, Ramadan, Islamic Events, i18n, Qibla.

## Performance Characteristics

- **Idle CPU**: ~0% (no polling loops; all timers are one-shot or 60-second intervals)
- **Idle memory**: <10MB (extension only; no heavy objects retained)
- **Cold start**: <100ms added to GNOME Shell startup (schema load + panel button creation)
- **Network**: One HTTP GET to `ipwho.is` per location resolution (only if Geoclue fails), not periodic
