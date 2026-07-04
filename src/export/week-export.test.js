import { describe, expect, it } from "vitest";
import {
  escapeICSValue,
  foldICSLines,
  localDateTimeICSTotal,
  buildICSWeekCalendar,
  formatWeekPlanPlainText,
} from "./week-export.js";

describe("escapeICSValue", () => {
  it("escapes commas, semicolons, backslashes, newlines", () => {
    expect(escapeICSValue("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });
});

describe("foldICSLines", () => {
  it("wraps long lines", () => {
    const long = "X".repeat(80);
    const folded = foldICSLines(long);
    expect(folded.length).toBeGreaterThan(long.length);
    expect(folded.includes("\r\n ")).toBe(true);
  });
});

describe("localDateTimeICSTotal", () => {
  it("formats local floating datetime", () => {
    expect(localDateTimeICSTotal("2026-04-02", 9 * 60 + 30)).toBe("20260402T093000");
  });
});

describe("buildICSWeekCalendar", () => {
  it("includes VEVENT for scheduled items when plan week is set", () => {
    const previewsByDay = new Map([
      [
        0,
        {
          scheduled: [
            {
              taskId: 1,
              taskName: "Read",
              duration: 30,
              startMinutes: 9 * 60,
              endMinutes: 9 * 60 + 30,
              start: "09:00",
              end: "09:30",
              deadline: null,
            },
          ],
          unscheduled: [],
        },
      ],
    ]);
    const ics = buildICSWeekCalendar({
      planMondayISO: "2026-03-30",
      orderedDayIndices: [0],
      previewsByDay,
      calendarName: "Test",
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:Read");
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:-PT15M");
    expect(ics).toContain("DTSTART:20260330T090000");
    expect(ics).toContain("DTEND:20260330T093000");
    expect(ics).toContain("END:VCALENDAR");
  });
});

describe("formatWeekPlanPlainText", () => {
  it("lists days and tasks", () => {
    const previewsByDay = new Map([
      [0, { scheduled: [{ taskName: "X", start: "10:00", end: "10:30", duration: 30 }], unscheduled: [] }],
    ]);
    const text = formatWeekPlanPlainText({
      planMondayISO: "2026-03-30",
      orderedDayIndices: [0],
      previewsByDay,
      profileName: "P",
    });
    expect(text).toContain("P — week preview");
    expect(text).toContain("10:00–10:30");
    expect(text).toContain("X");
  });
});
