import { describe, it, expect } from "vitest";
import { computeFitDiagnostics, computeWeekFitDiagnostics } from "./fit-diagnostics.js";

describe("computeWeekFitDiagnostics", () => {
  it("flags task too wide for one weekday only", () => {
    const gapsByDay = [
      [{ startMinutes: 9 * 60, endMinutes: 10 * 60, duration: 60, id: 1 }],
      [],
      [],
      [],
      [],
      [],
      [],
    ].map((gaps) =>
      gaps.map((g) => ({
        ...g,
        start: "09:00",
        end: "10:00",
      })),
    );
    const tasks = [{ id: 1, name: "Long", min: 90, max: 90 }];
    const w = computeWeekFitDiagnostics({ gapsByDay, tasks, keepBuffer: false });
    expect(w.impossible.length).toBeGreaterThan(0);
    expect(w.impossible[0].dayLabel).toBe("Mon");
  });

  it("picks tightest day among days that have gaps", () => {
    const gapsByDay = [
      [{ startMinutes: 9 * 60, endMinutes: 12 * 60, duration: 180, id: 1, start: "09:00", end: "12:00" }],
      [{ startMinutes: 9 * 60, endMinutes: 10 * 60, duration: 60, id: 2, start: "09:00", end: "10:00" }],
      [],
      [],
      [],
      [],
      [],
    ];
    const tasks = [{ id: 1, name: "T", min: 5, max: 10 }];
    const w = computeWeekFitDiagnostics({ gapsByDay, tasks, keepBuffer: false });
    expect(w.tightestDayLabel).toBe("Tue");
    expect(w.tightestDayIndex).toBe(1);
    expect(w.tightestUsable).toBe(60);
  });
});

describe("computeFitDiagnostics", () => {
  it("computes usable after buffer", () => {
    const gaps = [{ startMinutes: 0, endMinutes: 120, duration: 120, id: 1 }];
    const tasks = [];
    const d = computeFitDiagnostics({ gaps, tasks, keepBuffer: true });
    expect(d.usable).toBeLessThan(d.free);
  });
});
