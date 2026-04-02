import { createTaskId } from "./constants.js";
import { toTime } from "./time.js";

function makeGap(startMinutes, endMinutes) {
  return {
    id: createTaskId(),
    startMinutes,
    endMinutes,
    start: toTime(startMinutes),
    end: toTime(endMinutes),
    duration: endMinutes - startMinutes,
  };
}

/** ~50 minute class blocks with passing time (school-style). */
export function templateSchoolBlocks() {
  return [
    makeGap(8 * 60, 8 * 60 + 50),
    makeGap(8 * 60 + 55, 9 * 60 + 45),
    makeGap(9 * 60 + 50, 10 * 60 + 40),
    makeGap(11 * 60, 11 * 60 + 50),
    makeGap(12 * 60 + 30, 13 * 60 + 20),
    makeGap(13 * 60 + 25, 14 * 60 + 15),
    makeGap(14 * 60 + 20, 15 * 60 + 10),
  ];
}

/** Standard workday with lunch. */
export function templateNineToFive() {
  return [
    makeGap(9 * 60, 12 * 60),
    makeGap(13 * 60, 17 * 60),
  ];
}

/** Short morning focus blocks. */
export function templateMorningFocus() {
  return [
    makeGap(6 * 60 + 30, 7 * 60),
    makeGap(7 * 60 + 15, 7 * 60 + 45),
    makeGap(8 * 60, 9 * 60),
    makeGap(9 * 60 + 15, 9 * 60 + 45),
  ];
}

export const SCHEDULE_TEMPLATES = [
  { id: "school", label: "School blocks", apply: templateSchoolBlocks },
  { id: "work", label: "9–5 + lunch", apply: templateNineToFive },
  { id: "morning", label: "Morning focus", apply: templateMorningFocus },
];
