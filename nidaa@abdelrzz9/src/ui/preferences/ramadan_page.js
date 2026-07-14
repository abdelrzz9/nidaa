/*
 * Ramadan preferences page.
 *
 * Provides controls for:
 *   - Enable/disable Ramadan mode (master toggle)
 *   - Force Ramadan mode (for testing)
 *   - Taraweeh reminder toggle + offset
 *   - Laylat al-Qadr reminder toggle
 *   - Daily Ramadan dua toggle
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

const LOG_PREFIX = '[Nidaa:Prefs:Ramadan]';

export function buildRamadanPage(settings) {
  const page = new Adw.PreferencesPage({
    title: 'Ramadan',
    icon_name: 'weather-clear-night-symbolic',
  });

  // General
  const generalGroup = new Adw.PreferencesGroup({
    title: 'Ramadan Mode',
    description: 'Configure Ramadan-specific features. Ramadan mode activates automatically when the Hijri month is Ramadan (9).',
  });
  page.add(generalGroup);

  const enabledRow = new Adw.SwitchRow({
    title: 'Ramadan Mode',
    subtitle: 'Active when Hijri month is Ramadan (9).',
  });
  enabledRow.set_active(settings.get_boolean('ramadan-enabled'));
  enabledRow.connect('notify::active', (_row) => {
    settings.set_boolean('ramadan-enabled', _row.get_active());
    _updateVisibility(settings, generalGroup, taraweehGroup);
  });
  generalGroup.add(enabledRow);

  const forceRow = new Adw.SwitchRow({
    title: 'Force Ramadan Mode',
    subtitle: 'Override for testing — forces Ramadan display even when not month 9.',
  });
  forceRow.set_active(settings.get_boolean('force-ramadan'));
  forceRow.connect('notify::active', (_row) => {
    settings.set_boolean('force-ramadan', _row.get_active());
  });
  generalGroup.add(forceRow);

  // Taraweeh
  const taraweehGroup = new Adw.PreferencesGroup({
    title: 'Taraweeh Prayer',
    description: 'Configure the Taraweeh reminder after Isha.',
  });
  page.add(taraweehGroup);

  const taraweehEnabledRow = new Adw.SwitchRow({
    title: 'Enable Taraweeh Reminder',
    subtitle: 'Reminder after Isha during Ramadan.',
  });
  taraweehEnabledRow.set_active(settings.get_boolean('ramadan-taraweeh-enabled'));
  taraweehEnabledRow.connect('notify::active', (_row) => {
    settings.set_boolean('ramadan-taraweeh-enabled', _row.get_active());
    _updateTaraweehVisibility(settings, taraweehOffsetRow);
  });
  taraweehGroup.add(taraweehEnabledRow);

  const taraweehOffsetAdj = new Gtk.Adjustment({
    lower: 5,
    upper: 60,
    step_increment: 5,
    page_increment: 15,
    value: settings.get_int('ramadan-taraweeh-offset'),
  });
  const taraweehOffsetSpin = new Gtk.SpinButton({
    adjustment: taraweehOffsetAdj,
    digits: 0,
    valign: Gtk.Align.CENTER,
  });
  const taraweehOffsetRow = new Adw.ActionRow({
    title: 'Taraweeh Offset (min)',
    subtitle: 'Minutes after Isha to send the Taraweeh reminder.',
  });
  taraweehOffsetRow.add_suffix(taraweehOffsetSpin);
  taraweehOffsetRow.activatable_widget = taraweehOffsetSpin;
  taraweehOffsetAdj.connect('value-changed', () => {
    settings.set_int('ramadan-taraweeh-offset', taraweehOffsetAdj.get_value());
  });
  taraweehGroup.add(taraweehOffsetRow);

  // Laylat al-Qadr
  const qadrGroup = new Adw.PreferencesGroup({
    title: 'Laylat al-Qadr',
    description: 'Special reminders on the last ten nights of Ramadan.',
  });
  page.add(qadrGroup);

  const qadrRow = new Adw.SwitchRow({
    title: 'Enable Laylat al-Qadr',
    subtitle: 'Special reminder on the odd nights of the last ten days of Ramadan.',
  });
  qadrRow.set_active(settings.get_boolean('ramadan-laylat-qadr-enabled'));
  qadrRow.connect('notify::active', (_row) => {
    settings.set_boolean('ramadan-laylat-qadr-enabled', _row.get_active());
  });
  qadrGroup.add(qadrRow);

  // Daily dua
  const duaGroup = new Adw.PreferencesGroup({
    title: 'Daily Ramadan Dua',
    description: 'Show a daily dua during Ramadan.',
  });
  page.add(duaGroup);

  const duaRow = new Adw.SwitchRow({
    title: 'Daily Ramadan Dua',
    subtitle: 'Show a daily dua during Ramadan.',
  });
  duaRow.set_active(settings.get_boolean('ramadan-daily-dua-enabled'));
  duaRow.connect('notify::active', (_row) => {
    settings.set_boolean('ramadan-daily-dua-enabled', _row.get_active());
  });
  duaGroup.add(duaRow);

  _updateVisibility(settings, generalGroup, taraweehGroup);

  return page;
}

function _updateVisibility(settings, generalGroup, taraweehGroup) {
  const enabled = settings.get_boolean('ramadan-enabled');
  taraweehGroup.set_visible(enabled);
}

function _updateTaraweehVisibility(settings, offsetRow) {
  const enabled = settings.get_boolean('ramadan-taraweeh-enabled');
  offsetRow.set_visible(enabled);
}
