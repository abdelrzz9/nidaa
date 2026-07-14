import Extension from 'resource:///org/gnome/shell/extensions/extension.js';

export default class NidaaExtension extends Extension {
  enable() {
    this._enabled = true;
    console.log('Nidaa enabled');
  }

  disable() {
    this._enabled = false;
    console.log('Nidaa disabled');
  }
}
