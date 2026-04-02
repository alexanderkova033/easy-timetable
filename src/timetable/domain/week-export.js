import { planDayISOForWeekdayIndex } from "./plan-week.js";

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** ICS TEXT escaping */
export function escapeICSValue(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** Fold long lines per RFC 5545 (CRLF + space continuation). */
export function foldICSLines(body) {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  for (const line of lines) {
    if (line.length <= 75) {
      out.push(line);
      continue;
    }
    let rest = line;
    out.push(rest.slice(0, 75));
    rest = rest.slice(75);
    while (rest.length) {
      out.push(` ${rest.slice(0, 74)}`);
      rest = rest.slice(74);
    }
  }
  return out.join("\r\n");
}

/** @param {string} isoDate YYYY-MM-DD
 * @param {number} minutes 0..1439
 */
export function localDateTimeICSTotal(isoDate, minutes) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate).trim());
  if (!m) return null;
  const safe = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = pad2(Math.floor(safe / 60));
  const mm = pad2(safe % 60);
  return `${m[1]}${m[2]}${m[3]}T${hh}${mm}00`;
}

export function icsTimestampUTC(d = new Date()) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * @param {object} params
 * @param {string | null} params.planMondayISO
 * @param {number[]} params.orderedDayIndices
 * @param {Map<number, import('./preview-plan.js')>} params.previewsByDay  values may be null
 * @param {string} [params.calendarName]
 * @param {number} [params.alarmMinutesBefore] display alarm N minutes before start (0 = none)
 */
export function buildICSWeekCalendar(params) {
  const {
    planMondayISO,
    orderedDayIndices,
    previewsByDay,
    calendarName = "Easy Timetable week",
    alarmMinutesBefore = 15,
  } = params;
  const dtStamp = icsTimestampUTC();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Easy Timetable//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:" + escapeICSValue(calendarName),
  ];

  let seq = 0;
  for (const dayIdx of orderedDayIndices) {
    const preview = previewsByDay.get(dayIdx);
    const dateISO = planMondayISO ? planDayISOForWeekdayIndex(planMondayISO, dayIdx) : null;
    if (!preview?.scheduled?.length || !dateISO) continue;

    for (const item of preview.scheduled) {
      seq += 1;
      const uid = `easytt-${dateISO}-${item.taskId}-${seq}@easy-timetable.local`;
      const start = localDateTimeICSTotal(dateISO, item.startMinutes);
      const end = localDateTimeICSTotal(dateISO, item.endMinutes);
      if (!start || !end) continue;
      const summary = escapeICSValue(item.taskName);
      const desc = escapeICSValue(
        `${DAY_SHORT[dayIdx]} ${dateISO} · ${item.start}–${item.end} (${item.duration}m)`,
      );
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${uid}`);
      lines.push(`DTSTAMP:${dtStamp}`);
      lines.push(`DTSTART:${start}`);
      lines.push(`DTEND:${end}`);
      lines.push(`SUMMARY:${summary}`);
      lines.push(`DESCRIPTION:${desc}`);
      if (alarmMinutesBefore > 0) {
        const am = Math.min(120, Math.max(1, Math.round(alarmMinutesBefore)));
        lines.push("BEGIN:VALARM");
        lines.push(`TRIGGER:-PT${am}M`);
        lines.push("ACTION:DISPLAY");
        lines.push(`DESCRIPTION:${escapeICSValue(`${item.taskName} · starts in ${am}m`)}`);
        lines.push("END:VALARM");
      }
      lines.push("END:VEVENT");
    }
  }

  lines.push("END:VCALENDAR");
  return foldICSLines(lines.join("\r\n")) + "\r\n";
}

const DAY_SHORT_EXPORT = DAY_SHORT;

/**
 * @param {object} params
 * @param {string | null} params.planMondayISO
 * @param {number[]} params.orderedDayIndices
 * @param {Map<number, ReturnType<import('./preview-plan.js').buildPreviewPlan>>} params.previewsByDay
 * @param {string} [params.profileName]
 */
export function formatWeekPlanPlainText(params) {
  const { planMondayISO, orderedDayIndices, previewsByDay, profileName = "Timetable" } = params;
  const parts = [];
  parts.push(`${profileName} — week preview`);
  if (planMondayISO) parts.push(`Week of (Mon): ${planMondayISO}`);
  parts.push("");

  for (const dayIdx of orderedDayIndices) {
    const preview = previewsByDay.get(dayIdx);
    const dateISO = planMondayISO ? planDayISOForWeekdayIndex(planMondayISO, dayIdx) : null;
    const label = dateISO
      ? `${DAY_SHORT_EXPORT[dayIdx]} ${dateISO}`
      : DAY_SHORT_EXPORT[dayIdx];
    parts.push(`— ${label} —`);

    if (!preview?.scheduled?.length) {
      parts.push("(no tasks placed)");
    } else {
      for (const t of preview.scheduled) {
        parts.push(`  • ${t.start}–${t.end}  ${t.taskName}  (${t.duration}m)`);
      }
    }
    if (preview?.unscheduled?.length) {
      parts.push("  Unscheduled:");
      for (const u of preview.unscheduled) {
        parts.push(`    · ${u.taskName} (${u.duration}m)`);
      }
    }
    parts.push("");
  }

  return parts.join("\n").trimEnd() + "\n";
}
