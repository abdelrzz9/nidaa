/*
 * Quran reading progress store.
 *
 * Persists daily page count to a local JSON file:
 *   ~/.local/share/nidaa/quran-progress.json
 *
 * Follows the same pattern as location/cache.js.
 * Auto-resets the counter at local midnight by comparing
 * the stored date to today's ISO date string.
 *
 * File shape:
 *   { "date": "2025-06-20", "pagesRead": 2, "dailyGoal": 5 }
 *
 * All file I/O is injectable for testing.
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const LOG_PREFIX = '[Nidaa:Quran:Store]';
const FILE_NAME = 'quran-progress.json';
const DEFAULT_DAILY_GOAL = 5;

// ------------------------------------------------------------------
//  Injectable helpers (default to real GLib/Gio)
// ------------------------------------------------------------------

let _getUserDataDir = () => GLib.getUserDataDir();
let _mkdirWithParent = (dir, mode) => GLib.mkdirWithParent(dir, mode);
let _fileNewForPath = (path) => Gio.File.new_for_path(path);
let _buildFilename = (parts) => GLib.buildFilenamev(parts);

/**
 * Override file I/O for testing.
 */
export function _setFileDeps({ getUserDataDir, mkdirWithParent, fileNewForPath, buildFilename }) {
  if (getUserDataDir) _getUserDataDir = getUserDataDir;
  if (mkdirWithParent) _mkdirWithParent = mkdirWithParent;
  if (fileNewForPath) _fileNewForPath = fileNewForPath;
  if (buildFilename) _buildFilename = buildFilename;
}

/**
 * Reset file I/O to real GLib/Gio defaults.
 */
export function _resetFileDeps() {
  _getUserDataDir = () => GLib.getUserDataDir();
  _mkdirWithParent = (dir, mode) => GLib.mkdirWithParent(dir, mode);
  _fileNewForPath = (path) => Gio.File.new_for_path(path);
  _buildFilename = (parts) => GLib.buildFilenamev(parts);
}

// ------------------------------------------------------------------
//  Path helpers
// ------------------------------------------------------------------

export function getStoreDir() {
  return _buildFilename([_getUserDataDir(), 'nidaa']);
}

export function getStorePath() {
  return _buildFilename([getStoreDir(), FILE_NAME]);
}

function _ensureStoreDir() {
  const dir = getStoreDir();
  _mkdirWithParent(dir, 0o755);
  return dir;
}

// ------------------------------------------------------------------
//  Date helpers
// ------------------------------------------------------------------

/**
 * Return today's date as an ISO string (YYYY-MM-DD).
 * Uses pure JS — no GLib dependency for this.
 */
export function _todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Return the ISO date string for a given Date object.
 */
export function _dateISO(date) {
  return date.toISOString().slice(0, 10);
}

// ------------------------------------------------------------------
//  Core read/write
// ------------------------------------------------------------------

/**
 * Read today's progress from disk.
 * If the stored date differs from today, returns a fresh state (auto-reset).
 * If the file is missing or invalid, returns defaults.
 *
 * @param {string} [today] - Override today's date for testing
 * @returns {{ date: string, pagesRead: number, dailyGoal: number }}
 */
export function readProgress(today) {
  const todayStr = today || _todayISO();
  const path = getStorePath();

  try {
    const file = _fileNewForPath(path);
    if (!file.queryExists(null)) {
      return { date: todayStr, pagesRead: 0, dailyGoal: DEFAULT_DAILY_GOAL };
    }

    const [, contents] = file.loadContents(null);
    const data = JSON.parse(new TextDecoder().decode(contents));

    if (!data || typeof data.date !== 'string') {
      return { date: todayStr, pagesRead: 0, dailyGoal: DEFAULT_DAILY_GOAL };
    }

    // Auto-reset if stored date ≠ today
    if (data.date !== todayStr) {
      return { date: todayStr, pagesRead: 0, dailyGoal: data.dailyGoal || DEFAULT_DAILY_GOAL };
    }

    return {
      date: data.date,
      pagesRead: typeof data.pagesRead === 'number' ? data.pagesRead : 0,
      dailyGoal: typeof data.dailyGoal === 'number' ? data.dailyGoal : DEFAULT_DAILY_GOAL,
    };
  } catch (err) {
    console.warn(`${LOG_PREFIX} failed to read progress: ${err}`);
    return { date: todayStr, pagesRead: 0, dailyGoal: DEFAULT_DAILY_GOAL };
  }
}

/**
 * Write progress to disk.
 *
 * @param {{ date: string, pagesRead: number, dailyGoal: number }} data
 */
export function writeProgress(data) {
  try {
    _ensureStoreDir();
    const path = getStorePath();
    const file = _fileNewForPath(path);
    const payload = {
      date: data.date,
      pagesRead: data.pagesRead,
      dailyGoal: data.dailyGoal,
    };
    const encoder = new TextEncoder();
    file.replaceContents(
      encoder.encode(JSON.stringify(payload, null, 2)),
      null,
      false,
      Gio.FileCreateFlags.NONE,
      null
    );
    console.log(`${LOG_PREFIX} wrote progress to ${path}`);
  } catch (err) {
    console.warn(`${LOG_PREFIX} failed to write progress: ${err}`);
  }
}

/**
 * Increment today's page count by 1 and persist.
 *
 * @param {string} [today] - Override today's date for testing
 * @returns {{ date: string, pagesRead: number, dailyGoal: number }}
 */
export function incrementPage(today) {
  const progress = readProgress(today);
  progress.pagesRead += 1;
  writeProgress(progress);
  return progress;
}

/**
 * Set the daily goal and persist.
 *
 * @param {number} goal
 * @param {string} [today] - Override today's date for testing
 * @returns {{ date: string, pagesRead: number, dailyGoal: number }}
 */
export function setDailyGoal(goal, today) {
  const progress = readProgress(today);
  progress.dailyGoal = Math.max(1, Math.floor(goal));
  writeProgress(progress);
  return progress;
}
