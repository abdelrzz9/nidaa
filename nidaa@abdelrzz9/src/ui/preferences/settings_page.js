/*
 * Settings preferences page.
 *
 * Provides controls for:
 *   - UI language override (Arabic / English / French)
 *   - Import/Export settings
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const LOG_PREFIX = '[Nidaa:Prefs:Settings]';

const LANG_LABELS = [
  'System Default (English)',
  'Arabic',
  'English',
  'French',
];

const LANG_KEYS = ['en', 'ar', 'en', 'fr'];

const SCHEMA_ID = 'org.gnome.shell.extensions.nidaa';
const SETTINGS_VERSION = 1;

export function buildSettingsPage(settings) {
  const page = new Adw.PreferencesPage({
    title: 'Settings',
    icon_name: 'emblem-system-symbolic',
  });

  // Language override
  const langGroup = new Adw.PreferencesGroup({
    title: 'Language',
    description: 'Override the system locale for Nidaa UI strings.',
  });
  page.add(langGroup);

  const langRow = new Adw.ComboRow({
    title: 'Override',
    subtitle: 'Override system locale for Nidaa UI strings.',
  });
  const langModel = Gtk.StringList.new(LANG_LABELS);
  langRow.set_model(langModel);
  const currentLang = settings.get_string('ui-language');
  langRow.set_selected(_langIndex(currentLang));
  langRow.connect('notify::selected', (_row) => {
    const key = LANG_KEYS[_row.get_selected()];
    settings.set_string('ui-language', key);
    console.log(`${LOG_PREFIX} UI language set to "${key}"`);
  });
  langGroup.add(langRow);

  // Import / Export
  const ioGroup = new Adw.PreferencesGroup({
    title: 'Settings Import / Export',
    description: 'Back up your settings or restore from a previous export.',
  });
  page.add(ioGroup);

  const exportRow = new Adw.ActionRow({
    title: 'Export Settings',
    subtitle: 'Export extension settings to a JSON file.',
    activatable: true,
  });
  const exportIcon = new Gtk.Image({
    icon_name: 'document-send-symbolic',
    pixel_size: 16,
  });
  exportRow.add_prefix(exportIcon);
  exportRow.connect('activated', () => {
    _exportSettings(settings);
  });
  ioGroup.add(exportRow);

  const importRow = new Adw.ActionRow({
    title: 'Import Settings',
    subtitle: 'Import extension settings from a JSON file.',
    activatable: true,
  });
  const importIcon = new Gtk.Image({
    icon_name: 'document-open-symbolic',
    pixel_size: 16,
  });
  importRow.add_prefix(importIcon);
  importRow.connect('activated', () => {
    _importSettings(settings);
  });
  ioGroup.add(importRow);

  return page;
}

function _langIndex(lang) {
  const lower = (lang || '').toLowerCase();
  if (lower === 'ar') return 1;
  if (lower === 'fr') return 3;
  return 0; // default / en
}

function _exportSettings(settings) {
  try {
    const dialog = new Gtk.FileDialog({
      title: 'Export Nidaa Settings',
      initial_name: 'nidaa-settings.json',
    });

    dialog.save(null, null, (_dialog, result) => {
      try {
        const file = dialog.save_finish(result);
        if (!file) return;

        const keys = settings.list_keys();
        const data = {};
        for (const key of keys) {
          const variant = settings.get_value(key);
          if (variant) {
            data[key] = variant.deep_unpack();
          }
        }

        const jsonStr = JSON.stringify({
          version: SETTINGS_VERSION,
          'exported-at': new Date().toISOString(),
          settings: data,
        }, null, 2);

        const [success] = file.replace_contents(
          jsonStr, null, false,
          Gio.FileCreateFlags.REPLACE_DESTINATION,
          null
        );

        if (success) {
          console.log(`${LOG_PREFIX} settings exported to ${file.get_path()}`);
        }
      } catch (err) {
        if (err.message !== 'canceled') {
          console.error(`${LOG_PREFIX} export failed: ${err}`);
        }
      }
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} export dialog failed: ${err}`);
  }
}

function _importSettings(settings) {
  try {
    const dialog = new Gtk.FileDialog({
      title: 'Import Nidaa Settings',
    });

    const filter = new Gtk.FileFilter();
    filter.set_name('JSON files');
    filter.add_pattern('*.json');
    const filters = Gio.ListStore.new(Gtk.FileFilter);
    filters.append(filter);
    dialog.set_filters(filters);

    dialog.open(null, null, (_dialog, result) => {
      try {
        const file = dialog.open_finish(result);
        if (!file) return;

        const [success, contents] = file.load_contents(null);
        if (!success || !contents) {
          console.warn(`${LOG_PREFIX} failed to read import file`);
          return;
        }

        const parsed = JSON.parse(new TextDecoder().decode(contents));

        if (!parsed || parsed.version !== SETTINGS_VERSION || !parsed.settings) {
          console.warn(`${LOG_PREFIX} invalid settings file — version mismatch or missing settings`);
          return;
        }

        for (const [key, value] of Object.entries(parsed.settings)) {
          try {
            settings.set_value(key, GLib.Variant.new_variant(
              GLib.Variant.new_value(typeFromValue(value))
            ));
          } catch (_err) {
            // skip unknown or type-mismatched keys
          }
        }

        console.log(`${LOG_PREFIX} settings imported from ${file.get_path()}`);
      } catch (err) {
        if (err.message !== 'canceled') {
          console.error(`${LOG_PREFIX} import failed: ${err}`);
        }
      }
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} import dialog failed: ${err}`);
  }
}

function typeFromValue(value) {
  if (typeof value === 'boolean') return GLib.Variant.new_boolean(value);
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return GLib.Variant.new_int32(value);
    return GLib.Variant.new_double(value);
  }
  if (typeof value === 'string') return GLib.Variant.new_string(value);
  return GLib.Variant.new_string(String(value));
}
