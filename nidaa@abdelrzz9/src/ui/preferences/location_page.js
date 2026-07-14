/*
 * Location preferences page.
 *
 * Provides controls for:
 *   - Location mode (Auto / Manual lat-lng / City search)
 *   - Manual latitude and longitude entry
 *   - Searchable city list from bundled JSON database
 *   - Current resolved location display (read-only)
 *
 * Offline-first design: the bundled cities.json contains ~300 major cities
 * with coordinates. No network calls are made from this module.
 *
 * Follows GNOME HIG + libadwaita conventions.
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { _ } from '../../core/i18n/index.js';

const LOG_PREFIX = '[Nidaa:Prefs:Location]';

/**
 * Human-readable labels for location modes.
 * Order matches the index used by the ComboRow.
 */
const MODE_LABELS = [
  _('Automatic (Geoclue + IP)'),
  _('Search city'),
  _('Enter coordinates manually'),
];

/** GSettings string values for each mode. */
const MODE_KEYS = ['auto', 'city', 'manual'];

/**
 * Build and return the Location preferences page.
 *
 * @param {Gio.Settings} settings - Extension GSettings instance
 * @returns {Adw.PreferencesPage}
 */
export function buildLocationPage(settings) {
  const page = new Adw.PreferencesPage({
    title: _('Location'),
    icon_name: 'find-location-symbolic',
  });

  // Load bundled cities database
  const cities = _loadCities();

  // ----------------------------------------------------------------
  //  Current location display
  // ----------------------------------------------------------------
  const statusGroup = new Adw.PreferencesGroup({
    title: _('Current Location'),
  });
  page.add(statusGroup);

  const statusRow = new Adw.ActionRow({
    title: _('Resolving location...'),
    subtitle: _('Waiting for first fix.'),
  });
  // Icon at the start
  const statusIcon = new Gtk.Image({
    icon_name: 'find-location-symbolic',
    pixel_size: 16,
  });
  statusRow.add_prefix(statusIcon);
  statusGroup.add(statusRow);

  _updateStatusDisplay(settings, statusRow);

  // ----------------------------------------------------------------
  //  Location mode
  // ----------------------------------------------------------------
  const modeGroup = new Adw.PreferencesGroup({
    title: _('Location Source'),
    description: _('How Nidaa determines your position for prayer times.'),
  });
  page.add(modeGroup);

  const modeRow = new Adw.ComboRow({
    title: _('Location Mode'),
    subtitle: _('Automatic uses Geoclue with IP fallback.'),
  });
  const modeModel = Gtk.StringList.new(MODE_LABELS);
  modeRow.set_model(modeModel);
  modeRow.set_selected(_modeKeyToIndex(settings.get_string('location-mode')));

  modeRow.connect('notify::selected', (_row) => {
    const key = MODE_KEYS[_row.get_selected()];
    settings.set_string('location-mode', key);
    _updateModeVisibility(key, manualGroup, cityGroup);
  });
  modeGroup.add(modeRow);

  // ----------------------------------------------------------------
  //  Manual coordinates
  // ----------------------------------------------------------------
  const manualGroup = new Adw.PreferencesGroup({
    title: _('Manual Coordinates'),
    description: _('Enter latitude and longitude in decimal degrees.'),
  });
  page.add(manualGroup);

  // Latitude
  const latAdj = new Gtk.Adjustment({
    lower: -90.0,
    upper: 90.0,
    step_increment: 0.01,
    page_increment: 1.0,
    value: settings.get_double('manual-latitude'),
  });
  const latSpin = new Gtk.SpinButton({
    adjustment: latAdj,
    digits: 4,
    hexpand: true,
    valign: Gtk.Align.CENTER,
  });
  const latRow = new Adw.ActionRow({
    title: _('Latitude'),
    subtitle: _('North is positive, South is negative (-90 to 90).'),
  });
  latRow.add_suffix(latSpin);
  latRow.activatable_widget = latSpin;
  manualGroup.add(latRow);

  latAdj.connect('value-changed', () => {
    settings.set_double('manual-latitude', latAdj.get_value());
    _updateStatusDisplay(settings, statusRow);
  });

  // Longitude
  const lngAdj = new Gtk.Adjustment({
    lower: -180.0,
    upper: 180.0,
    step_increment: 0.01,
    page_increment: 1.0,
    value: settings.get_double('manual-longitude'),
  });
  const lngSpin = new Gtk.SpinButton({
    adjustment: lngAdj,
    digits: 4,
    hexpand: true,
    valign: Gtk.Align.CENTER,
  });
  const lngRow = new Adw.ActionRow({
    title: _('Longitude'),
    subtitle: _('East is positive, West is negative (-180 to 180).'),
  });
  lngRow.add_suffix(lngSpin);
  lngRow.activatable_widget = lngSpin;
  manualGroup.add(lngRow);

  lngAdj.connect('value-changed', () => {
    settings.set_double('manual-longitude', lngAdj.get_value());
    _updateStatusDisplay(settings, statusRow);
  });

  // ----------------------------------------------------------------
  //  City search
  // ----------------------------------------------------------------
  const cityGroup = new Adw.PreferencesGroup({
    title: _('City Search'),
    description: _('Select a city from the bundled database (offline).'),
  });
  page.add(cityGroup);

  // Search entry
  const searchEntry = new Gtk.SearchEntry({
    placeholder_text: _('Search cities...'),
    hexpand: true,
  });
  const searchRow = new Adw.ActionRow();
  searchRow.add_child(searchEntry);
  cityGroup.add(searchRow);

  // Build a fast lookup: index → city data
  const cityData = cities;

  // Use a simple Gtk.StringList with manual filter management
  const allStrings = cityData.map((c) => `${c.name}, ${c.country}`);
  const listStore = new Gtk.StringList();

  // Populate initially with all cities
  for (const s of allStrings) {
    listStore.append(s);
  }

  // Track the current filter text
  let filterText = '';

  /**
   * Rebuild the StringList based on the current filter.
   * Gtk.StringList doesn't support dynamic filtering well,
   * so we rebuild it entirely on each search change.
   */
  function rebuildFilteredList() {
    // Remove all items
    while (listStore.get_n_items() > 0) {
      listStore.remove(0);
    }

    const term = filterText.toLowerCase();
    for (const s of allStrings) {
      if (!term || s.toLowerCase().includes(term)) {
        listStore.append(s);
      }
    }
  }

  // Search bar with the list
  const scroller = new Gtk.ScrolledWindow({
    vexpand: true,
    min_content_height: 200,
    max_content_height: 300,
  });

  const listView = new Gtk.ListView({
    model: listStore,
    single_click_activate: true,
  });

  const factory = new Gtk.SignalListItemFactory();
  factory.connect('setup', (_factory, item) => {
    const label = new Gtk.Label({
      xalign: 0,
      margin_top: 4,
      margin_bottom: 4,
    });
    item.set_child(label);
  });
  factory.connect('bind', (_factory, item) => {
    const label = item.get_child();
    const listModel = item.get_item();
    const idx = listStore.find(listModel);
    if (idx >= 0) {
      label.set_text(listStore.get_string(idx));
    }
  });
  listView.set_factory(factory);

  scroller.set_child(listView);
  cityGroup.add(scroller);

  // Handle search input
  searchEntry.connect('search-changed', () => {
    filterText = searchEntry.get_text();
    rebuildFilteredList();
  });

  // Handle city selection
  listView.connect('activate', (_list, position) => {
    const displayText = listStore.get_string(position);
    if (!displayText) return;

    const matchIdx = allStrings.indexOf(displayText);
    if (matchIdx < 0) return;

    const city = cityData[matchIdx];
    settings.set_double('manual-latitude', city.lat);
    settings.set_double('manual-longitude', city.lng);
    settings.set_string('manual-city-name', `${city.name}, ${city.country}`);
    settings.set_string('location-mode', 'city');

    // Update spin buttons to reflect the new values
    latAdj.set_value(city.lat);
    lngAdj.set_value(city.lng);

    // Update mode combo
    modeRow.set_selected(1); // city mode
    _updateModeVisibility('city', manualGroup, cityGroup);
    _updateStatusDisplay(settings, statusRow);

    console.log(`${LOG_PREFIX} city selected: ${city.name}, ${city.country} (${city.lat}, ${city.lng})`);
  });

  // ----------------------------------------------------------------
  //  Initial visibility
  // ----------------------------------------------------------------
  const currentMode = settings.get_string('location-mode');
  _updateModeVisibility(currentMode, manualGroup, cityGroup);

  return page;
}

// ------------------------------------------------------------------
//  Helpers
// ------------------------------------------------------------------

/**
 * Load the bundled cities JSON database.
 * Uses GLib file I/O to read from the extension's assets directory.
 *
 * @returns {Array<{name: string, country: string, lat: number, lng: number}>}
 */
function _loadCities() {
  try {
    // Try to load from the extension's asset path
    const extensionDir = GLib.get_current_dir();
    const candidates = [
      `${extensionDir}/assets/cities.json`,
      `${extensionDir}/../assets/cities.json`,
      // When installed as a GNOME extension
      `${GLib.get_home_dir()}/.local/share/gnome-shell/extensions/nidaa@abdelrzz9/assets/cities.json`,
    ];

    for (const path of candidates) {
      const file = Gio.File.new_for_path(path);
      if (file.query_exists(null)) {
        const [success, contents] = file.load_contents(null);
        if (success) {
          const parsed = JSON.parse(new TextDecoder().decode(contents));
          console.log(`${LOG_PREFIX} loaded ${parsed.length} cities from ${path}`);
          return parsed;
        }
      }
    }

    console.warn(`${LOG_PREFIX} cities.json not found — city search will be empty`);
    return [];
  } catch (err) {
    console.error(`${LOG_PREFIX} failed to load cities.json: ${err}`);
    return [];
  }
}

/**
 * Convert a GSettings mode string to the ComboRow index.
 */
function _modeKeyToIndex(key) {
  const idx = MODE_KEYS.indexOf(key);
  return idx >= 0 ? idx : 0;
}

/**
 * Show/hide the manual and city groups based on the current mode.
 */
function _updateModeVisibility(mode, manualGroup, cityGroup) {
  manualGroup.set_visible(mode === 'manual');
  cityGroup.set_visible(mode === 'city');
}

/**
 * Update the status row to show the currently resolved location.
 */
function _updateStatusDisplay(settings, statusRow) {
  const mode = settings.get_string('location-mode');

  if (mode === 'auto') {
    statusRow.set_title(_('Automatic'));
    statusRow.set_subtitle(_('Using Geoclue with IP fallback. Location is resolved at startup.'));
  } else {
    const lat = settings.get_double('manual-latitude');
    const lng = settings.get_double('manual-longitude');
    const cityName = settings.get_string('manual-city-name');

    if (lat === 0 && lng === 0) {
      statusRow.set_title(_('No location set'));
      statusRow.set_subtitle(_('Enter coordinates or select a city.'));
      return;
    }

    const latDir = lat >= 0 ? 'N' : 'S';
    const lngDir = lng >= 0 ? 'E' : 'W';
    const coordStr = `${Math.abs(lat).toFixed(2)}°${latDir}, ${Math.abs(lng).toFixed(2)}°${lngDir}`;

    if (mode === 'city' && cityName) {
      statusRow.set_title(_(`Using: ${coordStr}`));
      statusRow.set_subtitle(`${cityName}`);
    } else {
      statusRow.set_title(_(`Using: ${coordStr}`));
      statusRow.set_subtitle(_(`Mode: ${mode === 'manual' ? 'Manual entry' : 'Automatic'}`));
    }
  }
}
