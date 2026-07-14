# Nidaa — Production Readiness Plan

> Current state vs vision gap analysis, prioritized into actionable phases.

## Current State vs Vision: Coverage Map

| Area                              | Status      | Coverage                                                                 |
|-----------------------------------|-------------|--------------------------------------------------------------------------|
| **Prayer Times**                  | ✅ Done     | Fajr–Isha, 9 calculation methods, Shafii/Hanafi, offsets, high-lat, elevation |
| **Location Detection**            | ✅ Done     | Geoclue → Manual (lat/lng + city picker) → IP (ipwho.is) → Cache         |
| **Notifications**                 | ⚠️ Partial  | Event system ✅, Snooze callback ❌ not wired, "Mark as Prayed" no-op      |
| **Popup Layout**                  | ⚠️ Partial  | Prayers + Quran + Hijri ✅, Adhkar status ❌ missing, Suhoor/Iftar ❌ missing |
| **Morning/Evening/Post Adhkar**   | ✅ Done     | 3 categories with configurable offsets                                   |
| **Extended Adhkar**               | ❌ Missing  | Before Sleep, Wake Up, Travel, Rain, Friday — not implemented            |
| **Quran Reminders**               | ✅ Done     | 6 frequencies (daily/weekly/after-fajr/after-isha/every-6h/random), progress tracking |
| **Friday Reminders**              | ✅ Done     | 3 notifications (Thu night, Fri morning, Fri afternoon)                  |
| **Ramadan Mode**                  | ⚠️ Partial  | Taraweeh, Laylat al-Qadr, Daily Dua ✅ — Suhoor/Iftar countdown not in UI, Last Ten Nights banner missing |
| **Islamic Events**                | ✅ Done     | Ashura (with day-before), Arafah (with day-before), White Days           |
| **Appearance Settings**           | ❌ Missing  | No theme/color/compact/large-text support                                |
| **Adhkar Status in Popup**        | ❌ Missing  | Vision shows Morning ✓ / Evening ✗ / After Prayer Pending                |
| **Suhoor/Iftar Countdown**        | ❌ Missing  | Functions exist in ramadan/index.js but never displayed in UI            |
| **Snooze Wiring**                 | ❌ Missing  | GSettings key exists (`prayer-snooze-duration`), callback stub only logs |
| **Settings Import/Export**        | ❌ Bug      | `GLib.Variant.new_value()` double-wrapping bug                           |
| **Indicator Method**              | ❌ Bug      | Hardcoded MWL, ignores user's GSettings method                           |
| **Sound Shell Injection**         | ❌ Bug      | `GLib.spawn_command_line_async` with unescaped path                      |
| **i18n Gaps**                     | ⚠️ Partial  | 7 preferences pages untranslated, notification actions hardcoded, Arabic has corrupted Chinese chars |
| **Qibla Direction**               | ❌ Future   | Schema has Kaaba coords, no UI or calculation                            |
| **Prayer Stats/Streaks**          | ❌ Future   | Not implemented                                                          |
| **Nearby Mosque**                 | ❌ Future   | Not implemented                                                          |
| **Athan Audio Packs**             | ❌ Future   | Schema supports per-prayer sound paths, no bundled audio                 |
| **Cross-Desktop Targets**         | ❌ Future   | KDE/XFCE/Cinnamon/Waybar/Hyprland                                        |

---

## Phase 0 — Critical Bugs (2-3h)

Fix things that are broken, not just improvable.

| # | Issue | File | Line(s) | Fix |
|---|-------|------|---------|-----|
| 1 | **Indicator always uses MWL** — ignores user's selected method. Countdown shows different times than notifications | `src/ui/indicator/index.js` | 32 | Read `prayer-method` from GSettings instead of hardcoded `'MWL'`. Inject settings object or pass from extension |
| 2 | **Settings import type-conversion bug** — `typeFromValue()` already returns a `GLib.Variant`, import wraps it again in `GLib.Variant.new_value()` which throws | `src/ui/preferences/settings_page.js` | 177-185 | Change `settings.set_value(key, GLib.Variant.new_value(typeFromValue(value)))` → `settings.set_value(key, typeFromValue(value))` |
| 3 | **Sound path shell injection** — `playSound()` doesn't escape the sound path | `src/core/notifications/notifications.js` | 120-129 | Escape path with `GLib.shell_quote()`, or switch to `GSubprocess` with argv array |
| 4 | **Arabic translation corrupted** — contains Chinese characters `地方` mixed with Arabic | `src/core/i18n/index.js` | 287 | Replace `'لل地方ات'` with `'للمناطق'` |
| 5 | **Dead code** — `ramadanDay` variable assigned but never used | `src/core/events/index.js` | 253 | Remove the assignment |

---

## Phase 1 — i18n Complete Coverage (6-10h)

Make every user-facing string translatable.

| # | Issue | File(s) | Fix |
|---|-------|---------|-----|
| 6 | **7 preferences pages not translatable** — all labels are hardcoded English, never go through `_()` | `src/ui/preferences/*.js` (7 files) | Wrap every string label with `_()`. Use `set_title()` for Adw widget titles |
| 7 | **Notification action labels hardcoded** — `'Snooze'`, `'Mark as Prayed'` | `src/core/prayer/provider.js` | Wrap with `_()` |
| 8 | **Quran notification hardcoded** — `'Quran Reading'`, `'📖 Have you read Quran today?\nEven one page is progress.'`, `'+1 Page'`, `'Dismiss'` | `src/core/quran/provider.js` | Wrap all with `_()` |
| 9 | **Adhkar notification titles hardcoded** — `'Morning Adhkar'`, `'Evening Adhkar'`, `'Post-... Adhkar'`, `'Open Adhkar'` | `src/core/adhkar/index.js` | Wrap with `_()` |
| 10 | **Ramadan notification titles hardcoded** — `'🕌 Taraweeh'`, `'🌙 Laylat al-Qadr (Odd Night)'`, `'🤲 Daily Ramadan Dua'` | `src/core/ramadan/index.js` | Wrap with `_()`. Emoji appended outside translation key |
| 11 | **Events notification titles hardcoded** — all emoji-prefixed titles | `src/core/events/index.js` | Wrap with `_()` |
| 12 | **Close button hardcoded** — adhkar detail dialog | `src/ui/adhkar/detail.js` | 187 | Replace `'Close'` with `_('Close')` |
| 13 | **Hijri date formatting hardcodes en-GB locale** | `src/ui/popup/index.js` | 230 | Use user's selected language from `getLanguage()` for date formatting |
| 14 | **3 Arabic strings untranslated** — `'Configure how often you receive Quran reading reminders.'` etc. | `src/core/i18n/index.js` | AR lines 347, 359, 393 | Translate to Arabic |
| 15 | **POT template incomplete** — missing ~50 strings | `po/nidaa.pot` | Regenerate with `xgettext` or extraction script |
| 16 | **Sync ar.po / fr.po** — update from new POT | `po/ar.po`, `po/fr.po` | Translate new entries |

---

## Phase 2 — Vision-Gap Features (8-12h)

Add features from the vision document that don't exist yet.

| # | Item | Details | Files |
|---|------|---------|-------|
| 17 | **Wire Snooze action** | Prayer notification "Snooze" re-injects the event with `+prayer-snooze-duration` delay via scheduler API | `src/core/prayer/provider.js`, `src/core/scheduler/scheduler.js` |
| 18 | **Adhkar status in popup** | Show Morning ✓ / Evening ✗ / After Prayer Pending section in the indicator popup | `src/ui/popup/index.js` |
| 19 | **Suhoor/Iftar countdown in indicator** | During Ramadan, show (or alternate with) suhoor/iftar countdown in the panel label | `src/ui/indicator/index.js` |
| 20 | **Last Ten Nights banner/notification** | Detect Hijri month 9 days 20-30, show notification and popup banner | `src/core/ramadan/index.js` |
| 21 | **GSettings keys for extended adhkar** | Add `adhkar-before-sleep-enabled`, `adhkar-wake-up-enabled`, `adhkar-travel-enabled`, `adhkar-rain-enabled`, `adhkar-friday-enabled` + offsets to schema | `schemas/org.gnome.shell.extensions.nidaa.gschema.xml` |
| 22 | **Extended adhkar provider** | Implement Before Sleep, Wake Up, Travel, Rain, Friday adhkar reminders (reuse content JSON format, lookup by category) | `src/core/adhkar/index.js` (or new file) |
| 23 | **Notification actions per vision** | Prayer: `[Open Extension]` `[Snooze]` `[Mark as Prayed]`. Quran: `[Continue Reading]`. Adhkar: `[Open Adhkar]` | `src/core/prayer/provider.js`, `src/core/quran/provider.js`, `src/core/adhkar/index.js` |

---

## Phase 3 — Appearance & Polish (4-6h)

Let users customize the extension look and feel.

| # | Item | Details | Files |
|---|------|---------|-------|
| 24 | **GSettings keys for appearance** | Add `theme-mode` (system/light/dark), `compact-mode` (bool), `large-text` (bool) | `schemas/...gschema.xml` |
| 25 | **Appearance preferences page** | Adw.PreferencesPage with theme selector, compact toggle, large-text toggle | `src/ui/preferences/appearance_page.js` |
| 26 | **Convert CSS to variables** | Replace hardcoded Dracula colors (`#8be9fd`, `#50fa7b`, `#bd93f9`) with CSS custom properties so theme switching works | `stylesheet.css` |
| 27 | **Compact mode styles** | Reduced paddings, smaller fonts when compact-mode enabled | `stylesheet.css` |
| 28 | **Large text styles** | 1.25× font sizes across all classes when large-text enabled | `stylesheet.css` |
| 29 | **Theme switching runtime** | Add/remove theme class on indicator root actor on enable + on GSettings change | `extension.js` |

---

## Phase 4 — Code Quality & DRY (4-6h)

Refactor duplication and fix structural issues.

| # | Item | Details | Files |
|---|------|---------|-------|
| 30 | **Extract shared helpers** | `_bool`, `_int`, `_string`, `localTimezoneOffset`, `_resolveMethod`, `_resolveMadhab`, `_resolveHighLat` → single module | New: `src/core/settings-helpers.js` |
| 31 | **Deduplicate constants** | `METHODS_BY_IDX`, `HIGH_LAT_RULES`, `PRAYERS` arrays — single source of truth | `src/core/settings-helpers.js` |
| 32 | **Module-level state reset** | `let _settings = null` in resolver.js never reset on disable | `src/core/location/resolver.js` |
| 33 | **Cache adhkar JSON content** | Don't re-parse JSON on every `getAdhkarContent()` call | `src/core/adhkar/index.js` |
| 34 | **Reuse Soup.Session** | Module-level singleton instead of per-call creation | `src/core/location/ipgeo.js` |
| 35 | **Add HTTP timeout** | 10s timeout on IP geolocation request | `src/core/location/ipgeo.js` |
| 36 | **Private property access** | `extension.js` reads `this._indicator._prayerTimes` — add public getter | `src/ui/indicator/index.js`, `extension.js` |

---

## Phase 5 — Test Coverage (8-16h)

Add tests for untested modules. Current: **316 assertions across 7 test files**.

| # | Area to Test | Current State | What to Add |
|---|-------------|---------------|-------------|
| 37 | **Ramadan provider** | 0 tests | `createRamadanProvider`, `isRamadan`, `getDailyDua`, `getLaylatAlQadrInfo`, `getSuhoorCountdown`, `getIftarCountdown` |
| 38 | **Events provider** | 0 tests | `isFriday`, `createIslamicEventsProvider`, `getNextIslamicEvent` |
| 39 | **Notification system** | 0 tests | `showNotification`, `destroyNotifications`, `priorityToUrgency` |
| 40 | **i18n module** | 0 tests | `_()` lookup, `setLanguage`, dictionary fallback chain (AR→EN), missing key behavior |
| 41 | **Astronomy functions** | 0 tests (indirect only) | `julianDay`, `sunPosition`, `hourAngle`, `asrAltitude`, `elevationDip` with known input/output pairs |
| 42 | **Location resolver** | 0 tests | Cascading fallback order, manual coords, null returns |
| 43 | **Prayer provider edge cases** | Partial | Custom method, manual offsets, custom sound paths |
| 44 | **Quran provider edge cases** | Partial | `after-fajr`/`after-isha` frequencies, window boundaries |
| 45 | **UI components** | 0 tests | `PrayerPopupSection`, `QuranPopupSection`, adhkar detail dialog (mock St/Clutter) |

---

## Phase 6 — Release Infrastructure (2-4h)

Prepare for distribution on GNOME Extensions website.

| # | Item | Details |
|---|------|---------|
| 46 | **CI pipeline** | GitHub Actions: run tests on push, validate schema, lint |
| 47 | **Release workflow** | Auto-pack `.zip` on tag push, upload to GitHub Releases |
| 48 | **Update metadata.json** | Bump version from 1, constrain `shell-version` to `["45", "46", "47"]` |
| 49 | **Regenerate POT** | Add `make pot` target or script to keep `po/nidaa.pot` in sync |
| 50 | **Create CONTRIBUTING.md** | Guide for translators (how to update .po files), testers, developers |
| 51 | **GNOME Extensions listing** | Register at https://extensions.gnome.org with screenshots, description |

---

## Effort Summary

| Phase | Hours | Files Changed | Risk | Priority |
|-------|-------|---------------|------|----------|
| 0 — Critical Bugs | 2-3h | 5 | Low | **Immediate** |
| 1 — i18n Complete | 6-10h | 15+ | Low-Med | High |
| 2 — Vision Gaps | 8-12h | 8 | Med | **High** |
| 3 — Appearance | 4-6h | 5 | Low-Med | Medium |
| 4 — Code Quality | 4-6h | 10 | Low | Medium |
| 5 — Test Coverage | 8-16h | 12+ | Med | Medium |
| 6 — Release | 2-4h | 5 | Low | Low |
| **Total** | **34-57h** | **~30 unique files** | | |

**MVP release = Phase 0 + Phase 1 + Phase 2 (items 1–23).** Estimated 16-25h of work.
