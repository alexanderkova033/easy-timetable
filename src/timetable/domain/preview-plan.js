import { clamp } from "./constants.js";
import { toTime } from "./time.js";
import { totalGapMinutes } from "./aggregates.js";

export function applyReserve(gaps, keepBuffer) {
  const total = totalGapMinutes(gaps);
  const reserve = keepBuffer ? Math.min(45, Math.max(10, Math.round(total * 0.12))) : 0;
  let remaining = reserve;
  const segments = gaps.map((gap) => ({ gapId: gap.id, start: gap.startMinutes, end: gap.endMinutes }));
  for (let i = segments.length - 1; i >= 0 && remaining > 0; i -= 1) {
    const removable = Math.max(0, segments[i].end - segments[i].start - 5);
    const taken = Math.min(removable, remaining);
    segments[i].end -= taken;
    remaining -= taken;
  }
  return {
    reserve: reserve - remaining,
    segments: segments.filter((segment) => segment.end - segment.start >= 5),
  };
}

export function orderTasksForStyle(tasks, style) {
  const copy = [...tasks];
  if (style === "deep") {
    return copy.sort((a, b) => b.average - a.average || a.min - b.min);
  }
  return copy;
}

export function previewDurationForTask(task) {
  return clamp(Math.round((task.min + task.max) / 2 / 5) * 5, task.min, task.max);
}

export function chooseSegmentIndex(segments, duration, style, gapUse) {
  const candidates = segments
    .map((segment, index) => ({
      ...segment,
      index,
      length: segment.end - segment.start,
      use: gapUse[segment.gapId] || 0,
    }))
    .filter((segment) => segment.length >= duration);

  if (!candidates.length) return -1;

  if (style === "compact") {
    candidates.sort((a, b) => a.start - b.start || a.length - b.length);
    return candidates[0].index;
  }
  if (style === "deep") {
    candidates.sort((a, b) => b.length - a.length || a.start - b.start);
    return candidates[0].index;
  }
  if (style === "spread") {
    candidates.sort((a, b) => a.use - b.use || b.length - a.length || a.start - b.start);
    return candidates[0].index;
  }

  candidates.sort((a, b) => {
    const scoreA = a.length - a.use * 12 - a.start * 0.01;
    const scoreB = b.length - b.use * 12 - b.start * 0.01;
    return scoreB - scoreA;
  });
  return candidates[0].index;
}

export function placeWithinSegment(segment, duration, style, orderIndex) {
  const slack = Math.max(0, segment.end - segment.start - duration);
  if (style === "spread") {
    return segment.start + Math.floor(slack / 2);
  }
  if (style === "balanced") {
    return segment.start + Math.min(slack, orderIndex * 5);
  }
  return segment.start;
}

export function pushLeftovers(segments, chosen, start, end) {
  if (start - chosen.start >= 5) segments.push({ gapId: chosen.gapId, start: chosen.start, end: start });
  if (chosen.end - end >= 5) segments.push({ gapId: chosen.gapId, start: end, end: chosen.end });
  segments.sort((a, b) => a.start - b.start);
}

/**
 * @returns {null | { reserve, style, scheduled, unscheduled, filled }}
 */
export function buildPreviewPlan({ gaps, tasks, generationStyle, keepBuffer }) {
  if (!gaps.length) return null;

  const style = generationStyle;
  const { reserve, segments: initialSegments } = applyReserve(gaps, keepBuffer);
  const segments = initialSegments.map((s) => ({ ...s }));
  const orderedTasks = orderTasksForStyle(tasks, style);
  const scheduled = [];
  const unscheduled = [];
  const gapUse = {};

  orderedTasks.forEach((task, index) => {
    const duration = previewDurationForTask(task);
    const segmentIndex = chooseSegmentIndex(segments, duration, style, gapUse);
    if (segmentIndex === -1) {
      unscheduled.push({ taskName: task.name, duration });
      return;
    }
    const chosen = segments.splice(segmentIndex, 1)[0];
    const start = placeWithinSegment(chosen, duration, style, index);
    const end = start + duration;
    scheduled.push({
      taskName: task.name,
      duration,
      startMinutes: start,
      endMinutes: end,
      start: toTime(start),
      end: toTime(end),
    });
    gapUse[chosen.gapId] = (gapUse[chosen.gapId] || 0) + 1;
    pushLeftovers(segments, chosen, start, end);
  });

  return {
    reserve,
    style,
    scheduled: scheduled.sort((a, b) => a.startMinutes - b.startMinutes),
    unscheduled,
    filled: scheduled.reduce((sum, item) => sum + item.duration, 0),
  };
}
