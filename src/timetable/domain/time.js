/** Minute-of-day and human-readable duration formatting. */

import { clamp, MINUTE_STEP } from "./constants.js";

/**
 * Parse "HH:MM" / "H:MM" to minutes 0..1439. Returns null if invalid.
 * When roundToStep is true, rounds to nearest MINUTE_STEP and clamps into range.
 */
export function parseTimeToMinutes(value, { roundToStep = false } = {}) {
  const s = String(value ?? "").trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  let total = h * 60 + min;
  total = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  if (roundToStep) {
    total = clamp(Math.round(total / MINUTE_STEP) * MINUTE_STEP, 0, 24 * 60 - MINUTE_STEP);
  }
  return total;
}

export function toTime(minutes) {
  const safe = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = String(Math.floor(safe / 60)).padStart(2, "0");
  const m = String(safe % 60).padStart(2, "0");
  return `${h}:${m}`;
}

export function formatDuration(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
