import { describe, it, expect } from "vitest";
import {
  buildPreviewPlan,
  applyReserve,
  previewDurationForTask,
} from "./preview-plan.js";
import { createTaskId } from "./constants.js";

function gap(startH, endH) {
  const startMinutes = startH * 60;
  const endMinutes = endH * 60;
  return {
    id: createTaskId(),
    startMinutes,
    endMinutes,
    start: `${String(startH).padStart(2, "0")}:00`,
    end: `${String(endH).padStart(2, "0")}:00`,
    duration: endMinutes - startMinutes,
  };
}

describe("preview-plan", () => {
  it("applyReserve shrinks trailing slice of gaps", () => {
    const gaps = [gap(9, 10), gap(10, 12)];
    const { reserve, segments } = applyReserve(gaps, true);
    expect(reserve).toBeGreaterThan(0);
    expect(segments.length).toBeGreaterThan(0);
    const totalSeg = segments.reduce((s, seg) => s + (seg.end - seg.start), 0);
    const totalGap = gaps.reduce((s, g) => s + g.duration, 0);
    expect(totalSeg).toBeLessThanOrEqual(totalGap);
  });

  it("previewDurationForTask picks midpoint rounded to 5", () => {
    expect(previewDurationForTask({ min: 20, max: 40 })).toBe(30);
  });

  it("schedules tasks into gaps", () => {
    const gaps = [gap(9, 12)];
    const tasks = [
      { id: 1, name: "A", min: 30, max: 30, average: 30 },
    ];
    const plan = buildPreviewPlan({
      gaps,
      tasks,
      generationStyle: "balanced",
      keepBuffer: false,
    });
    expect(plan).not.toBeNull();
    expect(plan.scheduled.length).toBe(1);
    expect(plan.unscheduled.length).toBe(0);
    expect(plan.scheduled[0].taskName).toBe("A");
    expect(plan.scheduled[0].taskId).toBe(1);
  });

  it("leaves overflow tasks unscheduled", () => {
    const gaps = [gap(9, 9.5)];
    const tasks = [
      { id: 1, name: "Big", min: 120, max: 120, average: 120 },
    ];
    const plan = buildPreviewPlan({
      gaps,
      tasks,
      generationStyle: "balanced",
      keepBuffer: false,
    });
    expect(plan.unscheduled.length).toBe(1);
    expect(plan.unscheduled[0].taskId).toBe(1);
    expect(plan.scheduled.length).toBe(0);
  });
});
