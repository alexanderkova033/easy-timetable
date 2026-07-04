import { toTime } from "../shared/time.js";

/**
 * Sorts and merges overlapping gaps; refreshes derived start/end labels.
 * @param {Array} gaps
 */
export function normalizeGaps(gaps) {
  const sorted = [...gaps].sort((a, b) => a.startMinutes - b.startMinutes);
  const merged = [];

  for (const gap of sorted) {
    const current = { ...gap };
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push(current);
      continue;
    }
    if (current.startMinutes <= last.endMinutes) {
      last.endMinutes = Math.max(last.endMinutes, current.endMinutes);
      last.duration = last.endMinutes - last.startMinutes;
      last.start = toTime(last.startMinutes);
      last.end = toTime(last.endMinutes);
    } else {
      merged.push(current);
    }
  }
  return merged.map((g) => ({
    ...g,
    start: toTime(g.startMinutes),
    end: toTime(g.endMinutes),
    duration: g.endMinutes - g.startMinutes,
  }));
}
