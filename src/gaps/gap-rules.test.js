import { describe, it, expect } from "vitest";
import { normalizeGaps } from "./gap-rules.js";
import { createTaskId } from "../shared/constants.js";

describe("normalizeGaps", () => {
  it("merges overlapping intervals", () => {
    const id = createTaskId();
    const merged = normalizeGaps([
      { id, startMinutes: 9 * 60, endMinutes: 10 * 60 },
      { id: createTaskId(), startMinutes: 9 * 60 + 30, endMinutes: 11 * 60 },
    ]);
    expect(merged.length).toBe(1);
    expect(merged[0].startMinutes).toBe(9 * 60);
    expect(merged[0].endMinutes).toBe(11 * 60);
    expect(merged[0].duration).toBe(2 * 60);
  });

  it("sorts non-overlapping gaps", () => {
    const merged = normalizeGaps([
      { id: createTaskId(), startMinutes: 14 * 60, endMinutes: 15 * 60 },
      { id: createTaskId(), startMinutes: 9 * 60, endMinutes: 10 * 60 },
    ]);
    expect(merged.length).toBe(2);
    expect(merged[0].startMinutes).toBe(9 * 60);
    expect(merged[1].startMinutes).toBe(14 * 60);
  });
});
