import {
  HOUR_HEIGHT,
  WHEEL_ITEM,
  MINUTE_STEP,
  MINUTE_VALUES,
  createTaskId,
  clamp,
} from "../../domain/constants.js";
import { toTime, formatDuration, parseTimeToMinutes } from "../../domain/time.js";
import { totalGapMinutes, totalTaskMin, totalTaskMax } from "../../domain/aggregates.js";
import { normalizeGaps } from "../../domain/gap-rules.js";
import { normalizeTaskDeadline } from "../../domain/task-deadlines.js";
import {
  planDayISOForWeekdayIndex,
  formatShortPlanDay,
  normalizePlanWeekMondayISO,
  mondayISOFOrCurrentWeek,
} from "../../domain/plan-week.js";
import { computeWeekPreviews, orderedWeekdayIndices } from "../../domain/week-plan.js";
import { buildICSWeekCalendar, formatWeekPlanPlainText } from "../../domain/week-export.js";
import { computeWeekFitDiagnostics } from "../../domain/fit-diagnostics.js";
import {
  loadAppState,
  persistAppState,
  getActiveProfile,
  addProfile,
  removeProfile,
  migrateToAppState,
  BACKGROUND_OPTIONS,
  FONT_SCALES,
} from "../../application/app-state.js";
import { getRoundedNowMinutes } from "../platform/system-clock.js";
import { escapeHtml } from "../platform/dom-escape.js";

const escapeAttr = s =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/\r?\n/g, " ")
    .trim();
import { buildFitIssues } from "../../domain/fit-issues.js";
import { SCHEDULE_TEMPLATES } from "../../domain/schedule-templates.js";
import {
  supportsLinkedJsonFile,
  getLinkedJsonFileHandle,
  clearLinkedJsonFileHandle,
  pickJsonSaveFile,
  writeTextToLinkedJsonFile,
} from "../platform/linked-json-file.js";
import {
  encodeAppStatePayload,
  decodeAppStatePayload,
  SHARE_HASH_PREFIX,
  MAX_SHARE_URL_CHARS,
} from "../platform/share-link.js";
import { normalizeRepeatWeekdays } from "../../domain/task-deadlines.js";

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CALENDAR_COMPACT_HOUR_PX = 40;
let calendarZoom = 1;
const CAL_ZOOM_MIN = 0.7;
const CAL_ZOOM_MAX = 1.35;
const CAL_ZOOM_STEP = 0.15;
const ONBOARDING_STORAGE_KEY = "easy-timetable-onboarding-v1";

export function bootstrapTimetableApp() {
  let app = loadAppState();
  let activeEditDay = 0;
  const undoStack = [];

  const profile = () => getActiveProfile(app);
  const editingGaps = () => profile().gapsByDay[activeEditDay];

  const cloneGaps = gaps => gaps.map(g => ({ ...g }));
  const cloneTasks = tasks => tasks.map(t => ({ ...t }));

  const pushUndo = entry => {
    undoStack.push(entry);
    if (undoStack.length > 40) undoStack.shift();
  };

  const orderedDayIndices = () => orderedWeekdayIndices(app.weekStartsOn);

  const validBackgroundIds = new Set(BACKGROUND_OPTIONS.map(b => b.id));

  const applyChrome = () => {
    if (!validBackgroundIds.has(app.backgroundId)) {
      app.backgroundId = "studio";
      persistAppState(app);
    }
    document.documentElement.dataset.fontScale = app.fontScale;
    document.documentElement.dataset.reduceMotion = app.reduceMotion ? "1" : "0";
    document.documentElement.dataset.accentMotion =
      app.accentMotion && !app.reduceMotion ? "1" : "0";
    document.body.dataset.background = app.backgroundId;
    document.documentElement.dataset.calendarCompact = app.calendarCompact ? "1" : "0";
  };

  const getHourHeight = () =>
    app.calendarCompact ? CALENDAR_COMPACT_HOUR_PX : HOUR_HEIGHT;

  const prefersReducedMotion = () =>
    document.documentElement.dataset.reduceMotion === "1";

  const weekDiagnostics = () =>
    computeWeekFitDiagnostics({
      gapsByDay: profile().gapsByDay,
      tasks: profile().tasks,
      keepBuffer: profile().keepBuffer,
    });

  const els = {
    stepButtons: [...document.querySelectorAll(".step-btn")],
    stepPanels: [...document.querySelectorAll("[data-step-panel]")],
    startDisplay: document.getElementById("startDisplay"),
    endDisplay: document.getElementById("endDisplay"),
    startHourWheel: document.getElementById("startHourWheel"),
    startMinuteWheel: document.getElementById("startMinuteWheel"),
    endHourWheel: document.getElementById("endHourWheel"),
    endMinuteWheel: document.getElementById("endMinuteWheel"),
    gapForm: document.getElementById("gapForm"),
    useNowBtn: document.getElementById("useNowBtn"),
    gapSubmitBtn: document.getElementById("gapSubmitBtn"),
    cancelGapEditBtn: document.getElementById("cancelGapEditBtn"),
    gapMessage: document.getElementById("gapMessage"),
    gapList: document.getElementById("gapList"),
    taskForm: document.getElementById("taskForm"),
    taskName: document.getElementById("taskName"),
    taskMin: document.getElementById("taskMin"),
    taskMax: document.getElementById("taskMax"),
    taskMessage: document.getElementById("taskMessage"),
    taskList: document.getElementById("taskList"),
    taskCountMeta: document.getElementById("taskCountMeta"),
    taskMinMeta: document.getElementById("taskMinMeta"),
    taskMaxMeta: document.getElementById("taskMaxMeta"),
    priorityList: document.getElementById("priorityList"),
    stylePicker: document.getElementById("stylePicker"),
    keepBuffer: document.getElementById("keepBuffer"),
    fitBanner: document.getElementById("fitBanner"),
    fitIssues: document.getElementById("fitIssues"),
    calendarGrid: document.getElementById("calendarGrid"),
    previewSummary: document.getElementById("previewSummary"),
    unscheduledList: document.getElementById("unscheduledList"),
    statFree: document.getElementById("statFree"),
    statTasks: document.getElementById("statTasks"),
    statStatus: document.getElementById("statStatus"),
    profileSelect: document.getElementById("profileSelect"),
    newProfileBtn: document.getElementById("newProfileBtn"),
    deleteProfileBtn: document.getElementById("deleteProfileBtn"),
    exportBtn: document.getElementById("exportBtn"),
    importBtn: document.getElementById("importBtn"),
    importFile: document.getElementById("importFile"),
    undoBtn: document.getElementById("undoBtn"),
    backgroundSelect: document.getElementById("backgroundSelect"),
    weekStartSelect: document.getElementById("weekStartSelect"),
    planWeekMondayInput: document.getElementById("planWeekMondayInput"),
    reduceMotionToggle: document.getElementById("reduceMotionToggle"),
    accentMotionToggle: document.getElementById("accentMotionToggle"),
    fontScaleSelect: document.getElementById("fontScaleSelect"),
    copyDaySource: document.getElementById("copyDaySource"),
    copyDayBtn: document.getElementById("copyDayBtn"),
    templateRow: document.getElementById("templateRow"),
    statHint: document.getElementById("statHint"),
    heroStatStatus: document.getElementById("heroStatStatus"),
    saveStatus: document.getElementById("saveStatus"),
    continueStep12: document.getElementById("continueStep12"),
    continueStep23: document.getElementById("continueStep23"),
    weekStrip: document.getElementById("weekStrip"),
    gapStartInput: document.getElementById("gapStartInput"),
    gapEndInput: document.getElementById("gapEndInput"),
    taskSubmitBtn: document.getElementById("taskSubmitBtn"),
    cancelTaskEditBtn: document.getElementById("cancelTaskEditBtn"),
    taskDeadline: document.getElementById("taskDeadline"),
    taskDeadlineClear: document.getElementById("taskDeadlineClear"),
    taskRangeReadout: document.getElementById("taskRangeReadout"),
    calendarShell: document.getElementById("calendarShell"),
    calendarScrollHint: document.getElementById("calendarScrollHint"),
    calendarCompactToggle: document.getElementById("calendarCompactToggle"),
    calendarZoomIn: document.getElementById("calendarZoomIn"),
    calendarZoomOut: document.getElementById("calendarZoomOut"),
    calendarZoomLabel: document.getElementById("calendarZoomLabel"),
    appToast: document.getElementById("appToast"),
    appToastText: document.getElementById("appToastText"),
    appToastAction: document.getElementById("appToastAction"),
    linkedSaveRow: document.getElementById("linkedSaveRow"),
    linkedSaveLabel: document.getElementById("linkedSaveLabel"),
    unlinkSaveBtn: document.getElementById("unlinkSaveBtn"),
    linkSaveBtn: document.getElementById("linkSaveBtn"),
    openOnboardingBtn: document.getElementById("openOnboardingBtn"),
    bulkApplySourceLabel: document.getElementById("bulkApplySourceLabel"),
    bulkDayChecks: document.getElementById("bulkDayChecks"),
    bulkApplyGapsBtn: document.getElementById("bulkApplyGapsBtn"),
    bulkSelectWeekdays: document.getElementById("bulkSelectWeekdays"),
    bulkSelectAllOther: document.getElementById("bulkSelectAllOther"),
    exportIcsBtn: document.getElementById("exportIcsBtn"),
    copyWeekTextBtn: document.getElementById("copyWeekTextBtn"),
    onboardingDialog: document.getElementById("onboardingDialog"),
    onboardingDismiss: document.getElementById("onboardingDismiss"),
    onboardingStartStep1: document.getElementById("onboardingStartStep1"),
    onboardingDontShow: document.getElementById("onboardingDontShow"),
    stepNavAnchor: document.getElementById("stepNavAnchor"),
    heroQuickExport: document.getElementById("heroQuickExport"),
    heroQuickImport: document.getElementById("heroQuickImport"),
    heroQuickShare: document.getElementById("heroQuickShare"),
    heroQuickLinkFile: document.getElementById("heroQuickLinkFile"),
    taskRepeatChips: document.getElementById("taskRepeatChips"),
    taskRepeatAllBtn: document.getElementById("taskRepeatAllBtn"),
    nextUpCard: document.getElementById("nextUpCard"),
    nextUpText: document.getElementById("nextUpText"),
    notifyNextBtn: document.getElementById("notifyNextBtn"),
    shareLinkBtn: document.getElementById("shareLinkBtn"),
  };

  const wheelTimers = {};
  let draggedTaskId = null;

  const setMessage = (el, text, type = "") => {
    el.textContent = text;
    el.className = `inline-message ${type}`.trim();
  };

  const clearMessage = el => {
    el.textContent = "";
    el.className = "inline-message";
  };

  let saveStatusDebounce = null;
  let linkedFileDebounce = null;
  const touchSaveStatus = () => {
    if (!els.saveStatus) return;
    clearTimeout(saveStatusDebounce);
    saveStatusDebounce = setTimeout(() => {
      const t = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      els.saveStatus.textContent = `Saved locally · ${t}`;
      els.saveStatus.classList.add("save-status--flash");
      setTimeout(() => els.saveStatus.classList.remove("save-status--flash"), 900);
    }, 320);
  };

  const saveApp = () => {
    persistAppState(app);
    touchSaveStatus();
    clearTimeout(linkedFileDebounce);
    linkedFileDebounce = setTimeout(() => void flushLinkedBackup(), 650);
  };

  const updateLinkedSaveRow = async () => {
    if (!supportsLinkedJsonFile()) {
      if (els.linkSaveBtn) els.linkSaveBtn.hidden = true;
      if (els.linkedSaveRow) els.linkedSaveRow.hidden = true;
      if (els.heroQuickLinkFile) els.heroQuickLinkFile.hidden = true;
      return;
    }
    if (els.linkSaveBtn) els.linkSaveBtn.hidden = false;
    if (els.heroQuickLinkFile) els.heroQuickLinkFile.hidden = false;
    const h = await getLinkedJsonFileHandle();
    if (els.linkedSaveRow && els.linkedSaveLabel) {
      els.linkedSaveRow.hidden = !h;
      els.linkedSaveLabel.textContent = h
        ? "Backup file linked — edits sync to that JSON file."
        : "";
    }
    if (els.linkSaveBtn)
      els.linkSaveBtn.classList.toggle("dock-icon-btn--linked", Boolean(h));
  };

  let toastHideTimer = null;
  const hideToast = () => {
    if (els.appToast) els.appToast.hidden = true;
    if (els.appToastAction) {
      els.appToastAction.hidden = true;
      els.appToastAction.onclick = null;
    }
  };

  const showToast = (text, { undo = false } = {}) => {
    if (!els.appToast || !els.appToastText) return;
    els.appToastText.textContent = text;
    els.appToast.hidden = false;
    if (els.appToastAction) {
      els.appToastAction.hidden = !undo;
      if (undo)
        els.appToastAction.onclick = () => {
          performUndo();
          hideToast();
        };
    }
    clearTimeout(toastHideTimer);
    toastHideTimer = setTimeout(hideToast, 6500);
  };

  const flushLinkedBackup = async () => {
    const json = `${JSON.stringify(app, null, 2)}\n`;
    const r = await writeTextToLinkedJsonFile(json);
    if (!r.ok && r.reason === "permission") {
      showToast("Could not write linked backup — grant file access or unlink and link again.");
    }
  };

  const renderHeroForStep = step => {
    if (typeof document === "undefined") return;
    const base = "Easy Timetable";
    if (step === 1) document.title = `${base} · Time`;
    else if (step === 2) document.title = `${base} · Tasks`;
    else document.title = `${base} · Plan`;
  };

  const renderContinueRow = () => {
    const p = profile();
    const step = p.activeStep || 1;
    const hasGaps = p.gapsByDay.some(d => d.length);
    if (els.continueStep12) els.continueStep12.hidden = !(step === 1 && hasGaps);
    if (els.continueStep23) els.continueStep23.hidden = !(step === 2 && p.tasks.length > 0);
  };

  const getPlanHealthKey = () => {
    const p = profile();
    const hasGaps = p.gapsByDay.some(d => d.length);
    const taskCount = p.tasks.length;
    const info = weekDiagnostics();
    if (!hasGaps && !taskCount) return "waiting";
    if (!hasGaps) return "need-gaps";
    if (!taskCount) return "need-tasks";
    if (info.impossible.length || info.minNeed > info.usable) return "error";
    if (info.maxNeed > info.usable) return "warning";
    return "success";
  };

  const healthKeyToPalette = key =>
    key === "waiting" || key === "need-tasks" ? "info" : key === "need-gaps" ? "warning" : key;

  const applyHeroHealthUi = () => {
    const palette = healthKeyToPalette(getPlanHealthKey());
    if (els.heroStatStatus) els.heroStatStatus.dataset.health = palette;
    if (els.statHint) els.statHint.dataset.health = palette;
  };

  const renderStatHint = () => {
    if (!els.statHint) return;
    const p = profile();
    const hasGaps = p.gapsByDay.some(d => d.length);
    const taskCount = p.tasks.length;
    const info = weekDiagnostics();
    const tight = info.tightestDayLabel && info.tightestUsable != null
      ? `${info.tightestDayLabel} (${formatDuration(info.tightestUsable)} usable)`
      : null;

    if (!hasGaps && !taskCount) {
      els.statHint.textContent = "Add free-time gaps on at least one weekday to begin.";
    } else if (!hasGaps) {
      els.statHint.textContent = "Pick a weekday in step 1 and add your first gap.";
    } else if (!taskCount) {
      els.statHint.textContent = "Add tasks so the planner can place them into your gaps.";
    } else if (info.impossible.length || info.minNeed > info.usable) {
      els.statHint.textContent = tight
        ? `Minimum durations exceed usable time — ${tight} is the tightest day. Adjust gaps or tasks.`
        : "Minimum durations exceed usable time on your tightest day — adjust gaps or tasks.";
    } else if (info.maxNeed > info.usable) {
      els.statHint.textContent =
        "If every task runs long, the week may feel tight — try narrowing maximum durations.";
    } else {
      els.statHint.textContent =
        tight != null
          ? `Looking good — ${tight} is your tightest day; fine-tune priority in step 3 if needed.`
          : "Everything fits at minimum durations. Fine-tune priority in step 3.";
    }
  };

  const applyCalendarZoomStyle = () => {
    if (!els.calendarShell) return;
    els.calendarShell.style.transform = `scale(${calendarZoom})`;
    els.calendarShell.style.transformOrigin = "top center";
    if (els.calendarZoomLabel)
      els.calendarZoomLabel.textContent = `${Math.round(calendarZoom * 100)}%`;
  };

  const setActiveStep = step => {
    profile().activeStep = step;
    els.stepButtons.forEach(btn => {
      const isActive = Number(btn.dataset.step) === step;
      btn.classList.toggle("active", isActive);
      if (isActive) btn.setAttribute("aria-current", "step");
      else btn.removeAttribute("aria-current");
    });
    els.stepPanels.forEach(panel => {
      const show = Number(panel.dataset.stepPanel) === step;
      panel.classList.toggle("active", show);
      panel.hidden = !show;
    });
    renderHeroForStep(step);
    renderContinueRow();
    saveApp();
  };

  const renderWheelOptions = (container, values) => {
    container.innerHTML = values
      .map(
        value =>
          `<div class="wheel-option" data-value="${value}">${String(value).padStart(2, "0")}</div>`,
      )
      .join("");
  };

  const getWheelSelectedValue = (container, values) => {
    const index = clamp(Math.round(container.scrollTop / WHEEL_ITEM), 0, values.length - 1);
    return values[index];
  };

  const setWheelPosition = (container, values, value, instant = false) => {
    const index = values.indexOf(value);
    const top = (index < 0 ? 0 : index) * WHEEL_ITEM;
    container.scrollTo({ top, behavior: instant ? "auto" : "smooth" });
    updateWheelSelectedClass(container, values, value);
  };

  const updateWheelSelectedClass = (container, values, value) => {
    container.querySelectorAll(".wheel-option").forEach(option => {
      option.classList.toggle("selected", Number(option.dataset.value) === value);
    });
  };

  const state = {
    draftGap: { start: 9 * 60, end: 10 * 60 },
    editingGapId: null,
    editingTaskId: null,
    syncingGapInputs: false,
  };

  const syncDraftDisplays = () => {
    const [sh, sm] = toTime(state.draftGap.start).split(":");
    const [eh, em] = toTime(state.draftGap.end).split(":");
    els.startDisplay.textContent = `${sh}:${sm}`;
    els.endDisplay.textContent = `${eh}:${em}`;
    state.syncingGapInputs = true;
    try {
      if (els.gapStartInput) els.gapStartInput.value = `${sh}:${sm}`;
      if (els.gapEndInput) els.gapEndInput.value = `${eh}:${em}`;
    } finally {
      state.syncingGapInputs = false;
    }
  };

  const updateTaskRangeReadout = () => {
    if (!els.taskRangeReadout || !els.taskMin || !els.taskMax) return;
    let min = Number(els.taskMin.value);
    let max = Number(els.taskMax.value);
    if (Number.isNaN(min) || Number.isNaN(max)) {
      els.taskRangeReadout.textContent = "Range: —";
      return;
    }
    min = clamp(Math.round(min / 5) * 5, 5, 360);
    max = clamp(Math.round(max / 5) * 5, 5, 360);
    if (min > max) [min, max] = [max, min];
    els.taskRangeReadout.textContent = `Range: ${formatDuration(min)} – ${formatDuration(max)}`;
  };

  const renderTaskRepeatChips = () => {
    if (!els.taskRepeatChips) return;
    els.taskRepeatChips.innerHTML = DAY_SHORT.map(
      (label, idx) =>
        `<button type="button" class="repeat-dow-chip active" data-repeat-dow="${idx}" aria-pressed="true">${label}</button>`,
    ).join("");
  };

  const readRepeatWeekdaysFromUi = () => {
    const chips = els.taskRepeatChips?.querySelectorAll("[data-repeat-dow]");
    if (!chips?.length) return null;
    const on = [...chips]
      .filter(c => c.classList.contains("active"))
      .map(c => Number(c.dataset.repeatDow))
      .sort((a, b) => a - b);
    if (on.length === 7) return null;
    return on;
  };

  const setRepeatWeekdaysAll = () => {
    els.taskRepeatChips?.querySelectorAll("[data-repeat-dow]").forEach(c => {
      c.classList.add("active");
      c.setAttribute("aria-pressed", "true");
    });
  };

  const setRepeatWeekdaysFromTask = task => {
    const rw = normalizeRepeatWeekdays(task?.repeatWeekdays);
    els.taskRepeatChips?.querySelectorAll("[data-repeat-dow]").forEach(c => {
      const idx = Number(c.dataset.repeatDow);
      const on = rw == null || rw.includes(idx);
      c.classList.toggle("active", on);
      c.setAttribute("aria-pressed", on ? "true" : "false");
    });
  };

  const resetTaskComposer = () => {
    state.editingTaskId = null;
    if (els.cancelTaskEditBtn) els.cancelTaskEditBtn.hidden = true;
    if (els.taskSubmitBtn) els.taskSubmitBtn.textContent = "Add task";
    if (els.taskDeadline) els.taskDeadline.value = "";
    setRepeatWeekdaysAll();
  };

  const taskDueCaption = task => {
    const iso = normalizeTaskDeadline(task?.deadline);
    if (!iso) return "";
    return `Due ${formatShortPlanDay(iso)}`;
  };

  const taskRepeatCaption = task => {
    const rw = normalizeRepeatWeekdays(task?.repeatWeekdays);
    if (!rw) return "";
    return ` · ${rw.map(i => DAY_SHORT[i]).join(", ")}`;
  };

  const ensureDraftGapOrder = changedTarget => {
    if (state.draftGap.end <= state.draftGap.start) {
      if (changedTarget === "start") {
        state.draftGap.end = clamp(
          state.draftGap.start + 30,
          MINUTE_STEP,
          24 * 60 - MINUTE_STEP,
        );
      } else {
        state.draftGap.start = clamp(state.draftGap.end - 30, 0, 24 * 60 - MINUTE_STEP);
      }
    }
  };

  const syncAllWheelsFromDraft = (instant = true) => {
    const startHour = Math.floor(state.draftGap.start / 60);
    const startMinute = state.draftGap.start % 60;
    const endHour = Math.floor(state.draftGap.end / 60);
    const endMinute = state.draftGap.end % 60;
    setWheelPosition(els.startHourWheel, Array.from({ length: 24 }, (_, i) => i), startHour, instant);
    setWheelPosition(els.startMinuteWheel, MINUTE_VALUES, startMinute, instant);
    setWheelPosition(els.endHourWheel, Array.from({ length: 24 }, (_, i) => i), endHour, instant);
    setWheelPosition(els.endMinuteWheel, MINUTE_VALUES, endMinute, instant);
    syncDraftDisplays();
  };

  const updateDraftFromWheel = (target, part) => {
    const hourWheel = target === "start" ? els.startHourWheel : els.endHourWheel;
    const minuteWheel = target === "start" ? els.startMinuteWheel : els.endMinuteWheel;
    const hour = getWheelSelectedValue(hourWheel, Array.from({ length: 24 }, (_, i) => i));
    const minute = getWheelSelectedValue(minuteWheel, MINUTE_VALUES);
    state.draftGap[target] = hour * 60 + minute;
    ensureDraftGapOrder(target);
    syncDraftDisplays();
    if (part) syncAllWheelsFromDraft(false);
  };

  const bindWheel = (container, target, part, values) => {
    if (!container) return;
    container.tabIndex = 0;

    container.addEventListener("scroll", () => {
      clearTimeout(wheelTimers[`${target}-${part}`]);
      wheelTimers[`${target}-${part}`] = setTimeout(() => {
        const value = getWheelSelectedValue(container, values);
        setWheelPosition(container, values, value, false);
        updateDraftFromWheel(target, part);
      }, 70);
    });

    container.addEventListener("click", event => {
      const option = event.target.closest(".wheel-option");
      if (!option) return;
      const value = Number(option.dataset.value);
      setWheelPosition(container, values, value, false);
      updateDraftFromWheel(target, part);
    });

    container.addEventListener("keydown", e => {
      if (
        !["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(e.key)
      ) {
        return;
      }
      e.preventDefault();
      const last = values.length - 1;
      let i = clamp(Math.round(container.scrollTop / WHEEL_ITEM), 0, last);
      if (e.key === "ArrowUp") i -= 1;
      else if (e.key === "ArrowDown") i += 1;
      else if (e.key === "PageUp") i -= 3;
      else if (e.key === "PageDown") i += 3;
      else if (e.key === "Home") i = 0;
      else if (e.key === "End") i = last;
      i = clamp(i, 0, last);
      const instant = prefersReducedMotion();
      setWheelPosition(container, values, values[i], instant);
      updateDraftFromWheel(target, part);
    });
  };

  const applyGapDuration = duration => {
    state.draftGap.end = clamp(
      state.draftGap.start + duration,
      MINUTE_STEP,
      24 * 60 - MINUTE_STEP,
    );
    ensureDraftGapOrder("end");
    syncAllWheelsFromDraft(false);
    document.querySelectorAll("[data-gap-duration]").forEach(button => {
      button.classList.toggle("active", Number(button.dataset.gapDuration) === duration);
    });
  };

  const useCurrentTime = () => {
    state.draftGap.start = clamp(getRoundedNowMinutes(), 0, 24 * 60 - MINUTE_STEP);
    state.draftGap.end = clamp(state.draftGap.start + 60, MINUTE_STEP, 24 * 60 - MINUTE_STEP);
    syncAllWheelsFromDraft(false);
  };

  const resetGapComposer = () => {
    state.editingGapId = null;
    state.draftGap.start = 9 * 60;
    state.draftGap.end = 10 * 60;
    els.gapSubmitBtn.textContent = "Add gap";
    els.cancelGapEditBtn.hidden = true;
    clearMessage(els.gapMessage);
    syncAllWheelsFromDraft(true);
    applyGapDuration(30);
  };

  const addOrUpdateGap = () => {
    const { start, end } = state.draftGap;
    if (end <= start) {
      setMessage(els.gapMessage, "End time must be after start time.", "error");
      return;
    }

    const base = editingGaps().filter(gap => gap.id !== state.editingGapId);
    base.push({
      id: state.editingGapId || createTaskId(),
      startMinutes: start,
      endMinutes: end,
      start: toTime(start),
      end: toTime(end),
      duration: end - start,
    });

    const before = base.length;
    profile().gapsByDay[activeEditDay] = normalizeGaps(base);
    const mergedCount = before - profile().gapsByDay[activeEditDay].length;
    setMessage(
      els.gapMessage,
      state.editingGapId
        ? "Gap updated."
        : mergedCount > 0
          ? "Gap added and overlapping gaps were merged."
          : "Gap added.",
      "success",
    );

    refreshEverything();
    resetGapComposer();
  };

  const editGap = id => {
    const gap = editingGaps().find(item => item.id === id);
    if (!gap) return;
    state.editingGapId = id;
    state.draftGap.start = gap.startMinutes;
    state.draftGap.end = gap.endMinutes;
    els.gapSubmitBtn.textContent = "Save gap";
    els.cancelGapEditBtn.hidden = false;
    clearMessage(els.gapMessage);
    syncAllWheelsFromDraft(true);
    setActiveStep(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const removeGap = id => {
    pushUndo({ kind: "gapsDay", day: activeEditDay, gaps: cloneGaps(editingGaps()) });
    profile().gapsByDay[activeEditDay] = editingGaps().filter(gap => gap.id !== id);
    if (state.editingGapId === id) resetGapComposer();
    refreshEverything();
  };

  const duplicateGap = id => {
    const gaps = editingGaps();
    const g = gaps.find(x => x.id === id);
    if (!g) return;
    pushUndo({ kind: "gapsDay", day: activeEditDay, gaps: cloneGaps(gaps) });
    const span = g.endMinutes - g.startMinutes;
    let ns = g.endMinutes;
    let ne = ns + span;
    if (ne > 24 * 60 - MINUTE_STEP) {
      ne = g.startMinutes;
      ns = Math.max(0, ne - span);
    }
    const endM = Math.min(ne, 24 * 60 - MINUTE_STEP);
    const copy = {
      id: createTaskId(),
      startMinutes: ns,
      endMinutes: endM,
      start: toTime(ns),
      end: toTime(endM),
      duration: endM - ns,
    };
    profile().gapsByDay[activeEditDay] = normalizeGaps([...gaps, copy]);
    refreshEverything();
  };

  const renderGaps = () => {
    const gaps = editingGaps();
    if (!gaps.length) {
      els.gapList.innerHTML = `<div class="empty-state empty-state--cta"><p>No gaps for ${DAY_SHORT[activeEditDay]} yet.</p><button type="button" class="soft-btn" data-scroll-to-gap-composer>Add a gap</button></div>`;
      return;
    }

    els.gapList.innerHTML = gaps
      .map(
        gap => `
      <article class="item-card">
        <div class="item-card-head">
          <div>
            <div class="item-title">${gap.start} – ${gap.end}</div>
            <div class="item-meta">${formatDuration(gap.duration)}</div>
          </div>
          <div class="item-actions">
            <button type="button" class="item-action" data-gap-edit="${gap.id}">Edit</button>
            <button type="button" class="item-action" data-gap-dup="${gap.id}">Duplicate</button>
            <button type="button" class="item-action danger" data-gap-delete="${gap.id}">Remove</button>
          </div>
        </div>
      </article>
    `,
      )
      .join("");
  };

  const addTask = () => {
    const name = els.taskName.value.trim();
    let min = Number(els.taskMin.value);
    let max = Number(els.taskMax.value);

    if (!name) {
      setMessage(els.taskMessage, "Give the task a name.", "error");
      return;
    }
    if (Number.isNaN(min) || Number.isNaN(max)) {
      setMessage(els.taskMessage, "Enter valid time values.", "error");
      return;
    }

    min = clamp(Math.round(min / 5) * 5, 5, 360);
    max = clamp(Math.round(max / 5) * 5, 5, 360);
    if (min > max) [min, max] = [max, min];

    const deadlineRaw = els.taskDeadline?.value?.trim() ?? "";
    const deadline = normalizeTaskDeadline(deadlineRaw);
    const repeatSel = readRepeatWeekdaysFromUi();
    if (repeatSel && repeatSel.length === 0) {
      setMessage(els.taskMessage, "Pick at least one weekday, or tap All days.", "error");
      return;
    }

    if (state.editingTaskId != null) {
      const task = profile().tasks.find(t => t.id === state.editingTaskId);
      if (!task) {
        resetTaskComposer();
        return;
      }
      pushUndo({ kind: "tasks", tasks: cloneTasks(profile().tasks) });
      task.name = name;
      task.min = min;
      task.max = max;
      task.average = Math.round((min + max) / 2);
      if (deadline) task.deadline = deadline;
      else delete task.deadline;
      if (repeatSel?.length) task.repeatWeekdays = repeatSel;
      else delete task.repeatWeekdays;
      els.taskName.value = "";
      clearMessage(els.taskMessage);
      resetTaskComposer();
      refreshEverything();
      return;
    }

    const newTask = {
      id: createTaskId(),
      name,
      min,
      max,
      average: Math.round((min + max) / 2),
    };
    if (deadline) newTask.deadline = deadline;
    if (repeatSel?.length) newTask.repeatWeekdays = repeatSel;
    profile().tasks.push(newTask);

    els.taskName.value = "";
    clearMessage(els.taskMessage);
    refreshEverything();
  };

  const editTask = id => {
    const task = profile().tasks.find(t => t.id === id);
    if (!task) return;
    state.editingTaskId = id;
    els.taskName.value = task.name;
    els.taskMin.value = String(task.min);
    els.taskMax.value = String(task.max);
    if (els.taskDeadline) els.taskDeadline.value = task.deadline ?? "";
    setRepeatWeekdaysFromTask(task);
    updateTaskRangeReadout();
    if (els.cancelTaskEditBtn) els.cancelTaskEditBtn.hidden = false;
    if (els.taskSubmitBtn) els.taskSubmitBtn.textContent = "Save task";
    setActiveStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
    els.taskName.focus();
  };

  const removeTask = id => {
    pushUndo({ kind: "tasks", tasks: cloneTasks(profile().tasks) });
    profile().tasks = profile().tasks.filter(task => task.id !== id);
    if (state.editingTaskId === id) resetTaskComposer();
    refreshEverything();
  };

  const moveTask = (fromIndex, toIndex) => {
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= profile().tasks.length ||
      toIndex >= profile().tasks.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const copy = [...profile().tasks];
    const [task] = copy.splice(fromIndex, 1);
    copy.splice(toIndex, 0, task);
    profile().tasks = copy;
    refreshEverything();
  };

  const renderTaskMeta = () => {
    if (!els.taskCountMeta || !els.taskMinMeta || !els.taskMaxMeta) return;
    els.taskCountMeta.textContent = String(profile().tasks.length);
    els.taskMinMeta.textContent = formatDuration(totalTaskMin(profile().tasks));
    els.taskMaxMeta.textContent = formatDuration(totalTaskMax(profile().tasks));
  };

  const renderTasks = () => {
    if (!profile().tasks.length) {
      els.taskList.innerHTML = '<div class="empty-state">No tasks yet. Add one above.</div>';
      return;
    }

    els.taskList.innerHTML = profile().tasks
      .map(
        (task, index) => `
      <article class="item-card">
        <div class="item-card-head">
          <div>
            <div class="item-title">${escapeHtml(task.name)}</div>
            <div class="item-meta">Task ${index + 1} · ${formatDuration(task.min)}–${formatDuration(
              task.max,
            )} per session${task.deadline ? ` · ${escapeHtml(taskDueCaption(task))}` : ""}${escapeHtml(
              taskRepeatCaption(task),
            )}</div>
          </div>
          <div class="item-actions">
            <button type="button" class="item-action" data-task-edit="${task.id}">Edit</button>
            <button type="button" class="item-action danger" data-task-delete="${task.id}">Delete</button>
          </div>
        </div>
      </article>
    `,
      )
      .join("");
  };

  const renderPriorityList = () => {
    const tasks = profile().tasks;
    if (!tasks.length) {
      els.priorityList.innerHTML =
        '<div class="empty-state">No tasks yet. Add tasks first, then reorder them here.</div>';
      return;
    }

    els.priorityList.innerHTML = tasks
      .map(
        (task, index) => `
      <article class="priority-item" draggable="true" data-priority-id="${task.id}">
        <div class="priority-main">
          <div class="priority-rank">${index + 1}</div>
          <div class="priority-text">
            <div class="item-title">${escapeHtml(task.name)}</div>
            <div class="priority-help">${formatDuration(task.min)}–${formatDuration(task.max)}${
              task.deadline ? ` · ${escapeHtml(taskDueCaption(task))}` : ""
            }</div>
          </div>
        </div>
        <div class="priority-actions">
          <button type="button" class="priority-arrow" data-priority-up="${index}" ${
            index === 0 ? "disabled" : ""
          } aria-label="Move task up">↑</button>
          <button type="button" class="priority-arrow" data-priority-down="${index}" ${
            index === tasks.length - 1 ? "disabled" : ""
          } aria-label="Move task down">↓</button>
        </div>
      </article>
    `,
      )
      .join("");
  };

  const renderFitBanner = () => {
    const p = profile();
    const gapCount = p.gapsByDay.some(d => d.length) ? 1 : 0;
    const taskCount = p.tasks.length;
    const info = weekDiagnostics();
    const issues = buildFitIssues(info, { gapCount, taskCount });
    const tight =
      info.tightestDayLabel && info.tightestUsable != null
        ? `${info.tightestDayLabel} (${formatDuration(info.tightestUsable)} usable)`
        : null;

    if (!p.gapsByDay.some(d => d.length) && !taskCount) {
      els.fitBanner.className = "fit-banner info";
      els.fitBanner.textContent = "Add gaps and tasks to start planning.";
      renderFitIssuesList(issues);
      return;
    }
    if (!p.gapsByDay.some(d => d.length)) {
      els.fitBanner.className = "fit-banner warning";
      els.fitBanner.textContent = "Add at least one gap (pick a day above).";
      renderFitIssuesList(issues);
      return;
    }
    if (!taskCount) {
      els.fitBanner.className = "fit-banner info";
      els.fitBanner.textContent = "Gaps are set. Add tasks next.";
      renderFitIssuesList(issues);
      return;
    }

    if (info.impossible.length) {
      els.fitBanner.className = "fit-banner error";
      els.fitBanner.textContent = `Some tasks are too large for gaps on one or more days. See details below.`;
      renderFitIssuesList(issues);
      return;
    }
    if (info.minNeed > info.usable) {
      els.fitBanner.className = "fit-banner error";
      els.fitBanner.textContent = tight
        ? `Minimum work may exceed usable time — tightest day is ${tight}.`
        : `Minimum work may exceed usable time on the tightest day (${formatDuration(info.usable)} usable).`;
      renderFitIssuesList(issues);
      return;
    }
    if (info.maxNeed > info.usable) {
      els.fitBanner.className = "fit-banner warning";
      els.fitBanner.textContent = tight
        ? `Tight across the week if every task runs long. Tightest day: ${tight}.`
        : "Tight across the week if every task runs long.";
      renderFitIssuesList(issues);
      return;
    }
    els.fitBanner.className = "fit-banner success";
    els.fitBanner.textContent = tight
      ? `Weekly check: minimum fits within ${formatDuration(
          info.tightestUsable,
        )} usable — tightest day is ${info.tightestDayLabel}.`
      : `Weekly check: minimum fits within ${formatDuration(info.usable)} on the tightest day.`;
    renderFitIssuesList(issues);
  };

  const renderFitIssuesList = issues => {
    if (!els.fitIssues) return;
    els.fitIssues.innerHTML = issues
      .map(issue => {
        const btn =
          issue.fixStep != null
            ? `<button type="button" class="fit-issue-fix" data-fix-step="${issue.fixStep}">${escapeHtml(
                issue.fixLabel || "Open",
              )}</button>`
            : "";
        return `<div class="fit-issue fit-issue-${issue.severity}"><p>${escapeHtml(issue.message)}</p>${btn}</div>`;
      })
      .join("");
  };

  const renderStats = () => {
    if (!els.statFree || !els.statTasks || !els.statStatus) return;
    const p = profile();
    const freeAll = p.gapsByDay.reduce((s, g) => s + totalGapMinutes(g), 0);
    els.statFree.textContent = formatDuration(freeAll);
    els.statTasks.textContent = String(p.tasks.length);
    const key = getPlanHealthKey();
    const statusLabel = {
      waiting: "Waiting",
      "need-gaps": "Need gaps",
      "need-tasks": "Need tasks",
      error: "Won’t fit",
      warning: "Tight",
      success: "Fits",
    };
    els.statStatus.textContent = statusLabel[key];
  };

  const getCalendarRangeWeek = (order, previewsByDay) => {
    const values = [];
    order.forEach(dayIdx => {
      const gaps = profile().gapsByDay[dayIdx];
      gaps.forEach(g => values.push(g.startMinutes, g.endMinutes));
      const plan = previewsByDay.get(dayIdx);
      if (plan) plan.scheduled.forEach(t => values.push(t.startMinutes, t.endMinutes));
    });
    if (!values.length) return { startHour: 8, endHour: 22 };
    const min = Math.min(...values);
    const max = Math.max(...values);
    return {
      startHour: clamp(Math.floor(min / 60) - 1, 0, 22),
      endHour: clamp(Math.ceil(max / 60) + 1, 2, 24),
    };
  };

  const topForMinutes = (minutes, startHour) =>
    ((minutes - startHour * 60) / 60) * getHourHeight();

  const renderCalendarPreview = () => {
    const p = profile();
    const order = orderedDayIndices();
    const planMonday =
      normalizePlanWeekMondayISO(app.planWeekMonday) ?? normalizePlanWeekMondayISO(els.planWeekMondayInput?.value);
    const { previewsByDay } = computeWeekPreviews({
      gapsByDay: p.gapsByDay,
      tasks: p.tasks,
      generationStyle: p.generationStyle,
      keepBuffer: p.keepBuffer,
      planWeekMondayISO: planMonday,
      weekStartsOn: app.weekStartsOn,
    });

    if (!p.gapsByDay.some(d => d.length)) {
      els.calendarGrid.innerHTML =
        '<div class="empty-state" style="margin:12px;">Add gaps on at least one day to see the week preview.</div>';
      els.previewSummary.innerHTML = "";
      els.unscheduledList.innerHTML = "";
      return;
    }

    const { startHour, endHour } = getCalendarRangeWeek(order, previewsByDay);
    const hh = getHourHeight();
    const totalHeight = (endHour - startHour) * hh;

    const labels = [];
    for (let hour = startHour; hour <= endHour; hour += 1) {
      const top = (hour - startHour) * hh;
      if (hour < endHour) {
        labels.push(
          `<div class="time-label" style="top:${top}px">${String(hour).padStart(2, "0")}:00</div>`,
        );
      }
    }

    const hourLines = [];
    for (let hour = startHour; hour <= endHour; hour += 1) {
      const top = (hour - startHour) * hh;
      hourLines.push(`<div class="hour-line week-hour-line" style="top:${top}px"></div>`);
    }

    const columns = order
      .map(dayIdx => {
        const gaps = p.gapsByDay[dayIdx];
        const preview = previewsByDay.get(dayIdx);
        const gapBlocks = gaps
          .map(gap => {
            const top = topForMinutes(gap.startMinutes, startHour);
            const height = Math.max(
              20,
              ((gap.endMinutes - gap.startMinutes) / 60) * hh,
            );
            const gapTitle = escapeAttr(
              `Free time · ${gap.start} – ${gap.end} (${formatDuration(gap.duration)})`,
            );
            return `
            <div class="calendar-block gap" style="top:${top}px;height:${height}px;" title="${gapTitle}">
              <div class="calendar-block-title">Gap</div>
              <div class="calendar-block-time">${gap.start} – ${gap.end}</div>
            </div>`;
          })
          .join("");

        const taskBlocks = preview
          ? preview.scheduled
              .map(task => {
                const top = topForMinutes(task.startMinutes, startHour);
                const height = Math.max(
                  22,
                  ((task.endMinutes - task.startMinutes) / 60) * hh,
                );
                const dur = formatDuration(task.endMinutes - task.startMinutes);
                const dl = normalizeTaskDeadline(task.deadline);
                const dueSuffix = dl ? ` · Due ${formatShortPlanDay(dl)}` : "";
                const tip = escapeAttr(`${task.taskName} · ${task.start} – ${task.end} (${dur})${dueSuffix}`);
                return `
                <div class="calendar-block task" style="top:${top}px;height:${height}px;" title="${tip}">
                  <div class="calendar-block-title">${escapeHtml(task.taskName)}</div>
                  <div class="calendar-block-time">${task.start} – ${task.end}</div>
                </div>`;
              })
              .join("")
          : "";

        return `
          <div class="week-col" aria-label="${DAY_SHORT[dayIdx]}">
            <div class="week-col-track" style="height:${totalHeight}px">
              ${gapBlocks}
              ${taskBlocks}
            </div>
          </div>`;
      })
      .join("");

    const heads = order
      .map(dayIdx => {
        const iso =
          planMonday != null ? planDayISOForWeekdayIndex(planMonday, dayIdx) : null;
        const dateLine = iso ? `<span class="week-col-date">${escapeHtml(formatShortPlanDay(iso))}</span>` : "";
        return `<div class="week-col-head-static">${DAY_SHORT[dayIdx]}${dateLine}</div>`;
      })
      .join("");

    els.calendarGrid.style.minHeight = `${totalHeight + 36}px`;
    els.calendarGrid.innerHTML = `
      <div class="calendar-week-head">
        <div class="week-corner" aria-hidden="true"></div>
        ${heads}
      </div>
      <div class="calendar-week-grid" style="min-height:${totalHeight}px">
        <div class="time-rail">${labels.join("")}</div>
        <div class="week-columns-wrap" style="height:${totalHeight}px">
          <div class="week-hour-lines">${hourLines.join("")}</div>
          <div class="week-columns">${columns}</div>
        </div>
      </div>
    `;

    const firstPlan = order.map(d => previewsByDay.get(d)).find(Boolean);
    if (!firstPlan || !p.tasks.length) {
      els.previewSummary.innerHTML =
        '<div class="empty-state">Add tasks to see them placed into gaps (per day).</div>';
      els.unscheduledList.innerHTML = "";
      return;
    }

    const unscheduledByDay = order
      .map(dayIdx => {
        const plan = previewsByDay.get(dayIdx);
        return plan && plan.unscheduled.length
          ? { day: DAY_SHORT[dayIdx], dayIdx, list: plan.unscheduled }
          : null;
      })
      .filter(Boolean);

    els.previewSummary.innerHTML = `
      <div class="preview-pill preview-pill-row">
        <strong>${p.generationStyle[0].toUpperCase()}${p.generationStyle.slice(1)}</strong>
        <span>Week overview · style applies per day</span>
      </div>
    `;

    if (!unscheduledByDay.length) {
      els.unscheduledList.innerHTML = "";
      return;
    }

    els.unscheduledList.innerHTML = unscheduledByDay
      .map(
        block => `
      <div class="unscheduled-day-group">
        <div class="unscheduled-day-label">${block.day}</div>
        ${block.list
          .map(
            task => `
          <div class="unscheduled-row">
            <span class="unscheduled-row-main">${escapeHtml(task.taskName)} · ${formatDuration(task.duration)}</span>
            <span class="unscheduled-row-actions">
              <button type="button" class="item-action" data-raise-priority="${task.taskId}">Raise priority</button>
              <button type="button" class="item-action" data-edit-gaps-day="${block.dayIdx}">Edit gaps</button>
            </span>
          </div>`,
          )
          .join("")}
      </div>`,
      )
      .join("");
  };

  let calendarScrollHintListenersBound = false;
  const updateCalendarScrollHint = () => {
    const shell = els.calendarShell;
    const hint = els.calendarScrollHint;
    if (!shell || !hint) return;
    const canScroll = shell.scrollWidth > shell.clientWidth + 2;
    const atEnd = shell.scrollLeft + shell.clientWidth >= shell.scrollWidth - 2;
    const show = canScroll && !atEnd;
    hint.hidden = !show;
    hint.setAttribute("aria-hidden", show ? "false" : "true");
  };

  const bindCalendarScrollHint = () => {
    const shell = els.calendarShell;
    if (!shell || calendarScrollHintListenersBound) return;
    calendarScrollHintListenersBound = true;
    shell.addEventListener("scroll", updateCalendarScrollHint, { passive: true });
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(() => updateCalendarScrollHint()).observe(shell);
    }
    window.addEventListener("resize", updateCalendarScrollHint, { passive: true });
  };

  const renderBulkApplyBar = () => {
    if (!els.bulkDayChecks || !els.bulkApplySourceLabel) return;
    els.bulkApplySourceLabel.textContent = DAY_SHORT[activeEditDay];
    const order = orderedDayIndices();
    els.bulkDayChecks.innerHTML = order
      .filter(dayIdx => dayIdx !== activeEditDay)
      .map(
        dayIdx =>
          `<label class="bulk-check-label"><input type="checkbox" class="bulk-day-cb" value="${dayIdx}" /> <span>${DAY_SHORT[dayIdx]}</span></label>`,
      )
      .join("");
  };

  const renderNextUp = () => {
    const card = els.nextUpCard;
    const textEl = els.nextUpText;
    const btn = els.notifyNextBtn;
    if (!card || !textEl) return;
    const p = profile();
    if (!p.gapsByDay.some(d => d.length) || !p.tasks.length) {
      card.hidden = true;
      if (btn) {
        delete btn.dataset.notifyAt;
        delete btn.dataset.notifyName;
      }
      return;
    }
    const todayMonday = mondayISOFOrCurrentWeek();
    const now = new Date();
    const dow = now.getDay();
    const weekdayIndex = dow === 0 ? 6 : dow - 1;
    const { previewsByDay } = computeWeekPreviews({
      gapsByDay: p.gapsByDay,
      tasks: p.tasks,
      generationStyle: p.generationStyle,
      keepBuffer: p.keepBuffer,
      planWeekMondayISO: todayMonday,
      weekStartsOn: app.weekStartsOn,
    });
    const preview = previewsByDay.get(weekdayIndex);
    if (!preview?.scheduled?.length) {
      card.hidden = true;
      if (btn) {
        delete btn.dataset.notifyAt;
        delete btn.dataset.notifyName;
      }
      return;
    }
    const minsNow = now.getHours() * 60 + now.getMinutes();
    const upcoming = [...preview.scheduled]
      .filter(s => s.startMinutes >= minsNow)
      .sort((a, b) => a.startMinutes - b.startMinutes)[0];
    if (!upcoming) {
      textEl.textContent = "No more placed blocks left today in the preview.";
      card.hidden = false;
      if (btn) {
        delete btn.dataset.notifyAt;
        delete btn.dataset.notifyName;
      }
      return;
    }
    const at = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      Math.floor(upcoming.startMinutes / 60),
      upcoming.startMinutes % 60,
      0,
      0,
    );
    const deltaMin = Math.max(0, Math.round((at - now) / 60000));
    textEl.textContent = `Next: ${upcoming.taskName} at ${upcoming.start} (~${deltaMin} min).`;
    card.hidden = false;
    if (btn) {
      btn.dataset.notifyAt = String(at.getTime());
      btn.dataset.notifyName = upcoming.taskName;
    }
  };

  const setupOnboarding = () => {
    const d = els.onboardingDialog;
    if (!d) return;
    const persistOnboardingHide = () => {
      if (!els.onboardingDontShow?.checked) return;
      try {
        localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
      } catch (_) {}
    };
    const goToStep1FromOnboarding = () => {
      persistOnboardingHide();
      d.close();
      setActiveStep(1);
      const nav = els.stepNavAnchor;
      if (nav) {
        nav.scrollIntoView({
          behavior: prefersReducedMotion() ? "auto" : "smooth",
          block: "start",
        });
      }
      requestAnimationFrame(() => {
        document.querySelector(".week-strip-btn.active")?.focus();
      });
    };
    const open = () => {
      try {
        d.showModal();
      } catch (_) {}
    };
    els.openOnboardingBtn?.addEventListener("click", () => open());
    els.onboardingDismiss?.addEventListener("click", () => {
      persistOnboardingHide();
      d.close();
    });
    els.onboardingStartStep1?.addEventListener("click", goToStep1FromOnboarding);
    d.addEventListener("cancel", e => {
      e.preventDefault();
      d.close();
    });
    try {
      if (!localStorage.getItem(ONBOARDING_STORAGE_KEY)) open();
    } catch (_) {}
  };

  const refreshEverything = () => {
    renderHeroForStep(profile().activeStep || 1);
    renderContinueRow();
    renderStatHint();
    renderStats();
    applyHeroHealthUi();
    renderWeekStrip();
    renderToolbar();
    renderGaps();
    renderBulkApplyBar();
    renderTasks();
    renderTaskMeta();
    renderPriorityList();
    renderFitBanner();
    renderCalendarPreview();
    applyCalendarZoomStyle();
    requestAnimationFrame(() => updateCalendarScrollHint());
    renderNextUp();
    void updateLinkedSaveRow();
    saveApp();
  };

  const renderWeekStrip = () => {
    if (!els.weekStrip) return;
    const order = orderedDayIndices();
    els.weekStrip.innerHTML = order
      .map(dayIdx => {
        const has = profile().gapsByDay[dayIdx].length > 0;
        const active = dayIdx === activeEditDay;
        return `<button type="button" role="tab" aria-selected="${active}" class="week-strip-btn${
          active ? " active" : ""
        }${has ? " has-gaps" : ""}" data-edit-day="${dayIdx}" title="${DAY_SHORT[dayIdx]}${
          has ? " · has gaps" : ""
        }"><span class="week-strip-dot" aria-hidden="true"></span><span class="week-strip-abbr">${DAY_SHORT[dayIdx]}</span></button>`;
      })
      .join("");
  };

  const renderToolbar = () => {
    if (els.profileSelect) {
      els.profileSelect.innerHTML = app.profiles
        .map(
          pr =>
            `<option value="${escapeHtml(pr.id)}" ${
              pr.id === app.activeProfileId ? "selected" : ""
            }>${escapeHtml(pr.name)}</option>`,
        )
        .join("");
    }
    if (els.backgroundSelect) {
      els.backgroundSelect.innerHTML = BACKGROUND_OPTIONS.map(
        b =>
          `<option value="${b.id}" ${b.id === app.backgroundId ? "selected" : ""}>${b.label}</option>`,
      ).join("");
    }
    if (els.weekStartSelect) {
      els.weekStartSelect.value = String(app.weekStartsOn);
    }
    if (els.planWeekMondayInput) {
      els.planWeekMondayInput.value = app.planWeekMonday || "";
    }
    if (els.fontScaleSelect) {
      els.fontScaleSelect.innerHTML = FONT_SCALES.map(
        f =>
          `<option value="${f.id}" ${f.id === app.fontScale ? "selected" : ""}>${f.label}</option>`,
      ).join("");
    }
    if (els.reduceMotionToggle) els.reduceMotionToggle.checked = app.reduceMotion;
    if (els.accentMotionToggle) els.accentMotionToggle.checked = app.accentMotion;
    if (els.copyDaySource) {
      const order = orderedDayIndices();
      els.copyDaySource.innerHTML = order
        .map(
          dayIdx =>
            `<option value="${dayIdx}">${DAY_SHORT[dayIdx]}${
              dayIdx === activeEditDay ? " (editing)" : ""
            }</option>`,
        )
        .join("");
    }
    if (els.undoBtn) els.undoBtn.disabled = undoStack.length === 0;
    if (els.deleteProfileBtn) els.deleteProfileBtn.disabled = app.profiles.length <= 1;
  };

  const performUndo = () => {
    const u = undoStack.pop();
    if (!u) return;
    if (u.kind === "gapsDay") profile().gapsByDay[u.day] = u.gaps;
    if (u.kind === "gapsAll")
      profile().gapsByDay = u.gapsByDay.map(day => normalizeGaps(cloneGaps(Array.isArray(day) ? day : [])));
    if (u.kind === "tasks") profile().tasks = u.tasks;
    hideToast();
    refreshEverything();
  };

  const currentPlanMondayOrDefault = () =>
    normalizePlanWeekMondayISO(app.planWeekMonday) ??
    normalizePlanWeekMondayISO(els.planWeekMondayInput?.value) ??
    mondayISOFOrCurrentWeek();

  const exportWeekICSFile = () => {
    const p = profile();
    if (!p.gapsByDay.some(d => d.length)) {
      window.alert("Add gaps on at least one day before exporting.");
      return;
    }
    const planMonday = currentPlanMondayOrDefault();
    const { orderedDayIndices: order, previewsByDay } = computeWeekPreviews({
      gapsByDay: p.gapsByDay,
      tasks: p.tasks,
      generationStyle: p.generationStyle,
      keepBuffer: p.keepBuffer,
      planWeekMondayISO: planMonday,
      weekStartsOn: app.weekStartsOn,
    });
    let count = 0;
    for (const dayIdx of order) count += previewsByDay.get(dayIdx)?.scheduled?.length ?? 0;
    if (!count) {
      window.alert("Add tasks so the preview shows placed blocks — nothing to put on a calendar yet.");
      return;
    }
    const ics = buildICSWeekCalendar({
      planMondayISO: planMonday,
      orderedDayIndices: order,
      previewsByDay,
      calendarName: `${p.name} · Easy Timetable`,
    });
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `easy-timetable-week-${planMonday}.ics`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("Downloaded .ics — open it in your calendar app.");
  };

  const copyWeekPlanText = async () => {
    const p = profile();
    const planMonday = currentPlanMondayOrDefault();
    const { orderedDayIndices: order, previewsByDay } = computeWeekPreviews({
      gapsByDay: p.gapsByDay,
      tasks: p.tasks,
      generationStyle: p.generationStyle,
      keepBuffer: p.keepBuffer,
      planWeekMondayISO: planMonday,
      weekStartsOn: app.weekStartsOn,
    });
    const text = formatWeekPlanPlainText({
      planMondayISO: planMonday,
      orderedDayIndices: order,
      previewsByDay,
      profileName: p.name,
    });
    try {
      await navigator.clipboard.writeText(text);
      showToast("Week plan copied as plain text.");
    } catch {
      window.prompt("Copy this text:", text);
    }
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(app, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `easy-timetable-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importData = file => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result));
        const next = migrateToAppState(raw);
        if (!next || !next.profiles?.length) {
          window.alert("That file does not look like a saved timetable.");
          return;
        }
        if (!window.confirm("Replace all timetables in this browser with the file contents?")) return;
        app = next;
        activeEditDay = 0;
        applyChrome();
        syncAllWheelsFromDraft(true);
        resetGapComposer();
        setActiveStep(profile().activeStep || 1);
        refreshEverything();
        const activeName = getActiveProfile(app).name;
        showToast(`Imported ${next.profiles.length} timetable(s). Active: “${activeName}”.`);
      } catch (e) {
        console.error(e);
        window.alert("Could not read that JSON file.");
      }
    };
    reader.readAsText(file, "utf-8");
  };

  const tryImportShareFromHash = async () => {
    const raw = window.location.hash?.replace(/^#/, "") ?? "";
    if (!raw.startsWith(SHARE_HASH_PREFIX)) return false;
    const payload = raw.slice(SHARE_HASH_PREFIX.length);
    try {
      const json = await decodeAppStatePayload(payload);
      const next = migrateToAppState(JSON.parse(json));
      if (!next?.profiles?.length) {
        window.alert("This link does not contain valid timetable data.");
        history.replaceState(null, "", window.location.pathname + window.location.search);
        return false;
      }
      if (!window.confirm("Load timetable from this link? This replaces data in this browser.")) {
        history.replaceState(null, "", window.location.pathname + window.location.search);
        return false;
      }
      app = next;
      activeEditDay = 0;
      history.replaceState(null, "", window.location.pathname + window.location.search);
      return true;
    } catch (e) {
      console.error(e);
      window.alert("Could not read this share link.");
      history.replaceState(null, "", window.location.pathname + window.location.search);
      return false;
    }
  };

  const copyShareLinkUrl = async () => {
    let payload;
    try {
      payload = await encodeAppStatePayload(JSON.stringify(app));
    } catch (e) {
      console.error(e);
      window.alert("Could not build a share link.");
      return;
    }
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}#${SHARE_HASH_PREFIX}${payload}`;
    if (url.length > MAX_SHARE_URL_CHARS) {
      window.alert(
        "Your data is too large for a share link. Use Export JSON, a linked backup file, or remove old timetables.",
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast("Share link copied — open it on another device.");
    } catch {
      window.prompt("Copy this link:", url);
    }
  };

  const tryApplyTemplate = templateId => {
    const t = SCHEDULE_TEMPLATES.find(x => x.id === templateId);
    if (!t) return;
    pushUndo({ kind: "gapsDay", day: activeEditDay, gaps: cloneGaps(editingGaps()) });
    profile().gapsByDay[activeEditDay] = normalizeGaps(t.apply());
    refreshEverything();
    showToast(
      `Applied “${t.label}” to ${DAY_SHORT[activeEditDay]}. Undo in the sidebar or press Ctrl+Z.`,
      { undo: true },
    );
  };

  const bindEvents = () => {
    els.stepButtons.forEach(button => {
      button.addEventListener("click", () => setActiveStep(Number(button.dataset.step)));
    });

    document.addEventListener("click", event => {
      const scrollComposer = event.target.closest("[data-scroll-to-gap-composer]");
      if (scrollComposer) {
        els.gapForm?.scrollIntoView({ behavior: "smooth", block: "center" });
        if (els.startHourWheel) els.startHourWheel.focus({ preventScroll: true });
        return;
      }

      const durationButton = event.target.closest("[data-gap-duration]");
      if (durationButton) {
        applyGapDuration(Number(durationButton.dataset.gapDuration));
        return;
      }

      const styleButton = event.target.closest("[data-style]");
      if (styleButton) {
        profile().generationStyle = styleButton.dataset.style;
        document.querySelectorAll("[data-style]").forEach(btn => {
          btn.classList.toggle("active", btn.dataset.style === profile().generationStyle);
        });
        refreshEverything();
        return;
      }

      const gapEdit = event.target.closest("[data-gap-edit]");
      if (gapEdit) {
        editGap(Number(gapEdit.dataset.gapEdit));
        return;
      }

      const gapDup = event.target.closest("[data-gap-dup]");
      if (gapDup) {
        duplicateGap(Number(gapDup.dataset.gapDup));
        return;
      }

      const gapDelete = event.target.closest("[data-gap-delete]");
      if (gapDelete) {
        removeGap(Number(gapDelete.dataset.gapDelete));
        return;
      }

      const taskDelete = event.target.closest("[data-task-delete]");
      if (taskDelete) {
        removeTask(Number(taskDelete.dataset.taskDelete));
        return;
      }

      const taskEditBtn = event.target.closest("[data-task-edit]");
      if (taskEditBtn) {
        editTask(Number(taskEditBtn.dataset.taskEdit));
        return;
      }

      const raisePri = event.target.closest("[data-raise-priority]");
      if (raisePri) {
        const id = Number(raisePri.dataset.raisePriority);
        const idx = profile().tasks.findIndex(t => t.id === id);
        if (idx > 0) moveTask(idx, 0);
        return;
      }

      const editGapsDay = event.target.closest("[data-edit-gaps-day]");
      if (editGapsDay) {
        activeEditDay = Number(editGapsDay.dataset.editGapsDay);
        resetGapComposer();
        setActiveStep(1);
        refreshEverything();
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      const upButton = event.target.closest("[data-priority-up]");
      if (upButton) {
        const index = Number(upButton.dataset.priorityUp);
        moveTask(index, index - 1);
        return;
      }

      const downButton = event.target.closest("[data-priority-down]");
      if (downButton) {
        const index = Number(downButton.dataset.priorityDown);
        moveTask(index, index + 1);
        return;
      }

      const dayTab = event.target.closest("[data-edit-day]");
      if (dayTab && dayTab.closest("#weekStrip")) {
        activeEditDay = Number(dayTab.dataset.editDay);
        resetGapComposer();
        renderWeekStrip();
        renderToolbar();
        renderGaps();
        saveApp();
        return;
      }

      const fixStep = event.target.closest("[data-fix-step]");
      if (fixStep) {
        setActiveStep(Number(fixStep.dataset.fixStep));
        const panel = document.querySelector(`[data-step-panel="${fixStep.dataset.fixStep}"]`);
        panel?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      const tpl = event.target.closest("[data-template]");
      if (tpl && tpl.closest("#templateRow")) {
        tryApplyTemplate(tpl.dataset.template);
      }
    });

    els.gapForm.addEventListener("submit", event => {
      event.preventDefault();
      addOrUpdateGap();
    });

    els.taskForm.addEventListener("submit", event => {
      event.preventDefault();
      addTask();
    });

    els.useNowBtn.addEventListener("click", useCurrentTime);
    els.cancelGapEditBtn.addEventListener("click", resetGapComposer);
    els.keepBuffer.addEventListener("change", () => {
      profile().keepBuffer = els.keepBuffer.checked;
      refreshEverything();
    });

    els.priorityList.addEventListener("dragstart", event => {
      const item = event.target.closest("[data-priority-id]");
      if (!item) return;
      draggedTaskId = Number(item.dataset.priorityId);
      item.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
    });

    els.priorityList.addEventListener("dragend", event => {
      const item = event.target.closest("[data-priority-id]");
      if (item) item.classList.remove("dragging");
      draggedTaskId = null;
    });

    els.priorityList.addEventListener("dragover", event => {
      if (event.target.closest("[data-priority-id]")) event.preventDefault();
    });

    els.priorityList.addEventListener("drop", event => {
      event.preventDefault();
      const target = event.target.closest("[data-priority-id]");
      if (!target || draggedTaskId === null) return;
      const targetId = Number(target.dataset.priorityId);
      if (draggedTaskId === targetId) return;
      const fromIndex = profile().tasks.findIndex(task => task.id === draggedTaskId);
      const toIndex = profile().tasks.findIndex(task => task.id === targetId);
      moveTask(fromIndex, toIndex);
    });

    if (els.profileSelect) {
      els.profileSelect.addEventListener("change", () => {
        app.activeProfileId = els.profileSelect.value;
        activeEditDay = 0;
        resetGapComposer();
        setActiveStep(profile().activeStep || 1);
        els.keepBuffer.checked = profile().keepBuffer;
        document.querySelectorAll("[data-style]").forEach(btn => {
          btn.classList.toggle("active", btn.dataset.style === profile().generationStyle);
        });
        refreshEverything();
      });
    }

    if (els.newProfileBtn) {
      els.newProfileBtn.addEventListener("click", () => {
        const name = window.prompt("Name for the new saved plan:", `Schedule ${app.profiles.length + 1}`);
        if (name === null) return;
        addProfile(app, name || undefined);
        activeEditDay = 0;
        resetGapComposer();
        refreshEverything();
      });
    }

    if (els.deleteProfileBtn) {
      els.deleteProfileBtn.addEventListener("click", () => {
        const prof = profile();
        if (
          !window.confirm(
            `Delete saved plan “${prof.name}”? Export from the sidebar first if you need a backup. This cannot be undone.`,
          )
        ) {
          return;
        }
        removeProfile(app, app.activeProfileId);
        activeEditDay = 0;
        resetGapComposer();
        refreshEverything();
      });
    }

    if (els.exportBtn) els.exportBtn.addEventListener("click", exportData);

    if (els.importBtn && els.importFile) {
      els.importBtn.addEventListener("click", () => els.importFile.click());
      els.importFile.addEventListener("change", () => {
        const f = els.importFile.files?.[0];
        if (f) importData(f);
        els.importFile.value = "";
      });
    }

    if (els.exportIcsBtn) els.exportIcsBtn.addEventListener("click", exportWeekICSFile);
    if (els.copyWeekTextBtn) els.copyWeekTextBtn.addEventListener("click", () => void copyWeekPlanText());

    if (els.bulkApplyGapsBtn && els.bulkDayChecks) {
      els.bulkApplyGapsBtn.addEventListener("click", () => {
        const boxes = els.bulkDayChecks.querySelectorAll(".bulk-day-cb:checked");
        if (!boxes.length) {
          window.alert("Select at least one day to update.");
          return;
        }
        const source = editingGaps();
        if (!source.length) {
          window.alert(`Add gaps on ${DAY_SHORT[activeEditDay]} first.`);
          return;
        }
        pushUndo({ kind: "gapsAll", gapsByDay: profile().gapsByDay.map(cloneGaps) });
        boxes.forEach(cb => {
          const dayIdx = Number(cb.value);
          profile().gapsByDay[dayIdx] = normalizeGaps(
            source.map(g => ({
              id: createTaskId(),
              startMinutes: g.startMinutes,
              endMinutes: g.endMinutes,
              start: g.start,
              end: g.end,
              duration: g.duration,
            })),
          );
        });
        refreshEverything();
        showToast(`Copied ${DAY_SHORT[activeEditDay]}’s gaps to ${boxes.length} day(s).`, { undo: true });
      });
    }

    if (els.bulkSelectWeekdays && els.bulkDayChecks) {
      els.bulkSelectWeekdays.addEventListener("click", () => {
        els.bulkDayChecks.querySelectorAll(".bulk-day-cb").forEach(cb => {
          const v = Number(cb.value);
          cb.checked = v >= 0 && v <= 4 && v !== activeEditDay;
        });
      });
    }
    if (els.bulkSelectAllOther && els.bulkDayChecks) {
      els.bulkSelectAllOther.addEventListener("click", () => {
        els.bulkDayChecks.querySelectorAll(".bulk-day-cb").forEach(cb => {
          cb.checked = true;
        });
      });
    }

    if (els.linkSaveBtn) {
      els.linkSaveBtn.addEventListener("click", async () => {
        if (!supportsLinkedJsonFile()) {
          window.alert("Linking a backup file needs a Chromium-based browser (Chrome, Edge, Brave).");
          return;
        }
        const had = await getLinkedJsonFileHandle();
        if (had) {
          if (!window.confirm("Pick a new backup file? The current link will be replaced.")) return;
          await clearLinkedJsonFileHandle();
        }
        try {
          await pickJsonSaveFile(`easy-timetable-backup-${new Date().toISOString().slice(0, 10)}.json`);
          await flushLinkedBackup();
          await updateLinkedSaveRow();
          showToast("Backup file linked — edits sync automatically.");
        } catch (e) {
          if (e && e.name !== "AbortError") console.error(e);
          await updateLinkedSaveRow();
        }
      });
    }

    if (els.unlinkSaveBtn) {
      els.unlinkSaveBtn.addEventListener("click", async () => {
        if (!window.confirm("Stop mirroring saves to the linked file?")) return;
        await clearLinkedJsonFileHandle();
        await updateLinkedSaveRow();
        showToast("Backup file unlinked.");
      });
    }

    if (els.shareLinkBtn) els.shareLinkBtn.addEventListener("click", () => void copyShareLinkUrl());

    if (els.heroQuickExport && els.exportBtn) {
      els.heroQuickExport.addEventListener("click", () => els.exportBtn.click());
    }
    if (els.heroQuickImport && els.importBtn) {
      els.heroQuickImport.addEventListener("click", () => els.importBtn.click());
    }
    if (els.heroQuickShare) {
      els.heroQuickShare.addEventListener("click", () => void copyShareLinkUrl());
    }
    if (els.heroQuickLinkFile && els.linkSaveBtn) {
      els.heroQuickLinkFile.addEventListener("click", () => els.linkSaveBtn.click());
    }

    if (els.taskRepeatChips) {
      els.taskRepeatChips.addEventListener("click", e => {
        const btn = e.target.closest("[data-repeat-dow]");
        if (!btn) return;
        btn.classList.toggle("active");
        btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      });
    }
    if (els.taskRepeatAllBtn) els.taskRepeatAllBtn.addEventListener("click", () => setRepeatWeekdaysAll());

    if (els.notifyNextBtn) {
      els.notifyNextBtn.addEventListener("click", async () => {
        const startMs = Number(els.notifyNextBtn.dataset.notifyAt);
        const name = els.notifyNextBtn.dataset.notifyName || "Task";
        if (!startMs || !Number.isFinite(startMs)) return;
        const remindAt = startMs - 10 * 60 * 1000;
        const delay = remindAt - Date.now();
        if (delay < 0) {
          showToast("That block is already within 10 minutes.");
          return;
        }
        if (!("Notification" in window)) {
          window.alert("Notifications are not supported in this browser.");
          return;
        }
        if (Notification.permission === "default") await Notification.requestPermission();
        if (Notification.permission !== "granted") {
          showToast("Notifications are blocked for this site.");
          return;
        }
        setTimeout(() => {
          try {
            new Notification("Easy Timetable", { body: `${name} starts in about 10 minutes.` });
          } catch (_) {}
        }, delay);
        showToast(
          `Reminder set for ${new Date(remindAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}. Leave this tab open.`,
        );
      });
    }

    if (els.undoBtn) els.undoBtn.addEventListener("click", performUndo);

    if (els.backgroundSelect) {
      els.backgroundSelect.addEventListener("change", () => {
        app.backgroundId = els.backgroundSelect.value;
        applyChrome();
        saveApp();
      });
    }

    if (els.weekStartSelect) {
      els.weekStartSelect.addEventListener("change", () => {
        app.weekStartsOn = Number(els.weekStartSelect.value) === 0 ? 0 : 1;
        refreshEverything();
      });
    }

    if (els.planWeekMondayInput) {
      els.planWeekMondayInput.addEventListener("change", () => {
        const n = normalizePlanWeekMondayISO(els.planWeekMondayInput.value);
        if (n) {
          app.planWeekMonday = n;
          els.planWeekMondayInput.value = n;
        }
        refreshEverything();
      });
    }

    if (els.taskDeadlineClear && els.taskDeadline) {
      els.taskDeadlineClear.addEventListener("click", () => {
        els.taskDeadline.value = "";
      });
    }

    if (els.fontScaleSelect) {
      els.fontScaleSelect.addEventListener("change", () => {
        app.fontScale = els.fontScaleSelect.value;
        applyChrome();
        saveApp();
      });
    }

    if (els.reduceMotionToggle) {
      els.reduceMotionToggle.addEventListener("change", () => {
        app.reduceMotion = els.reduceMotionToggle.checked;
        if (app.reduceMotion) app.accentMotion = false;
        applyChrome();
        if (els.accentMotionToggle) els.accentMotionToggle.checked = app.accentMotion;
        saveApp();
      });
    }

    if (els.accentMotionToggle) {
      els.accentMotionToggle.addEventListener("change", () => {
        app.accentMotion = els.accentMotionToggle.checked && !app.reduceMotion;
        applyChrome();
        saveApp();
      });
    }

    if (els.copyDayBtn && els.copyDaySource) {
      els.copyDayBtn.addEventListener("click", () => {
        const src = Number(els.copyDaySource.value);
        if (Number.isNaN(src)) return;
        if (src === activeEditDay) {
          window.alert("Pick a different source day than the one you are editing.");
          return;
        }
        const srcGaps = profile().gapsByDay[src];
        if (!srcGaps.length) {
          window.alert("That day has no gaps to copy.");
          return;
        }
        pushUndo({ kind: "gapsDay", day: activeEditDay, gaps: cloneGaps(editingGaps()) });
        const cloned = srcGaps.map(g => ({
          ...g,
          id: createTaskId(),
          startMinutes: g.startMinutes,
          endMinutes: g.endMinutes,
        }));
        profile().gapsByDay[activeEditDay] = normalizeGaps(cloned);
        refreshEverything();
        showToast(`Copied gaps from ${DAY_SHORT[src]} to ${DAY_SHORT[activeEditDay]}. Undo in the sidebar or Ctrl+Z.`, {
          undo: true,
        });
      });
    }

    if (els.continueStep12) {
      els.continueStep12.addEventListener("click", () => {
        setActiveStep(2);
        document.getElementById("step2Panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    if (els.continueStep23) {
      els.continueStep23.addEventListener("click", () => {
        setActiveStep(3);
        document.getElementById("step3Panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }

    const bindGapFromInput = (input, which) => {
      if (!input) return;
      const apply = () => {
        if (state.syncingGapInputs) return;
        const mins = parseTimeToMinutes(input.value, { roundToStep: true });
        if (mins == null) return;
        if (which === "start") state.draftGap.start = mins;
        else state.draftGap.end = mins;
        ensureDraftGapOrder(which === "start" ? "start" : "end");
        syncAllWheelsFromDraft(prefersReducedMotion());
      };
      input.addEventListener("change", apply);
      input.addEventListener("input", apply);
    };
    bindGapFromInput(els.gapStartInput, "start");
    bindGapFromInput(els.gapEndInput, "end");

    if (els.cancelTaskEditBtn) {
      els.cancelTaskEditBtn.addEventListener("click", () => {
        resetTaskComposer();
        els.taskName.value = "";
        els.taskMin.value = "20";
        els.taskMax.value = "40";
        updateTaskRangeReadout();
        clearMessage(els.taskMessage);
      });
    }

    if (els.taskMin) els.taskMin.addEventListener("input", updateTaskRangeReadout);
    if (els.taskMax) els.taskMax.addEventListener("input", updateTaskRangeReadout);

    if (els.calendarCompactToggle) {
      els.calendarCompactToggle.checked = !!app.calendarCompact;
      els.calendarCompactToggle.addEventListener("change", () => {
        app.calendarCompact = els.calendarCompactToggle.checked;
        applyChrome();
        refreshEverything();
      });
    }

    if (els.calendarZoomIn) {
      els.calendarZoomIn.addEventListener("click", () => {
        calendarZoom = clamp(calendarZoom + CAL_ZOOM_STEP, CAL_ZOOM_MIN, CAL_ZOOM_MAX);
        applyCalendarZoomStyle();
        requestAnimationFrame(() => updateCalendarScrollHint());
      });
    }
    if (els.calendarZoomOut) {
      els.calendarZoomOut.addEventListener("click", () => {
        calendarZoom = clamp(calendarZoom - CAL_ZOOM_STEP, CAL_ZOOM_MIN, CAL_ZOOM_MAX);
        applyCalendarZoomStyle();
        requestAnimationFrame(() => updateCalendarScrollHint());
      });
    }

    document.addEventListener("keydown", e => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && tag !== "INPUT") {
          /* allow undo when not in text field... actually skip */
        }
        return;
      }
      if (e.altKey && ["1", "2", "3"].includes(e.key)) {
        e.preventDefault();
        setActiveStep(Number(e.key));
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
        e.preventDefault();
        exportData();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "i") {
        e.preventDefault();
        els.importFile?.click();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        performUndo();
      }
    });
  };

  const init = async () => {
    const shareImported = await tryImportShareFromHash();
    if (shareImported) activeEditDay = 0;
    applyChrome();
    renderWheelOptions(els.startHourWheel, Array.from({ length: 24 }, (_, i) => i));
    renderWheelOptions(els.endHourWheel, Array.from({ length: 24 }, (_, i) => i));
    renderWheelOptions(els.startMinuteWheel, MINUTE_VALUES);
    renderWheelOptions(els.endMinuteWheel, MINUTE_VALUES);
    renderTaskRepeatChips();
    bindWheel(els.startHourWheel, "start", "hour", Array.from({ length: 24 }, (_, i) => i));
    bindWheel(els.startMinuteWheel, "start", "minute", MINUTE_VALUES);
    bindWheel(els.endHourWheel, "end", "hour", Array.from({ length: 24 }, (_, i) => i));
    bindWheel(els.endMinuteWheel, "end", "minute", MINUTE_VALUES);
    bindEvents();

    if (els.templateRow) {
      els.templateRow.innerHTML = SCHEDULE_TEMPLATES.map(
        tpl =>
          `<button type="button" class="template-chip" data-template="${tpl.id}">${escapeHtml(
            tpl.label,
          )}</button>`,
      ).join("");
    }

    els.keepBuffer.checked = profile().keepBuffer;
    document.querySelectorAll("[data-style]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.style === profile().generationStyle);
    });
    syncAllWheelsFromDraft(true);
    applyGapDuration(30);
    updateTaskRangeReadout();
    bindCalendarScrollHint();
    setActiveStep(profile().activeStep || 1);
    resetGapComposer();
    refreshEverything();
    setupOnboarding();
    if (navigator.storage?.persist) void navigator.storage.persist().catch(() => {});
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void init());
  } else {
    void init();
  }
}
