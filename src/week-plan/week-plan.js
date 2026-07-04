import { buildPreviewPlan } from "./preview-plan.js";
import { filterTasksForPlanDayAndWeekday } from "../tasks/task-deadlines.js";
import { planDayISOForWeekdayIndex, normalizePlanWeekMondayISO } from "./plan-week.js";

/** @param {number} weekStartsOn 0 = Sunday, else Monday */
export function orderedWeekdayIndices(weekStartsOn) {
  return weekStartsOn === 0 ? [6, 0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6];
}

/**
 * @param {object} opts
 * @param {Array<Array<{ id: number, startMinutes: number, endMinutes: number, start: string, end: string, duration: number }>>} opts.gapsByDay
 * @param {Array<object>} opts.tasks
 * @param {string} opts.generationStyle
 * @param {boolean} opts.keepBuffer
 * @param {string | null | undefined} opts.planWeekMondayISO
 * @param {number} opts.weekStartsOn
 */
export function computeWeekPreviews(opts) {
  const { gapsByDay, tasks, generationStyle, keepBuffer, planWeekMondayISO, weekStartsOn } = opts;
  const order = orderedWeekdayIndices(weekStartsOn);
  const planMonday = normalizePlanWeekMondayISO(planWeekMondayISO) ?? null;
  const previewsByDay = new Map();
  for (const dayIdx of order) {
    const gaps = Array.isArray(gapsByDay[dayIdx]) ? gapsByDay[dayIdx] : [];
    const planDayISO = planMonday ? planDayISOForWeekdayIndex(planMonday, dayIdx) : null;
    const tasksForDay = filterTasksForPlanDayAndWeekday(tasks, planDayISO, dayIdx);
    const plan = gaps.length
      ? buildPreviewPlan({
          gaps,
          tasks: tasksForDay,
          generationStyle,
          keepBuffer,
        })
      : null;
    previewsByDay.set(dayIdx, plan);
  }
  return { orderedDayIndices: order, planMonday, previewsByDay };
}
