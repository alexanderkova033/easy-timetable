import { parseISODateLocal } from "../week-plan/plan-week.js";

export function normalizeTaskDeadline(v) {
  if (v == null || v === "") return null;
  const s = String(v).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = parseISODateLocal(s);
  if (!d) return null;
  return s;
}

/**
 * Whether a task should appear in the preview for a column whose calendar date is planDayISO (YYYY-MM-DD).
 * No deadline → always. With deadline → only on days on or before the due date (inclusive).
 */
export function taskAppliesToPlanDay(task, planDayISO) {
  if (!planDayISO) return true;
  const dl = normalizeTaskDeadline(task?.deadline);
  if (!dl) return true;
  return dl >= planDayISO;
}

export function filterTasksForPlanDay(tasks, planDayISO) {
  return tasks.filter(t => taskAppliesToPlanDay(t, planDayISO));
}

/** @param {unknown} raw */
export function normalizeRepeatWeekdays(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const nums = raw
    .map(n => Number(n))
    .filter(n => Number.isInteger(n) && n >= 0 && n <= 6);
  const uniq = [...new Set(nums)].sort((a, b) => a - b);
  if (uniq.length === 0 || uniq.length === 7) return null;
  return uniq;
}

/**
 * When null/empty repeat list → task applies every weekday. Otherwise only listed indices (Mon = 0 … Sun = 6).
 */
export function taskAppliesToWeekday(task, weekdayIndex) {
  const rw = normalizeRepeatWeekdays(task?.repeatWeekdays);
  if (rw == null) return true;
  return rw.includes(weekdayIndex);
}

export function filterTasksForPlanDayAndWeekday(tasks, planDayISO, weekdayIndex) {
  return tasks.filter(
    t => taskAppliesToPlanDay(t, planDayISO) && taskAppliesToWeekday(t, weekdayIndex),
  );
}
