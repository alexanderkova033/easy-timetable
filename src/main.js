/**
 * Application entry: wires the timetable UI.
 * Open this app via a static server (ES modules require http(s)).
 */
import { bootstrapTimetableApp } from "./ui/schedule-app.js";

bootstrapTimetableApp();

if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(new URL("./sw.js", import.meta.url), { scope: "./" }).catch(() => {});
  });
}
