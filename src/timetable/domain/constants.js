/** Easy Timetable scheduling constants (no I/O). */
export const STORAGE_KEY = "easy-timetable-v2";
/** Prior key; migrated on load in persistence.js. */
export const LEGACY_STORAGE_KEY = "gapscape-v2";
export const HOUR_HEIGHT = 64;
export const WHEEL_ITEM = 48;
export const MINUTE_STEP = 5;
export const MINUTE_VALUES = Array.from({ length: 12 }, (_, i) => i * 5);

export function createTaskId() {
  return Date.now() + Math.floor(Math.random() * 100000);
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
