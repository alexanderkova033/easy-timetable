import { describe, expect, it } from "vitest";
import { orderedWeekdayIndices, computeWeekPreviews } from "./week-plan.js";

describe("orderedWeekdayIndices", () => {
  it("uses Mon-first order by default", () => {
    expect(orderedWeekdayIndices(1)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("puts Sunday first when week starts Sunday", () => {
    expect(orderedWeekdayIndices(0)).toEqual([6, 0, 1, 2, 3, 4, 5]);
  });
});

describe("computeWeekPreviews", () => {
  const gaps = [
    {
      id: 1,
      startMinutes: 9 * 60,
      endMinutes: 12 * 60,
      start: "09:00",
      end: "12:00",
      duration: 180,
    },
  ];
  const tasks = [
    { id: 10, name: "Alpha", min: 20, max: 40, average: 30 },
    { id: 11, name: "Beta", min: 20, max: 40, average: 30 },
  ];

  it("returns previews for days with gaps", () => {
    const gapsByDay = [[gaps[0]], [], [], [], [], [], []];
    const { orderedDayIndices, previewsByDay } = computeWeekPreviews({
      gapsByDay,
      tasks,
      generationStyle: "balanced",
      keepBuffer: true,
      planWeekMondayISO: "2026-03-30",
      weekStartsOn: 1,
    });
    expect(orderedDayIndices[0]).toBe(0);
    const mon = previewsByDay.get(0);
    expect(mon).toBeTruthy();
    expect(mon.scheduled.length).toBeGreaterThan(0);
  });
});
