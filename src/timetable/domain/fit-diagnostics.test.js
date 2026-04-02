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
});

describe("computeFitDiagnostics", () => {
  it("computes usable after buffer", () => {
    const gaps = [{ startMinutes: 0, endMinutes: 120, duration: 120, id: 1 }];
    const tasks = [];
    const d = computeFitDiagnostics({ gaps, tasks, keepBuffer: true });
    expect(d.usable).toBeLessThan(d.free);
  });
});
