/*
 * Event data shape — the universal currency of the scheduler.
 *
 * Every event provider (prayer times, adhkar, Quran reminders, …)
 * returns arrays of Event objects.  The Scheduler sorts them by time
 * and fires them at the right moment.  The Notifications module knows
 * how to display them.
 *
 * This module is pure data — zero GLib / GNOME Shell dependencies.
 */

/**
 * @typedef {object} EventAction
 * @property {string}   label    - Button label shown in the notification
 * @property {Function} callback - Invoked when the user clicks the button
 */

/**
 * @typedef {object} Event
 * @property {string}        id          - Unique ID for this event instance
 * @property {string}        type        - Category (e.g. 'prayer', 'adhkar', 'quran', 'demo')
 * @property {string}        title       - Notification title
 * @property {string}        description - Notification body text
 * @property {Date}          time        - When the event should fire
 * @property {number}        priority    - 0 = lowest … 10 = highest (urgent prayer = 8, gentle nudge = 2)
 * @property {string|null}   icon        - Themed icon name or null for default
 * @property {string|null}   sound       - Path to sound file or null for no sound
 * @property {object|null}   repeatRule  - Future: recurrence rule (null = one-shot)
 * @property {EventAction[]} actions     - Buttons shown in the notification
 */

let _counter = 0;

/**
 * Create a validated Event object.
 *
 * @param {object} opts
 * @returns {Event}
 */
export function createEvent(opts) {
  const {
    id,
    type = 'generic',
    title,
    description = '',
    time,
    priority = 5,
    icon = null,
    sound = null,
    repeatRule = null,
    actions = [],
  } = opts;

  if (!title) throw new Error('Event requires a title');
  if (!(time instanceof Date) || isNaN(time.getTime()))
    throw new Error('Event requires a valid Date for time');

  const eventId = id || `evt-${Date.now()}-${++_counter}`;

  return {
    id: eventId,
    type,
    title,
    description,
    time,
    priority,
    icon,
    sound,
    repeatRule,
    actions,
  };
}

/**
 * Sort events by time ascending (earliest first).
 * For ties, higher priority fires first.
 *
 * @param {Event[]} events
 * @returns {Event[]}
 */
export function sortEvents(events) {
  return [...events].sort((a, b) => {
    const dt = a.time.getTime() - b.time.getTime();
    if (dt !== 0) return dt;
    return b.priority - a.priority; // higher priority first on ties
  });
}
