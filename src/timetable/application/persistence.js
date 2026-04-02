import { loadAppState, persistAppState } from "./app-state.js";

/** @deprecated Use loadAppState — kept for imports expecting the old name */
export function loadPersistedSchedule() {
  return loadAppState();
}

/** @deprecated Use persistAppState */
export function persistSchedule(snapshot) {
  persistAppState(snapshot);
}

export { loadAppState, persistAppState } from "./app-state.js";
