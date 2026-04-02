import { describe, it, expect } from "vitest";
import { totalGapMinutes, totalTaskMin, totalTaskMax, largestGapMinutes } from "./aggregates.js";

describe("aggregates", () => {
  const gaps = [
    { duration: 60 },
    { duration: 30 },
  ];
  const tasks = [
    { min: 20, max: 40 },
    { min: 15, max: 25 },
  ];

  it("totals gap minutes", () => {
    expect(totalGapMinutes(gaps)).toBe(90);
    expect(totalGapMinutes([])).toBe(0);
  });

  it("totals task min/max", () => {
    expect(totalTaskMin(tasks)).toBe(35);
    expect(totalTaskMax(tasks)).toBe(65);
  });

  it("finds largest gap", () => {
    expect(largestGapMinutes(gaps)).toBe(60);
    expect(largestGapMinutes([])).toBe(0);
  });
});
