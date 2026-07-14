/*
 * Islamic Events preferences page.
 *
 * Provides controls for:
 *   - Friday reminders (toggle + configurable times)
 *   - Ashura reminder (toggle + day-before)
 *   - Arafah reminder (toggle + day-before)
 *   - White Days (toggle)
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

const LOG_PREFIX = '[Nidaa:Prefs:Events]';

export function buildEventsPage(settings) {
  const page = new Adw.PreferencesPage({
    title: 'Islamic Events',
    icon_name: 'x-office-calendar-symbolic',
  });

  // ── Friday ────────────────────────────────────────────────────────
  const fridayGroup = new Adw.PreferencesGroup({
    title: 'Friday Reminders',
    description: 'Notifications for Thursday night, Friday morning, and Friday afternoon.',
  });
  page.add(fridayGroup);

  const fridayEnabledRow = new Adw.SwitchRow({
    title: 'Enable Friday Reminders',
    subtitle: 'Notifications for Thursday night, Friday morning, and Friday afternoon.',
  });
  fridayEnabledRow.set_active(settings.get_boolean('events-friday-enabled'));
  fridayEnabledRow.connect('notify::active', (_row) => {
    settings.set_boolean('events-friday-enabled', _row.get_active());
    _updateFridayVisibility(settings, thursdayRow, morningRow, afternoonRow);
  });
  fridayGroup.add(fridayEnabledRow);

  const thursdayAdj = new Gtk.Adjustment({
    lower: 0,
    upper: 23,
    step_increment: 1,
    page_increment: 1,
    value: settings.get_int('events-friday-thursday-hour'),
  });
  const thursdaySpin = new Gtk.SpinButton({
    adjustment: thursdayAdj,
    digits: 0,
    valign: Gtk.Align.CENTER,
  });
  const thursdayRow = new Adw.ActionRow({
    title: 'Thursday Night Time',
    subtitle: 'Hour of the Thursday night reminder (0–23).',
  });
  thursdayRow.add_suffix(thursdaySpin);
  thursdayRow.activatable_widget = thursdaySpin;
  thursdayAdj.connect('value-changed', () => {
    settings.set_int('events-friday-thursday-hour', thursdayAdj.get_value());
  });
  fridayGroup.add(thursdayRow);

  const morningAdj = new Gtk.Adjustment({
    lower: 0,
    upper: 23,
    step_increment: 1,
    page_increment: 1,
    value: settings.get_int('events-friday-morning-hour'),
  });
  const morningSpin = new Gtk.SpinButton({
    adjustment: morningAdj,
    digits: 0,
    valign: Gtk.Align.CENTER,
  });
  const morningRow = new Adw.ActionRow({
    title: 'Friday Morning Time',
    subtitle: 'Hour of the Friday morning reminder (0–23).',
  });
  morningRow.add_suffix(morningSpin);
  morningRow.activatable_widget = morningSpin;
  morningAdj.connect('value-changed', () => {
    settings.set_int('events-friday-morning-hour', morningAdj.get_value());
  });
  fridayGroup.add(morningRow);

  const afternoonAdj = new Gtk.Adjustment({
    lower: 0,
    upper: 23,
    step_increment: 1,
    page_increment: 1,
    value: settings.get_int('events-friday-afternoon-hour'),
  });
  const afternoonSpin = new Gtk.SpinButton({
    adjustment: afternoonAdj,
    digits: 0,
    valign: Gtk.Align.CENTER,
  });
  const afternoonRow = new Adw.ActionRow({
    title: 'Friday Afternoon Time',
    subtitle: 'Hour of the Friday afternoon reminder (0–23).',
  });
  afternoonRow.add_suffix(afternoonSpin);
  afternoonRow.activatable_widget = afternoonSpin;
  afternoonAdj.connect('value-changed', () => {
    settings.set_int('events-friday-afternoon-hour', afternoonAdj.get_value());
  });
  fridayGroup.add(afternoonRow);

  // ── Ashura ────────────────────────────────────────────────────────
  const ashuraGroup = new Adw.PreferencesGroup({
    title: 'Ashura',
    description: 'Reminders for the Day of Ashura (Muharram 10).',
  });
  page.add(ashuraGroup);

  const ashuraEnabledRow = new Adw.SwitchRow({
    title: 'Enable Ashura Reminder',
    subtitle: 'Reminder on Muharram 10 (Ashura).',
  });
  ashuraEnabledRow.set_active(settings.get_boolean('events-ashura-enabled'));
  ashuraEnabledRow.connect('notify::active', (_row) => {
    settings.set_boolean('events-ashura-enabled', _row.get_active());
    _updateAshuraVisibility(settings, ashuraDayBeforeRow);
  });
  ashuraGroup.add(ashuraEnabledRow);

  const ashuraDayBeforeRow = new Adw.SwitchRow({
    title: 'Ashura Day-Before',
    subtitle: 'Show a heads-up the day before Ashura.',
  });
  ashuraDayBeforeRow.set_active(settings.get_boolean('events-ashura-daybefore'));
  ashuraDayBeforeRow.connect('notify::active', (_row) => {
    settings.set_boolean('events-ashura-daybefore', _row.get_active());
  });
  ashuraGroup.add(ashuraDayBeforeRow);

  // ── Arafah ────────────────────────────────────────────────────────
  const arafahGroup = new Adw.PreferencesGroup({
    title: 'Day of Arafah',
    description: 'Reminders for the Day of Arafah (Dhul Hijjah 9).',
  });
  page.add(arafahGroup);

  const arafahEnabledRow = new Adw.SwitchRow({
    title: 'Enable Arafah Reminder',
    subtitle: 'Reminder on Dhul Hijjah 9 (Day of Arafah).',
  });
  arafahEnabledRow.set_active(settings.get_boolean('events-arafah-enabled'));
  arafahEnabledRow.connect('notify::active', (_row) => {
    settings.set_boolean('events-arafah-enabled', _row.get_active());
    _updateArafahVisibility(settings, arafahDayBeforeRow);
  });
  arafahGroup.add(arafahEnabledRow);

  const arafahDayBeforeRow = new Adw.SwitchRow({
    title: 'Arafah Day-Before',
    subtitle: 'Show a heads-up the day before Arafah.',
  });
  arafahDayBeforeRow.set_active(settings.get_boolean('events-arafah-daybefore'));
  arafahDayBeforeRow.connect('notify::active', (_row) => {
    settings.set_boolean('events-arafah-daybefore', _row.get_active());
  });
  arafahGroup.add(arafahDayBeforeRow);

  // ── White Days ────────────────────────────────────────────────────
  const whiteGroup = new Adw.PreferencesGroup({
    title: 'White Days',
    description: 'Reminder on the 13th–15th of each Hijri month.',
  });
  page.add(whiteGroup);

  const whiteEnabledRow = new Adw.SwitchRow({
    title: 'Enable White Days',
    subtitle: 'Reminder on the 13th–15th of each Hijri month.',
  });
  whiteEnabledRow.set_active(settings.get_boolean('events-whitedays-enabled'));
  whiteEnabledRow.connect('notify::active', (_row) => {
    settings.set_boolean('events-whitedays-enabled', _row.get_active());
  });
  whiteGroup.add(whiteEnabledRow);

  // Initial visibility
  _updateFridayVisibility(settings, thursdayRow, morningRow, afternoonRow);
  _updateAshuraVisibility(settings, ashuraDayBeforeRow);
  _updateArafahVisibility(settings, arafahDayBeforeRow);

  return page;
}

function _updateFridayVisibility(settings, thursdayRow, morningRow, afternoonRow) {
  const enabled = settings.get_boolean('events-friday-enabled');
  thursdayRow.set_visible(enabled);
  morningRow.set_visible(enabled);
  afternoonRow.set_visible(enabled);
}

function _updateAshuraVisibility(settings, dayBeforeRow) {
  const enabled = settings.get_boolean('events-ashura-enabled');
  dayBeforeRow.set_visible(enabled);
}

function _updateArafahVisibility(settings, dayBeforeRow) {
  const enabled = settings.get_boolean('events-arafah-enabled');
  dayBeforeRow.set_visible(enabled);
}
