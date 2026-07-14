/*
 * Quran reading preferences page.
 *
 * Provides controls for:
 *   - Enable/disable Quran reminders (master toggle)
 *   - Reminder frequency (6 modes)
 *   - Prayer offset (revealed for after-fajr / after-isha)
 *   - Random window start/end hours (revealed for random)
 *   - Daily page goal
 *
 * All controls bind to GSettings via direct signal handlers.
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

const LOG_PREFIX = '[Nidaa:Prefs:Quran]';

const FREQUENCY_LABELS = [
  'Daily',
  'Weekly (Fridays)',
  'After Fajr',
  'After Isha',
  'Every 6 Hours',
  'Random Time',
];

const FREQUENCY_KEYS = [
  'daily',
  'weekly',
  'after-fajr',
  'after-isha',
  'every-6h',
  'random',
];

/**
 * Build and return the Quran preferences page.
 *
 * @param {Gio.Settings} settings - Extension GSettings instance
 * @returns {Adw.PreferencesPage}
 */
export function buildQuranPage(settings) {
  const page = new Adw.PreferencesPage({
    title: 'Quran',
    icon_name: 'accessories-dictionary-symbolic',
  });

  // ----------------------------------------------------------------
  //  General settings
  // ----------------------------------------------------------------
  const generalGroup = new Adw.PreferencesGroup({
    title: 'Reading Reminder',
    description: 'Configure how often you receive Quran reading reminders.',
  });
  page.add(generalGroup);

  // --- Master toggle ---
  const enabledRow = new Adw.SwitchRow({
    title: 'Enable Quran Reminders',
    subtitle: 'Show periodic reminders to read Quran.',
  });
  enabledRow.set_active(settings.get_boolean('quran-enabled'));
  enabledRow.connect('notify::active', (_row) => {
    settings.set_boolean('quran-enabled', _row.get_active());
    _updateVisibility(settings, frequencyRow, offsetRow, windowStartRow, windowEndRow);
  });
  generalGroup.add(enabledRow);

  // --- Frequency dropdown ---
  const frequencyRow = new Adw.ComboRow({
    title: 'Reminder Frequency',
    subtitle: 'How often to send the Quran reading reminder.',
  });
  const frequencyModel = Gtk.StringList.new(FREQUENCY_LABELS);
  frequencyRow.set_model(frequencyModel);
  frequencyRow.set_selected(_frequencyIndex(settings.get_string('quran-frequency')));
  frequencyRow.connect('notify::selected', (_row) => {
    settings.set_string('quran-frequency', FREQUENCY_KEYS[_row.get_selected()]);
    _updateVisibility(settings, frequencyRow, offsetRow, windowStartRow, windowEndRow);
  });
  generalGroup.add(frequencyRow);

  // --- Offset (revealed for after-fajr / after-isha) ---
  const offsetAdj = new Gtk.Adjustment({
    lower: 5,
    upper: 120,
    step_increment: 5,
    page_increment: 15,
    value: settings.get_int('quran-offset'),
  });
  const offsetSpin = new Gtk.SpinButton({
    adjustment: offsetAdj,
    digits: 0,
    valign: Gtk.Align.CENTER,
  });
  const offsetRow = new Adw.ActionRow({
    title: 'Offset After Prayer',
    subtitle: 'Minutes after the prayer to send the reminder.',
  });
  offsetRow.add_suffix(offsetSpin);
  offsetRow.activatable_widget = offsetSpin;
  offsetAdj.connect('value-changed', () => {
    settings.set_int('quran-offset', offsetAdj.get_value());
  });
  generalGroup.add(offsetRow);

  // --- Random window start (revealed for random) ---
  const windowStartAdj = new Gtk.Adjustment({
    lower: 0,
    upper: 23,
    step_increment: 1,
    page_increment: 1,
    value: settings.get_int('quran-window-start'),
  });
  const windowStartSpin = new Gtk.SpinButton({
    adjustment: windowStartAdj,
    digits: 0,
    valign: Gtk.Align.CENTER,
  });
  const windowStartRow = new Adw.ActionRow({
    title: 'Window Start Hour',
    subtitle: 'Earliest hour for the random reminder (0–23).',
  });
  windowStartRow.add_suffix(windowStartSpin);
  windowStartRow.activatable_widget = windowStartSpin;
  windowStartAdj.connect('value-changed', () => {
    settings.set_int('quran-window-start', windowStartAdj.get_value());
  });
  generalGroup.add(windowStartRow);

  // --- Random window end (revealed for random) ---
  const windowEndAdj = new Gtk.Adjustment({
    lower: 1,
    upper: 24,
    step_increment: 1,
    page_increment: 1,
    value: settings.get_int('quran-window-end'),
  });
  const windowEndSpin = new Gtk.SpinButton({
    adjustment: windowEndAdj,
    digits: 0,
    valign: Gtk.Align.CENTER,
  });
  const windowEndRow = new Adw.ActionRow({
    title: 'Window End Hour',
    subtitle: 'Latest hour for the random reminder (1–24).',
  });
  windowEndRow.add_suffix(windowEndSpin);
  windowEndRow.activatable_widget = windowEndSpin;
  windowEndAdj.connect('value-changed', () => {
    settings.set_int('quran-window-end', windowEndAdj.get_value());
  });
  generalGroup.add(windowEndRow);

  // ----------------------------------------------------------------
  //  Daily goal
  // ----------------------------------------------------------------
  const goalGroup = new Adw.PreferencesGroup({
    title: 'Daily Goal',
    description: 'Set a target number of pages to read each day.',
  });
  page.add(goalGroup);

  const goalAdj = new Gtk.Adjustment({
    lower: 1,
    upper: 50,
    step_increment: 1,
    page_increment: 5,
    value: settings.get_int('quran-daily-goal'),
  });
  const goalSpin = new Gtk.SpinButton({
    adjustment: goalAdj,
    digits: 0,
    valign: Gtk.Align.CENTER,
  });
  const goalRow = new Adw.ActionRow({
    title: 'Pages per Day',
    subtitle: 'Your daily Quran reading goal.',
  });
  goalRow.add_suffix(goalSpin);
  goalRow.activatable_widget = goalSpin;
  goalAdj.connect('value-changed', () => {
    settings.set_int('quran-daily-goal', goalAdj.get_value());
  });
  goalGroup.add(goalRow);

  // --- Initial visibility ---
  _updateVisibility(settings, frequencyRow, offsetRow, windowStartRow, windowEndRow);

  return page;
}

// ------------------------------------------------------------------
//  Helpers
// ------------------------------------------------------------------

function _frequencyIndex(freq) {
  const idx = FREQUENCY_KEYS.indexOf(freq || 'daily');
  return idx >= 0 ? idx : 0;
}

function _updateVisibility(settings, frequencyRow, offsetRow, windowStartRow, windowEndRow) {
  const enabled = settings.get_boolean('quran-enabled');
  const freq = settings.get_string('quran-frequency');

  frequencyRow.set_visible(enabled);

  const showOffset = enabled && (freq === 'after-fajr' || freq === 'after-isha');
  offsetRow.set_visible(showOffset);

  const showWindow = enabled && freq === 'random';
  windowStartRow.set_visible(showWindow);
  windowEndRow.set_visible(showWindow);
}
