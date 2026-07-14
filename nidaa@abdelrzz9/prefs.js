/*
 * Nidaa extension preferences — GNOME Shell Preferences interface.
 *
 * Entry point for `gnome-extensions prefs nidaa@abdelrzz9`.
 * Delegates to src/ui/preferences/index.js which builds the
 * Adw.PreferencesWindow with Prayer and Location pages.
 */

import { ExtensionPreferences } from 'resource:///org/gnome/shell/extensions/extension.js';
import { fillPreferencesWindow } from './src/ui/preferences/index.js';

export default class NidaaPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    fillPreferencesWindow(window);
  }
}
