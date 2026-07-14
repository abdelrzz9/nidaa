import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import Extension from 'resource:///org/gnome/shell/extensions/extension.js';

export default class NidaaPreferences extends Extension.Preferences {
  fillPreferencesWindow(window) {
    window._wasFilled = true;

    const page = new Adw.PreferencesPage();
    window.add(page);

    const group = new Adw.PreferencesGroup();
    page.add(group);

    group.add(
      new Adw.ActionRow({
        title: 'Nidaa settings coming soon.',
      })
    );
  }
}
