/*
 * GNOME Shell notification wrapper.
 *
 * Wraps MessageTray to show desktop notifications with:
 *   - title, body, icon
 *   - priority-mapped urgency (gentle → LOW, urgent prayer → HIGH/CRITICAL)
 *   - action buttons wired to the Event's actions
 *   - optional sound playback via canberra-gtk-play
 *
 * Sound choice rationale:
 *   canberra-gtk-play is part of libcanberra, a dependency of GTK+
 *   and GNOME Shell itself.  It is available on virtually every
 *   GNOME system and is what GNOME Shell uses internally for event
 *   sounds.  Alternatives like `paplay` require PulseAudio directly
 *   (not guaranteed on PipeWire-only setups), while Gio.SoundTheme
 *   doesn't support playing arbitrary files.
 *
 * Depends on: GLib, Gio (for icons), MessageTray (GNOME Shell UI).
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

const LOG_PREFIX = '[Nidaa:Notifications]';

/**
 * Map numeric priority (0–10) to MessageTray urgency.
 *
 *   0–3  → LOW     (adhkar nudge, Quran reminder)
 *   4–6  → NORMAL  (standard prayer notification)
 *   7–8  → HIGH    (Fajr / Isha — important, resist auto-dismiss)
 *   9–10 → CRITICAL (adhan — must be acknowledged)
 */
function priorityToUrgency(priority) {
  if (priority >= 9) return MessageTray.Urgency.CRITICAL;
  if (priority >= 7) return MessageTray.Urgency.HIGH;
  if (priority >= 4) return MessageTray.Urgency.NORMAL;
  return MessageTray.Urgency.LOW;
}

/**
 * Build a Gio.Icon from an icon name or file path.
 * Returns null if the name is null/empty (lets MessageTray use the source icon).
 */
function makeIcon(iconName) {
  if (!iconName) return null;
  if (iconName.includes('/') || iconName.includes('.')) {
    // Looks like a file path
    const file = Gio.File.new_for_path(iconName);
    return new Gio.FileIcon({ file });
  }
  // Themed icon name
  return new Gio.ThemedIcon({ name: iconName });
}

/**
 * Play a sound file via canberra-gtk-play.
 * Silently ignores errors (e.g. if canberra is not installed).
 */
function playSound(soundPath) {
  if (!soundPath) return;
  try {
    GLib.spawn_command_line_async(`canberra-gtk-play -d "${soundPath}"`);
  } catch (err) {
    console.warn(`${LOG_PREFIX} failed to play sound: ${err}`);
  }
}

// ------------------------------------------------------------------
//  Notification source (singleton)
// ------------------------------------------------------------------

let _source = null;

/**
 * Get or create the Nidaa notification source.
 * Connects to 'destroy' so we re-create if GNOME Shell drops it.
 *
 * @returns {MessageTray.Source}
 */
function getSource() {
  if (_source) return _source;

  const policy = new MessageTray.NotificationGenericPolicy();

  _source = new MessageTray.Source({
    title: 'Nidaa',
    iconName: 'alarm-symbolic',
    policy,
  });

  _source.connect('destroy', () => {
    _source = null;
  });

  Main.messageTray.add(_source);
  return _source;
}

// ------------------------------------------------------------------
//  Public API
// ------------------------------------------------------------------

/**
 * Show a desktop notification for the given Event.
 *
 * @param {import('../scheduler/event.js').Event} event
 * @returns {MessageTray.Notification|null}
 */
export function showNotification(event) {
  const source = getSource();

  const notification = new MessageTray.Notification({
    source,
    title: event.title,
    body: event.description,
    urgency: priorityToUrgency(event.priority),
    gicon: makeIcon(event.icon),
  });

  // Wire action buttons
  if (event.actions && event.actions.length > 0) {
    for (const action of event.actions) {
      notification.addAction(action.label, () => {
        try {
          action.callback();
        } catch (err) {
          console.error(`${LOG_PREFIX} action callback error: ${err}`);
        }
      });
    }
  }

  source.addNotification(notification);

  // Play sound after showing (so banner appears immediately)
  if (event.sound) {
    playSound(event.sound);
  }

  return notification;
}

/**
 * Clean up the notification source.
 * Call from extension.disable().
 */
export function destroyNotifications() {
  if (_source) {
    _source.destroy();
    _source = null;
  }
}
