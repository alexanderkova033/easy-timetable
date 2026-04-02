/** Pure rollups over gaps and tasks. */

export function totalGapMinutes(gaps) {
  return gaps.reduce((sum, gap) => sum + gap.duration, 0);
}

export function totalTaskMin(tasks) {
  return tasks.reduce((sum, task) => sum + task.min, 0);
}

export function totalTaskMax(tasks) {
  return tasks.reduce((sum, task) => sum + task.max, 0);
}

export function largestGapMinutes(gaps) {
  return gaps.reduce((max, gap) => Math.max(max, gap.duration), 0);
}
