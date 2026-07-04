import { LEGACY_STORAGE_KEY, STORAGE_KEY } from "./shared/constants.js";
import { normalizePlanWeekMondayISO, mondayISOFOrCurrentWeek } from "./week-plan/plan-week.js";
import { normalizeTaskDeadline, normalizeRepeatWeekdays } from "./tasks/task-deadlines.js";

const APP_VERSION = 3;

export const BACKGROUND_OPTIONS = [
  { id: "studio", label: "Studio editorial (light)" },
  { id: "verdant", label: "Verdant grove" },
  { id: "aurora", label: "Aurora mesh" },
  { id: "midnight", label: "Midnight stars" },
  { id: "paper", label: "Notebook (light)" },
  { id: "ocean", label: "Ocean waves" },
  { id: "dots", label: "Neon dots" },
  { id: "minimal", label: "Carbon weave" },
];

export const FONT_SCALES = [
  { id: "sm", label: "Smaller text" },
  { id: "md", label: "Default" },
  { id: "lg", label: "Larger text" },
];

function createProfileId() {
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyGapsByDay() {
  return Array.from({ length: 7 }, () => []);
}

function defaultProfile() {
  return {
    id: createProfileId(),
    name: "Default",
    gapsByDay: emptyGapsByDay(),
    tasks: [],
    activeStep: 1,
    generationStyle: "balanced",
    keepBuffer: true,
  };
}

/** @param {any} raw */
export function migrateToAppState(raw) {
  if (!raw || typeof raw !== "object") return null;

  if (raw.version === APP_VERSION) {
    return sanitizeAppState(raw);
  }

  const gaps = Array.isArray(raw.gaps) ? raw.gaps : [];
  const gapsByDay = emptyGapsByDay().map(() =>
    gaps.map((g) => ({ ...g, id: g.id })),
  );
  const prof = {
    id: createProfileId(),
    name: "Default",
    gapsByDay,
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    activeStep: Number(raw.activeStep) || 1,
    generationStyle: raw.generationStyle || "balanced",
    keepBuffer: raw.keepBuffer !== false,
  };
  return sanitizeAppState({
    version: APP_VERSION,
    weekStartsOn: 1,
    backgroundId: "studio",
    fontScale: "md",
    reduceMotion: false,
    accentMotion: true,
    calendarCompact: false,
    activeProfileId: prof.id,
    profiles: [prof],
  });
}

function sanitizeProfile(p) {
  const gapsByDay = emptyGapsByDay();
  if (Array.isArray(p?.gapsByDay) && p.gapsByDay.length === 7) {
    p.gapsByDay.forEach((day, i) => {
      gapsByDay[i] = Array.isArray(day) ? day : [];
    });
  } else if (Array.isArray(p?.gaps)) {
    const g = p.gaps;
    for (let i = 0; i < 7; i++) gapsByDay[i] = g.map((x) => ({ ...x }));
  }
  return {
    id: p?.id ?? createProfileId(),
    name: typeof p?.name === "string" && p.name.trim() ? p.name.trim() : "Untitled",
    gapsByDay,
    tasks: Array.isArray(p?.tasks)
      ? p.tasks.map(t => {
          const d = normalizeTaskDeadline(t?.deadline);
          const next = { ...t };
          if (d) next.deadline = d;
          else delete next.deadline;
          const rw = normalizeRepeatWeekdays(t?.repeatWeekdays);
          if (rw?.length) next.repeatWeekdays = rw;
          else delete next.repeatWeekdays;
          return next;
        })
      : [],
    activeStep: Number(p?.activeStep) || 1,
    generationStyle: p?.generationStyle || "balanced",
    keepBuffer: p?.keepBuffer !== false,
  };
}

function sanitizeAppState(s) {
  const profiles = (Array.isArray(s.profiles) ? s.profiles : []).map(sanitizeProfile);
  if (!profiles.length) profiles.push(defaultProfile());
  let activeProfileId = s.activeProfileId;
  if (!profiles.some((p) => p.id === activeProfileId)) activeProfileId = profiles[0].id;
  return {
    version: APP_VERSION,
    weekStartsOn: s.weekStartsOn === 0 ? 0 : 1,
    planWeekMonday: normalizePlanWeekMondayISO(s.planWeekMonday) ?? mondayISOFOrCurrentWeek(),
    backgroundId: BACKGROUND_OPTIONS.some((b) => b.id === s.backgroundId) ? s.backgroundId : "studio",
    fontScale: FONT_SCALES.some((f) => f.id === s.fontScale) ? s.fontScale : "md",
    reduceMotion: !!s.reduceMotion,
    accentMotion: s.accentMotion !== false,
    calendarCompact: !!s.calendarCompact,
    activeProfileId,
    profiles,
  };
}

export function loadAppState() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw && LEGACY_STORAGE_KEY) {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (raw) {
        localStorage.setItem(STORAGE_KEY, raw);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    }
    if (!raw) {
      return sanitizeAppState({
        version: APP_VERSION,
        weekStartsOn: 1,
        backgroundId: "studio",
        fontScale: "md",
        reduceMotion: false,
        accentMotion: true,
        activeProfileId: "",
        profiles: [defaultProfile()],
      });
    }
    const parsed = JSON.parse(raw);
    const migrated = migrateToAppState(parsed);
    return migrated || sanitizeAppState({ profiles: [defaultProfile()], activeProfileId: "" });
  } catch (e) {
    console.error("loadAppState", e);
    return sanitizeAppState({ profiles: [defaultProfile()], activeProfileId: "" });
  }
}

export function persistAppState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getActiveProfile(app) {
  return app.profiles.find((p) => p.id === app.activeProfileId) || app.profiles[0];
}

export function addProfile(app, name) {
  const base = getActiveProfile(app);
  const prof = sanitizeProfile({
    ...base,
    id: createProfileId(),
    name: name || `Schedule ${app.profiles.length + 1}`,
    gapsByDay: base.gapsByDay.map((day) => day.map((g) => ({ ...g, id: g.id }))),
    tasks: base.tasks.map((t) => ({ ...t, id: t.id })),
  });
  app.profiles.push(prof);
  app.activeProfileId = prof.id;
}

export function removeProfile(app, profileId) {
  if (app.profiles.length <= 1) return false;
  app.profiles = app.profiles.filter((p) => p.id !== profileId);
  if (app.activeProfileId === profileId) app.activeProfileId = app.profiles[0].id;
  return true;
}

export { createProfileId, defaultProfile, APP_VERSION };
