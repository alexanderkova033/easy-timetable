import { describe, it, expect } from "vitest";
import { parseTimeToMinutes, toTime } from "./time.js";

describe("parseTimeToMinutes", () => {
  it("parses HH:MM", () => {
    expect(parseTimeToMinutes("09:00")).toBe(9 * 60);
    expect(parseTimeToMinutes("9:05")).toBe(9 * 60 + 5);
  });

  it("returns null for invalid input", () => {
    expect(parseTimeToMinutes("")).toBeNull();
    expect(parseTimeToMinutes("25:00")).toBeNull();
    expect(parseTimeToMinutes("12:61")).toBeNull();
  });

  it("rounds to schedule step when requested", () => {
    expect(parseTimeToMinutes("09:03", { roundToStep: true })).toBe(9 * 60 + 5);
    expect(toTime(parseTimeToMinutes("09:03", { roundToStep: true }))).toBe("09:05");
  });
});
