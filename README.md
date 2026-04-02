# Easy Timetable

**Tagline:** Plan a full week locally—gaps per weekday, shared tasks, live preview—no account or backend.

Easy Timetable is for anyone who wants a quick, visual schedule: students juggling classes and study blocks, people sketching a work week, or side-project time in the evenings. You define **free-time gaps per day** (Monday–Sunday), add **tasks** once with min/max durations, set **priority**, and see a **seven-day calendar preview** that updates as you edit.

## What you get

- **Weekly grid** — Week starts on Monday or Sunday (toolbar). Edit gaps on one day at a time; preview shows all seven columns.
- **Named timetables** — Multiple profiles (e.g. “Spring term”, “Exam week”) with a dropdown switcher and JSON export/import for backup or moving between browsers.
- **Templates** — One-click starting layouts: school-style blocks, 9–5 with lunch, short morning focus.
- **Fit feedback** — Banner plus a short list of issues (too-wide tasks, tight totals) with buttons that jump to the right step.
- **Accessibility & comfort** — Text size, higher-contrast focus rings, optional reduced motion, optional accent hover motion, and several background themes (including a light “paper” mode).

## Run locally

```bash
npm install
npm start
```

Open the URL printed in the terminal (default [http://localhost:5173](http://localhost:5173)). The app is static HTML and ES modules, so a local server is required.

## Tests

Domain logic (gap merging, preview placement, aggregates, week diagnostics) is covered by unit tests:

```bash
npm test
```

## Keyboard shortcuts

- **Alt+1 / Alt+2 / Alt+3** — Go to steps Time, Tasks, or Plan (when not typing in a field).
- **Ctrl+E** — Export timetables as JSON.
- **Ctrl+I** — Import JSON (replaces stored data after confirmation).
- **Ctrl+Z** — Undo last destructive edit (when focus is not in a text field).

## Share or back up

Use **Export JSON** in the toolbar. Store the file wherever you like; **Import** loads it back in (you will be asked to confirm replacing current data).

## Tech notes

- State lives in `localStorage` under the key defined in `src/timetable/domain/constants.js`.
- Older saves (single-day shape) are migrated to per-weekday gaps automatically.
