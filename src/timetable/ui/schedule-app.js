import {
  HOUR_HEIGHT,
  WHEEL_ITEM,
  MINUTE_STEP,
  MINUTE_VALUES,
  createTaskId,
  clamp,
} from "../domain/constants.js";
import { toTime, formatDuration } from "../domain/time.js";
import { totalGapMinutes, totalTaskMin, totalTaskMax } from "../domain/aggregates.js";
import { normalizeGaps } from "../domain/gap-rules.js";
import { buildPreviewPlan } from "../domain/preview-plan.js";
import { computeWeekFitDiagnostics } from "../domain/fit-diagnostics.js";
import {
  loadAppState,
  persistAppState,
  getActiveProfile,
  addProfile,
  removeProfile,
  migrateToAppState,
  BACKGROUND_OPTIONS,
  FONT_SCALES,
} from "../application/app-state.js";
import { getRoundedNowMinutes } from "../infrastructure/system-clock.js";
import { escapeHtml } from "../infrastructure/dom-escape.js";
import { buildFitIssues } from "../domain/fit-issues.js";
import { SCHEDULE_TEMPLATES } from "../domain/schedule-templates.js";

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

  const orderedDayIndices = () => {
    if (app.weekStartsOn === 0) return [6, 0, 1, 2, 3, 4, 5];
    return [0, 1, 2, 3, 4, 5, 6];
  };

  const validBackgroundIds = new Set(BACKGROUND_OPTIONS.map(b => b.id));

  const applyChrome = () => {
    if (!validBackgroundIds.has(app.backgroundId)) {
      app.backgroundId = "verdant";
      persistAppState(app);
    }
    document.documentElement.dataset.fontScale = app.fontScale;
    document.documentElement.dataset.reduceMotion = app.reduceMotion ? "1" : "0";
    document.documentElement.dataset.accentMotion =
      app.accentMotion && !app.reduceMotion ? "1" : "0";
    document.body.dataset.background = app.backgroundId;
  };

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
    dayTabs: document.getElementById("dayTabs"),
    profileSelect: document.getElementById("profileSelect"),
    newProfileBtn: document.getElementById("newProfileBtn"),
    deleteProfileBtn: document.getElementById("deleteProfileBtn"),
    exportBtn: document.getElementById("exportBtn"),
    importBtn: document.getElementById("importBtn"),
    importFile: document.getElementById("importFile"),
    undoBtn: document.getElementById("undoBtn"),
    backgroundSelect: document.getElementById("backgroundSelect"),
    weekStartSelect: document.getElementById("weekStartSelect"),
    reduceMotionToggle: document.getElementById("reduceMotionToggle"),
    accentMotionToggle: document.getElementById("accentMotionToggle"),
    fontScaleSelect: document.getElementById("fontScaleSelect"),
    copyDaySource: document.getElementById("copyDaySource"),
    copyDayBtn: document.getElementById("copyDayBtn"),
    templateRow: document.getElementById("templateRow"),
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

  const saveApp = () => persistAppState(app);

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
  };

  const syncDraftDisplays = () => {
    const [sh, sm] = toTime(state.draftGap.start).split(":");
    const [eh, em] = toTime(state.draftGap.end).split(":");
    els.startDisplay.textContent = `${sh}:${sm}`;
    els.endDisplay.textContent = `${eh}:${em}`;
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
    if (!window.confirm("Remove this gap?")) return;
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
      els.gapList.innerHTML = `<div class="empty-state">No gaps for ${DAY_SHORT[activeEditDay]} yet.</div>`;
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

    profile().tasks.push({
      id: createTaskId(),
      name,
      min,
      max,
      average: Math.round((min + max) / 2),
    });

    els.taskName.value = "";
    clearMessage(els.taskMessage);
    refreshEverything();
  };

  const removeTask = id => {
    if (!window.confirm("Delete this task?")) return;
    pushUndo({ kind: "tasks", tasks: cloneTasks(profile().tasks) });
    profile().tasks = profile().tasks.filter(task => task.id !== id);
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
            <div class="item-meta">Task ${index + 1} · ${task.min}–${task.max} min</div>
          </div>
          <div class="item-actions">
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
            <div class="priority-help">${task.min}–${task.max} min</div>
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
      els.fitBanner.textContent = `Minimum work may exceed usable time on the tightest day (${formatDuration(
        info.usable,
      )} usable).`;
      renderFitIssuesList(issues);
      return;
    }
    if (info.maxNeed > info.usable) {
      els.fitBanner.className = "fit-banner warning";
      els.fitBanner.textContent = "Tight across the week if every task runs long.";
      renderFitIssuesList(issues);
      return;
    }
    els.fitBanner.className = "fit-banner success";
    els.fitBanner.textContent = `Weekly check: minimum fits within ${formatDuration(info.usable)} on the tightest day.`;
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
    const p = profile();
    const freeAll = p.gapsByDay.reduce((s, g) => s + totalGapMinutes(g), 0);
    els.statFree.textContent = formatDuration(freeAll);
    els.statTasks.textContent = String(p.tasks.length);
    const info = weekDiagnostics();
    if (!p.gapsByDay.some(d => d.length) && !p.tasks.length) {
      els.statStatus.textContent = "Waiting";
    } else if (!p.gapsByDay.some(d => d.length)) {
      els.statStatus.textContent = "Need gaps";
    } else if (!p.tasks.length) {
      els.statStatus.textContent = "Need tasks";
    } else if (info.impossible.length || info.minNeed > info.usable) {
      els.statStatus.textContent = "Won’t fit";
    } else if (info.maxNeed > info.usable) {
      els.statStatus.textContent = "Tight";
    } else {
      els.statStatus.textContent = "Fits";
    }
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
    ((minutes - startHour * 60) / 60) * HOUR_HEIGHT;

  const renderCalendarPreview = () => {
    const p = profile();
    const order = orderedDayIndices();
    const previewsByDay = new Map();
    order.forEach(dayIdx => {
      const gaps = p.gapsByDay[dayIdx];
      const plan = gaps.length
        ? buildPreviewPlan({
            gaps,
            tasks: p.tasks,
            generationStyle: p.generationStyle,
            keepBuffer: p.keepBuffer,
          })
        : null;
      previewsByDay.set(dayIdx, plan);
    });

    if (!p.gapsByDay.some(d => d.length)) {
      els.calendarGrid.innerHTML =
        '<div class="empty-state" style="margin:12px;">Add gaps on at least one day to see the week preview.</div>';
      els.previewSummary.innerHTML = "";
      els.unscheduledList.innerHTML = "";
      return;
    }

    const { startHour, endHour } = getCalendarRangeWeek(order, previewsByDay);
    const totalHeight = (endHour - startHour) * HOUR_HEIGHT;

    const labels = [];
    for (let hour = startHour; hour <= endHour; hour += 1) {
      const top = (hour - startHour) * HOUR_HEIGHT;
      if (hour < endHour) {
        labels.push(
          `<div class="time-label" style="top:${top}px">${String(hour).padStart(2, "0")}:00</div>`,
        );
      }
    }

    const hourLines = [];
    for (let hour = startHour; hour <= endHour; hour += 1) {
      const top = (hour - startHour) * HOUR_HEIGHT;
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
              ((gap.endMinutes - gap.startMinutes) / 60) * HOUR_HEIGHT,
            );
            return `
            <div class="calendar-block gap" style="top:${top}px;height:${height}px;">
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
                  ((task.endMinutes - task.startMinutes) / 60) * HOUR_HEIGHT,
                );
                return `
                <div class="calendar-block task" style="top:${top}px;height:${height}px;">
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
      .map(dayIdx => `<div class="week-col-head-static">${DAY_SHORT[dayIdx]}</div>`)
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
          ? { day: DAY_SHORT[dayIdx], list: plan.unscheduled }
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
            <span>${escapeHtml(task.taskName)}</span>
            <span>${formatDuration(task.duration)}</span>
          </div>`,
          )
          .join("")}
      </div>`,
      )
      .join("");
  };

  const refreshEverything = () => {
    renderDayTabs();
    renderToolbar();
    renderGaps();
    renderTasks();
    renderTaskMeta();
    renderPriorityList();
    renderFitBanner();
    renderStats();
    renderCalendarPreview();
    saveApp();
  };

  const renderDayTabs = () => {
    if (!els.dayTabs) return;
    const order = orderedDayIndices();
    els.dayTabs.innerHTML = order
      .map(dayIdx => {
        const active = dayIdx === activeEditDay;
        return `<button type="button" role="tab" aria-selected="${active}" class="day-tab ${
          active ? "active" : ""
        }" data-edit-day="${dayIdx}">${DAY_SHORT[dayIdx]}</button>`;
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
    if (u.kind === "tasks") profile().tasks = u.tasks;
    refreshEverything();
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
      } catch (e) {
        console.error(e);
        window.alert("Could not read that JSON file.");
      }
    };
    reader.readAsText(file, "utf-8");
  };

  const tryApplyTemplate = templateId => {
    const t = SCHEDULE_TEMPLATES.find(x => x.id === templateId);
    if (!t) return;
    if (editingGaps().length) {
      if (!window.confirm(`Replace gaps on ${DAY_SHORT[activeEditDay]} with “${t.label}”?`)) return;
    }
    pushUndo({ kind: "gapsDay", day: activeEditDay, gaps: cloneGaps(editingGaps()) });
    profile().gapsByDay[activeEditDay] = normalizeGaps(t.apply());
    refreshEverything();
  };

  const bindEvents = () => {
    els.stepButtons.forEach(button => {
      button.addEventListener("click", () => setActiveStep(Number(button.dataset.step)));
    });

    document.addEventListener("click", event => {
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
      if (dayTab && dayTab.closest("#dayTabs")) {
        activeEditDay = Number(dayTab.dataset.editDay);
        resetGapComposer();
        renderDayTabs();
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
        const name = window.prompt("Name for the new timetable:", `Schedule ${app.profiles.length + 1}`);
        if (name === null) return;
        addProfile(app, name || undefined);
        activeEditDay = 0;
        resetGapComposer();
        refreshEverything();
      });
    }

    if (els.deleteProfileBtn) {
      els.deleteProfileBtn.addEventListener("click", () => {
        if (!window.confirm("Delete this timetable profile? This cannot be undone.")) return;
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
        if (
          editingGaps().length &&
          !window.confirm(`Replace ${DAY_SHORT[activeEditDay]} with gaps from ${DAY_SHORT[src]}?`)
        ) {
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

  const init = () => {
    applyChrome();
    renderWheelOptions(els.startHourWheel, Array.from({ length: 24 }, (_, i) => i));
    renderWheelOptions(els.endHourWheel, Array.from({ length: 24 }, (_, i) => i));
    renderWheelOptions(els.startMinuteWheel, MINUTE_VALUES);
    renderWheelOptions(els.endMinuteWheel, MINUTE_VALUES);
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
    setActiveStep(profile().activeStep || 1);
    resetGapComposer();
    refreshEverything();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
