/*
 * Prayer calculation preferences page.
 *
 * Provides controls for:
 *   - Calculation method (dropdown)
 *   - Custom Fajr/Isha angles (revealed when Custom method selected)
 *   - Madhab (Shafii/Hanafi dropdown)
 *   - High latitude rule (dropdown)
 *   - Per-prayer manual time offsets (spin rows)
 *
 * All controls bind bidirectionally to GSettings via Adw.BindingFactory
 * or direct Gio.Settings signal handlers.
 *
 * Follows GNOME HIG + libadwaita conventions:
 *   - Adw.PreferencesPage → Adw.PreferencesGroup → Adw.ActionRow / Adw.ComboRow
 *   - Consistent row spacing, subtitles for explanations
 *   - Revealed sections use Adw.RevealerRow pattern
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

import { _ } from '../../core/i18n/index.js';

const LOG_PREFIX = '[Nidaa:Prefs:Prayer]';

/**
 * Human-readable labels for calculation methods.
 * Order matches the GSettings integer keys (0–7).
 */
const METHOD_LABELS = [
  _('Muslim World League (MWL)'),
  _('Islamic Society of North America (ISNA)'),
  _('Egyptian General Authority of Survey'),
  _('Umm Al-Qura University (Makkah)'),
  _('University of Islamic Sciences, Karachi'),
  _('Institute of Geophysics, University of Tehran'),
  _('Leva Research Institute (Qom) / Shia Ithna Ashari'),
  _('Custom (user-supplied angles)'),
];

/**
 * Human-readable labels for high latitude rules.
 * Order matches the GSettings integer keys (0–3).
 */
const HIGH_LAT_LABELS = [
  _('None'),
  _('Angle-Based (recommended)'),
  _('Middle of Night'),
  _('One-Seventh of Night'),
];

/**
 * Human-readable labels for madhab (Asr method).
 */
const MADHAB_LABELS = [
  _('Shafii (standard)'),
  _('Hanafi'),
];

/**
 * Prayer names and their corresponding GSettings offset keys.
 */
const PRAYER_OFFSETS = [
  { name: _('Fajr'), key: 'offset-fajr' },
  { name: _('Dhuhr'), key: 'offset-dhuhr' },
  { name: _('Asr'), key: 'offset-asr' },
  { name: _('Maghrib'), key: 'offset-maghrib' },
  { name: _('Isha'), key: 'offset-isha' },
];

/**
 * Build and return the Prayer preferences page.
 *
 * @param {Gio.Settings} settings - Extension GSettings instance
 * @returns {Adw.PreferencesPage}
 */
export function buildPrayerPage(settings) {
  const page = new Adw.PreferencesPage({
    title: _('Prayer'),
    icon_name: 'alarm-symbolic',
  });

  // ----------------------------------------------------------------
  //  Calculation method
  // ----------------------------------------------------------------
  const methodGroup = new Adw.PreferencesGroup({
    title: _('Calculation Method'),
    description: _('Choose the method used to calculate prayer times.'),
  });
  page.add(methodGroup);

  // --- Method dropdown ---
  const methodRow = new Adw.ComboRow({
    title: _('Method'),
    subtitle: _('Different organizations use slightly different twilight angles.'),
  });
  const methodModel = Gtk.StringList.new(METHOD_LABELS);
  methodRow.set_model(methodModel);
  methodRow.set_selected(settings.get_int('prayer-method'));

  methodRow.connect('notify::selected', (_row) => {
    settings.set_int('prayer-method', _row.get_selected());
    _updateCustomRevealed(settings, customRevealer);
  });
  methodGroup.add(methodRow);

  // --- Custom angles (revealed when method = Custom) ---
  const customRevealer = new Adw.RevealerRow({
    title: _('Custom Angles'),
    subtitle: _('Set your own Fajr and Isha twilight angles.'),
  });
  const customBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 6,
    margin_top: 8,
    margin_bottom: 8,
  });

  // Fajr angle
  const fajrAdj = new Gtk.Adjustment({
    lower: 5.0,
    upper: 25.0,
    step_increment: 0.5,
    page_increment: 1.0,
    value: settings.get_double('fajr-angle'),
  });
  const fajrSpin = new Gtk.SpinButton({
    adjustment: fajrAdj,
    digits: 1,
    valign: Gtk.Align.CENTER,
  });
  const fajrBox = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 12,
  });
  fajrBox.append(new Gtk.Label({ label: _('Fajr angle (°)'), hexpand: true, xalign: 0 }));
  fajrBox.append(fajrSpin);
  customBox.append(fajrBox);

  fajrAdj.connect('value-changed', () => {
    settings.set_double('fajr-angle', fajrAdj.get_value());
  });

  // Isha angle
  const ishaAdj = new Gtk.Adjustment({
    lower: 5.0,
    upper: 25.0,
    step_increment: 0.5,
    page_increment: 1.0,
    value: settings.get_double('isha-angle'),
  });
  const ishaSpin = new Gtk.SpinButton({
    adjustment: ishaAdj,
    digits: 1,
    valign: Gtk.Align.CENTER,
  });
  const ishaBox = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 12,
  });
  ishaBox.append(new Gtk.Label({ label: _('Isha angle (°)'), hexpand: true, xalign: 0 }));
  ishaBox.append(ishaSpin);
  customBox.append(ishaBox);

  ishaAdj.connect('value-changed', () => {
    settings.set_double('isha-angle', ishaAdj.get_value());
  });

  customRevealer.add_suffix(customBox);
  methodGroup.add(customRevealer);

  // ----------------------------------------------------------------
  //  Madhab (Asr method)
  // ----------------------------------------------------------------
  const madhabGroup = new Adw.PreferencesGroup({
    title: _('Madhab'),
    description: _('Determines how Asr prayer time is calculated.'),
  });
  page.add(madhabGroup);

  const madhabRow = new Adw.ComboRow({
    title: _('Asr Calculation'),
    subtitle: _('Shafii uses shadow length = object height; Hanafi uses double.'),
  });
  const madhabModel = Gtk.StringList.new(MADHAB_LABELS);
  madhabRow.set_model(madhabModel);
  madhabRow.set_selected(settings.get_int('asr-method'));

  madhabRow.connect('notify::selected', (_row) => {
    settings.set_int('asr-method', _row.get_selected());
  });
  madhabGroup.add(madhabRow);

  // ----------------------------------------------------------------
  //  High latitude rule
  // ----------------------------------------------------------------
  const highLatGroup = new Adw.PreferencesGroup({
    title: _('High Latitude Rule'),
    description: _('For locations above ~48° latitude where twilight persists.'),
  });
  page.add(highLatGroup);

  const highLatRow = new Adw.ComboRow({
    title: _('Night Method'),
    subtitle: _('How to determine Fajr/Isha when the sun barely sets.'),
  });
  const highLatModel = Gtk.StringList.new(HIGH_LAT_LABELS);
  highLatRow.set_model(highLatModel);
  highLatRow.set_selected(settings.get_int('high-latitude-method'));

  highLatRow.connect('notify::selected', (_row) => {
    settings.set_int('high-latitude-method', _row.get_selected());
  });
  highLatGroup.add(highLatRow);

  // ----------------------------------------------------------------
  //  Per-prayer manual offsets
  // ----------------------------------------------------------------
  const offsetGroup = new Adw.PreferencesGroup({
    title: _('Time Adjustments'),
    description: _('Fine-tune individual prayer times if your local mosque differs slightly.'),
  });
  page.add(offsetGroup);

  for (const { name, key } of PRAYER_OFFSETS) {
    const adj = new Gtk.Adjustment({
      lower: -30,
      upper: 30,
      step_increment: 1,
      page_increment: 5,
      value: settings.get_int(key),
    });

    const spin = new Gtk.SpinButton({
      adjustment: adj,
      digits: 0,
      valign: Gtk.Align.CENTER,
    });

    const row = new Adw.ActionRow({
      title: _(`${name} Offset`),
      subtitle: _('Minutes (positive = later, negative = earlier)'),
    });
    row.add_suffix(spin);
    row.activatable_widget = spin;

    adj.connect('value-changed', () => {
      settings.set_int(key, adj.get_value());
    });

    offsetGroup.add(row);
  }

  // --- Initial state ---
  _updateCustomRevealed(settings, customRevealer);

  return page;
}

// ------------------------------------------------------------------
//  Helpers
// ------------------------------------------------------------------

/**
 * Show/hide the custom angles section based on the current method.
 */
function _updateCustomRevealed(settings, revealer) {
  const methodIdx = settings.get_int('prayer-method');
  const isCustom = methodIdx === 7; // 7 = Custom
  revealer.set_revealed(isCustom);
}
