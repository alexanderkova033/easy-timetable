import { formatDuration } from "../shared/time.js";

/**
 * Build human-readable issues + fix hints for the fit banner / detail panel.
 * @param {ReturnType<import('./fit-diagnostics.js').computeFitDiagnostics>} diag
 */
export function buildFitIssues(diag, { gapCount, taskCount }) {
  const issues = [];

  if (!gapCount && !taskCount) {
    issues.push({
      severity: "info",
      message: "Add at least one gap and one task to see feasibility checks.",
      fixStep: null,
      fixLabel: null,
    });
    return issues;
  }

  if (!gapCount) {
    issues.push({
      severity: "warning",
      message: "You need free-time gaps before tasks can be placed.",
      fixStep: 1,
      fixLabel: "Go to gaps",
    });
    return issues;
  }

  if (!taskCount) {
    issues.push({
      severity: "info",
      message: "Gaps are set. Add tasks to check whether everything can fit.",
      fixStep: 2,
      fixLabel: "Go to tasks",
    });
    return issues;
  }

  for (const t of diag.impossible) {
    const where = t.dayLabel ? ` on ${t.dayLabel}` : "";
    const wide = t.largestGapThatDay ?? diag.largestGap;
    issues.push({
      severity: "error",
      message: `“${t.name}”${where} needs at least ${formatDuration(t.min)}; widest gap that day is ${formatDuration(
        wide,
      )}.`,
      fixStep: 2,
      fixLabel: "Shorten minimum or split task",
    });
  }

  if (diag.impossible.length === 0 && diag.minNeed > diag.usable) {
    issues.push({
      severity: "error",
      message: `If every task uses its minimum time, you need ${formatDuration(
        diag.minNeed,
      )}, but only ${formatDuration(diag.usable)} is usable after buffer.`,
      fixStep: 1,
      fixLabel: "Add or widen gaps",
    });
    issues.push({
      severity: "error",
      message: "You can also remove tasks or lower minimum durations.",
      fixStep: 2,
      fixLabel: "Adjust tasks",
    });
  }

  if (diag.impossible.length === 0 && diag.minNeed <= diag.usable && diag.maxNeed > diag.usable) {
    issues.push({
      severity: "warning",
      message: `Maximum durations total ${formatDuration(
        diag.maxNeed,
      )}—tighter than usable ${formatDuration(diag.usable)}. The plan works only if several tasks end short.`,
      fixStep: 2,
      fixLabel: "Tighten max durations",
    });
  }

  if (
    diag.impossible.length === 0 &&
    diag.minNeed <= diag.usable &&
    diag.maxNeed <= diag.usable
  ) {
    issues.push({
      severity: "success",
      message: `Looks workable: usable time ${formatDuration(diag.usable)} covers your minimum needs.`,
      fixStep: 3,
      fixLabel: "See preview",
    });
  }

  return issues;
}
