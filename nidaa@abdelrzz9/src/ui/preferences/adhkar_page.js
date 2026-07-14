/*
 * Adhkar preferences page.
 *
 * Provides controls for:
 *   - Enable/disable adhkar notifications (master toggle)
 *   - Language selection (Arabic, English, French)
 *   - Morning/evening offset (minutes after sunrise / before maghrib)
 *   - Post-prayer offset (minutes after each prayer)
 *   - Per-prayer post-prayer toggles (Fajr, Dhuhr, Asr, Maghrib, Isha)
 *
 * All controls bind bidirectionally to GSettings via direct signal handlers.
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

const LOG_PREFIX = '[Nidaa:Prefs:Adhkar]';

const LANGUAGE_LABELS = [
  'Arabic',
  'English',
  'French',
];

const POST_PRAYER_PRAYERS = [
  { name: 'Fajr', key: 'adhkar-post-fajr' },
  { name: 'Dhuhr', key: 'adhkar-post-dhuhr' },
  { name: 'Asr', key: 'adhkar-post-asr' },
  { name: 'Maghrib', key: 'adhkar-post-maghrib' },
  { name: 'Isha', key: 'adhkar-post-isha' },
];

/**
 * Build and return the Adhkar preferences page.
 *
 * @param {Gio.Settings} settings - Extension GSettings instance
 * @returns {Adw.PreferencesPage}
 */
export function buildAdhkarPage(settings) {
  const page = new Adw.PreferencesPage({
    title: 'Adhkar',
    icon_name: 'preferences-other-symbolic',
  });

  // ----------------------------------------------------------------
  //  General settings
  // ----------------------------------------------------------------
  const generalGroup = new Adw.PreferencesGroup({
    title: 'General',
    description: 'Enable or disable adhkar notifications and choose the display language.',
  });
  page.add(generalGroup);

  // --- Master toggle ---
  const enabledRow = new Adw.SwitchRow({
    title: 'Enable Adhkar',
    subtitle: 'Show reminders for morning, evening, and post-prayer adhkar.',
  });
  enabledRow.set_active(settings.get_boolean('adhkar-enabled'));
  enabledRow.connect('notify::active', (_row) => {
    settings.set_boolean('adhkar-enabled', _row.get_active());
    _updateAdhkarGroupVisibility(settings, timingGroup, perPrayerGroup);
  });
  generalGroup.add(enabledRow);

  // --- Language dropdown ---
  const langRow = new Adw.ComboRow({
    title: 'Language',
    subtitle: 'Choose the language for adhkar text.',
  });
  const langModel = Gtk.StringList.new(LANGUAGE_LABELS);
  langRow.set_model(langModel);
  const currentLang = settings.get_string('adhkar-language');
  langRow.set_selected(_langIndex(currentLang));
  langRow.connect('notify::selected', (_row) => {
    const lang = LANGUAGE_LABELS[_row.get_selected()].toLowerCase();
    settings.set_string('adhkar-language', lang);
  });
  generalGroup.add(langRow);

  // ----------------------------------------------------------------
  //  Timing offsets
  // ----------------------------------------------------------------
  const timingGroup = new Adw.PreferencesGroup({
    title: 'Timing',
    description: 'Adjust when adhkar notifications are sent relative to prayer times.',
  });
  page.add(timingGroup);

  // --- Morning offset ---
  const morningAdj = new Gtk.Adjustment({
    lower: 0,
    upper: 60,
    step_increment: 5,
    page_increment: 15,
    value: settings.get_int('adhkar-morning-offset'),
  });
  const morningSpin = new Gtk.SpinButton({
    adjustment: morningAdj,
    digits: 0,
    valign: Gtk.Align.CENTER,
  });
  const morningRow = new Adw.ActionRow({
    title: 'Morning Adhkar Offset',
    subtitle: 'Minutes after sunrise to send the reminder.',
  });
  morningRow.add_suffix(morningSpin);
  morningRow.activatable_widget = morningSpin;
  morningAdj.connect('value-changed', () => {
    settings.set_int('adhkar-morning-offset', morningAdj.get_value());
  });
  timingGroup.add(morningRow);

  // --- Evening offset ---
  const eveningAdj = new Gtk.Adjustment({
    lower: 0,
    upper: 60,
    step_increment: 5,
    page_increment: 15,
    value: settings.get_int('adhkar-evening-offset'),
  });
  const eveningSpin = new Gtk.SpinButton({
    adjustment: eveningAdj,
    digits: 0,
    valign: Gtk.Align.CENTER,
  });
  const eveningRow = new Adw.ActionRow({
    title: 'Evening Adhkar Offset',
    subtitle: 'Minutes before Maghrib to send the reminder.',
  });
  eveningRow.add_suffix(eveningSpin);
  eveningRow.activatable_widget = eveningSpin;
  eveningAdj.connect('value-changed', () => {
    settings.set_int('adhkar-evening-offset', eveningAdj.get_value());
  });
  timingGroup.add(eveningRow);

  // --- Post-prayer offset ---
  const postPrayerAdj = new Gtk.Adjustment({
    lower: 5,
    upper: 120,
    step_increment: 5,
    page_increment: 15,
    value: settings.get_int('adhkar-post-prayer-offset'),
  });
  const postPrayerSpin = new Gtk.SpinButton({
    adjustment: postPrayerAdj,
    digits: 0,
    valign: Gtk.Align.CENTER,
  });
  const postPrayerRow = new Adw.ActionRow({
    title: 'Post-Prayer Offset',
    subtitle: 'Minutes after the Iqamah reminder to send the post-prayer adhkar.',
  });
  postPrayerRow.add_suffix(postPrayerSpin);
  postPrayerRow.activatable_widget = postPrayerSpin;
  postPrayerAdj.connect('value-changed', () => {
    settings.set_int('adhkar-post-prayer-offset', postPrayerAdj.get_value());
  });
  timingGroup.add(postPrayerRow);

  // ----------------------------------------------------------------
  //  Per-prayer toggles
  // ----------------------------------------------------------------
  const perPrayerGroup = new Adw.PreferencesGroup({
    title: 'Per-Prayer Adhkar',
    description: 'Choose which prayers trigger a post-prayer adhkar reminder.',
  });
  page.add(perPrayerGroup);

  for (const { name, key } of POST_PRAYER_PRAYERS) {
    const row = new Adw.SwitchRow({
      title: `After ${name}`,
      subtitle: `Show adhkar reminder after ${name} prayer.`,
    });
    row.set_active(settings.get_boolean(key));
    row.connect('notify::active', (_row) => {
      settings.set_boolean(key, _row.get_active());
    });
    perPrayerGroup.add(row);
  }

  // --- Initial visibility ---
  _updateAdhkarGroupVisibility(settings, timingGroup, perPrayerGroup);

  return page;
}

// ------------------------------------------------------------------
//  Helpers
// ------------------------------------------------------------------

function _langIndex(lang) {
  const lower = (lang || '').toLowerCase();
  if (lower === 'english') return 1;
  if (lower === 'french') return 2;
  return 0; // Arabic (default)
}

function _updateAdhkarGroupVisibility(settings, timingGroup, perPrayerGroup) {
  const enabled = settings.get_boolean('adhkar-enabled');
  timingGroup.set_visible(enabled);
  perPrayerGroup.set_visible(enabled);
}
