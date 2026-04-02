import { describe, it, expect } from "vitest";
import {
  normalizeTaskDeadline,
  taskAppliesToPlanDay,
  filterTasksForPlanDay,
  normalizeRepeatWeekdays,
  taskAppliesToWeekday,
  filterTasksForPlanDayAndWeekday,
} from "./task-deadlines.js";

describe("task-deadlines", () => {
  it("normalizes valid deadline strings", () => {
    expect(normalizeTaskDeadline("2026-04-15")).toBe("2026-04-15");
    expect(normalizeTaskDeadline("")).toBeNull();
    expect(normalizeTaskDeadline(null)).toBeNull();
    expect(normalizeTaskDeadline("not-a-date")).toBeNull();
    expect(normalizeTaskDeadline("2026-13-40")).toBeNull();
  });

  it("includes tasks with no deadline on any day", () => {
    const task = { name: "X", min: 10, max: 10, deadline: null };
    expect(taskAppliesToPlanDay(task, "2026-04-01")).toBe(true);
  });

  it("excludes tasks from days after their deadline", () => {
    const task = { name: "X", min: 10, max: 10, deadline: "2026-04-03" };
    expect(taskAppliesToPlanDay(task, "2026-04-03")).toBe(true);
    expect(taskAppliesToPlanDay(task, "2026-04-02")).toBe(true);
    expect(taskAppliesToPlanDay(task, "2026-04-04")).toBe(false);
  });

  it("filterTasksForPlanDay keeps order", () => {
    const tasks = [
      { id: 1, deadline: "2026-04-02" },
      { id: 2, deadline: null },
      { id: 3, deadline: "2026-04-05" },
    ];
    const out = filterTasksForPlanDay(tasks, "2026-04-03");
    expect(out.map(t => t.id)).toEqual([2, 3]);
  });

  it("normalizeRepeatWeekdays coerces and drops full week", () => {
    expect(normalizeRepeatWeekdays(null)).toBeNull();
    expect(normalizeRepeatWeekdays([0, 2, 2, 0])).toEqual([0, 2]);
    expect(normalizeRepeatWeekdays([0, 1, 2, 3, 4, 5, 6])).toBeNull();
  });

  it("taskAppliesToWeekday respects repeatWeekdays", () => {
    const t = { repeatWeekdays: [1, 3] };
    expect(taskAppliesToWeekday(t, 1)).toBe(true);
    expect(taskAppliesToWeekday(t, 0)).toBe(false);
    expect(taskAppliesToWeekday({ repeatWeekdays: [] }, 0)).toBe(true);
  });

  it("filterTasksForPlanDayAndWeekday combines deadline and weekday", () => {
    const tasks = [
      { id: 1, deadline: "2026-04-10", repeatWeekdays: [0] },
      { id: 2, deadline: null, repeatWeekdays: [2] },
    ];
    const mon = filterTasksForPlanDayAndWeekday(tasks, "2026-04-06", 0);
    expect(mon.map(t => t.id)).toEqual([1]);
    const wed = filterTasksForPlanDayAndWeekday(tasks, "2026-04-08", 2);
    expect(wed.map(t => t.id)).toEqual([2]);
  });
});
