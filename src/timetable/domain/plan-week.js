/** Local-calendar helpers for mapping the Mon–Sun grid to real dates (deadlines, headers). */

export function toISODateOnlyLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODateLocal(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const day = Number(m[3]);
  const dt = new Date(y, mo, day);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== day) return null;
  return dt;
}

export function mondayOfWeekContainingDate(d) {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = copy.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

export function mondayISOFOrCurrentWeek() {
  return toISODateOnlyLocal(mondayOfWeekContainingDate(new Date()));
}

/** Coerce any valid calendar day to the Monday that starts that ISO week (local). */
export function normalizePlanWeekMondayISO(v) {
  const d = parseISODateLocal(v);
  if (!d) return null;
  return toISODateOnlyLocal(mondayOfWeekContainingDate(d));
}

export function addCalendarDaysToISO(iso, days) {
  const d = parseISODateLocal(iso);
  if (!d) return null;
  d.setDate(d.getDate() + days);
  return toISODateOnlyLocal(d);
}

/** @param {string} planWeekMondayISO - Monday of the week being planned
 * @param {number} weekdayIndex - 0 = Monday … 6 = Sunday (matches gapsByDay) */
export function planDayISOForWeekdayIndex(planWeekMondayISO, weekdayIndex) {
  return addCalendarDaysToISO(planWeekMondayISO, weekdayIndex);
}

export function formatShortPlanDay(iso) {
  const d = parseISODateLocal(iso);
  if (!d) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(d);
}
