import { MINUTE_STEP } from "../../domain/constants.js";

/** Rounded “now” as minutes from midnight (browser clock). */
export function getRoundedNowMinutes() {
  const now = new Date();
  const raw = now.getHours() * 60 + now.getMinutes();
  return Math.round(raw / MINUTE_STEP) * MINUTE_STEP;
}
