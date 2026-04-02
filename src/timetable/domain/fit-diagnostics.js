import { totalGapMinutes, totalTaskMin, totalTaskMax, largestGapMinutes } from "./aggregates.js";

/**
 * Feasibility summary for gaps + tasks (pure).
 */
export function computeFitDiagnostics({ gaps, tasks, keepBuffer }) {
  const free = totalGapMinutes(gaps);
  const reserve = keepBuffer ? Math.min(45, Math.max(10, Math.round(free * 0.12))) : 0;
  const usable = Math.max(0, free - reserve);
  const largest = largestGapMinutes(gaps);
  const impossible = tasks.filter((task) => task.min > largest);
  return {
    free,
    reserve,
    usable,
    largestGap: largest,
    minNeed: totalTaskMin(tasks),
    maxNeed: totalTaskMax(tasks),
    impossible,
  };
}

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Feasibility across a week: same tasks, gaps vary per weekday index (0=Mon).
 */
export function computeWeekFitDiagnostics({ gapsByDay, tasks, keepBuffer }) {
  const dayDiags = gapsByDay.map((gaps) => computeFitDiagnostics({ gaps, tasks, keepBuffer }));
  const minNeed = dayDiags.length ? dayDiags[0].minNeed : 0;
  const maxNeed = dayDiags.length ? dayDiags[0].maxNeed : 0;
  const usableMin = dayDiags.length ? Math.min(...dayDiags.map((d) => d.usable)) : 0;
  const largestGap = dayDiags.length ? Math.max(...dayDiags.map((d) => d.largestGap)) : 0;

  const impossible = [];
  const seen = new Set();
  dayDiags.forEach((d, dayIdx) => {
    d.impossible.forEach((t) => {
      const key = `${t.id ?? t.name}-${dayIdx}`;
      if (seen.has(key)) return;
      seen.add(key);
      impossible.push({
        ...t,
        dayLabel: DAY_SHORT[dayIdx],
        dayIndex: dayIdx,
        largestGapThatDay: d.largestGap,
      });
    });
  });

  const freeTotal = dayDiags.reduce((s, d) => s + d.free, 0);

  return {
    dayDiags,
    free: freeTotal,
    reserve: dayDiags.reduce((s, d) => s + d.reserve, 0),
    usable: usableMin,
    largestGap,
    minNeed,
    maxNeed,
    impossible,
  };
}
