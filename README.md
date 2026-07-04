# Easy Timetable

Easy Timetable is for people who don't want a classic timetable where you pick an exact start time for every task. You still decide **when you're free** by entering your gaps (or starting from a template), list **what** you need to do—and the app **places those tasks into your free time** so you don't have to pin each task to a specific time.

**Tagline:** Plan a full week locally—gaps per weekday, shared tasks, live preview—no account or backend.

It suits anyone who wants that kind of lighter setup: students juggling classes and study blocks, people sketching a work week, or side-project time in the evenings. You define **free-time gaps per day** (Monday–Sunday), add **tasks** with optional **due dates** and **min/max minutes per session**, set **priority**, pick the **plan week** (Monday) so dates line up, and see a **seven-day calendar preview** that updates as you edit.

## Three steps

1. **Time** — Use the **week strip** to choose which weekday you are editing. Add **free-time gaps** with the time rings (or the time inputs), **Use current time**, and duration chips (+30m, +1h, …), then **Add gap**. Gaps for that day appear in the list below; you can edit, duplicate, or remove them. Under **Templates & copy from another day**, apply a **quick layout** (school blocks, 9–5 + lunch, morning focus) to the **current** day only, or **copy gaps** from another weekday onto the one you are editing. Repeat for each day that should have a schedule. Everything is stored only in this browser until you export.

2. **Tasks** — Add a name, an optional **due date**, and **min–max minutes** per session. If you use due dates, set **Plan week (Monday)** under *Look & week* so preview columns match real calendar days. One shared task list applies to every weekday; step 3 places it into each day’s gaps.

3. **Plan** — **Drag** tasks in the priority list (or use the arrows) to set **order**; the planner uses that order together with your chosen **style**: **Balanced**, **Compact**, **Spread**, or **Deep first** (longer sessions first in *Deep first*). Toggle **Keep a small free buffer at the end** if you want a bit of slack left in gaps. The **week schedule preview** shows **Monday–Sunday**; column order follows **Week starts** (Mon or Sun) in *Look & week*, and **dates** come from **Plan week (Monday)**. **Green** blocks are free time, **blue** blocks are tasks placed into that day’s gaps for the current style. The **fit** banner and issue list warn when things are tight or impossible, with shortcuts back to the right step; use **Compact grid** or **zoom** if you need more room. If something cannot fit, **unscheduled** rows may offer actions such as raising priority or editing gaps. Tasks with a **due date** only show in columns **on or before** that date.

## What you get

- **Weekly grid** — Week starts on Monday or Sunday (toolbar). Edit gaps on one day at a time; preview shows all seven columns with real dates once you set plan week. Tasks with a due date only show in columns on or before that day.
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

- State lives in `localStorage` under the key defined in `src/shared/constants.js`.
- Older saves (single-day shape) are migrated to per-weekday gaps automatically.

## Source layout (screaming architecture)

Top-level folders under `src/` are named after what the app *does*, not the technical layer the code sits in — you can tell the app is a scheduler by scanning folder names alone:

| Folder | Role |
|--------|------|
| `src/gaps/` | Free-time gap rules and quick-layout templates. |
| `src/tasks/` | Task due-date and repeat-weekday rules. |
| `src/week-plan/` | Turning gaps + tasks into a weekly preview: placement, plan-week dates, fit diagnostics/issues. |
| `src/export/` | Turning a week preview into `.ics` or plain text. |
| `src/app-state.js` | Load/save/migrate the whole app state (profiles, backgrounds, font scale) to `localStorage`. |
| `src/shared/` | Small pure primitives used by several features (time formatting, constants, aggregates). |
| `src/platform/` | Thin browser-API wrappers (clock, HTML escaping, share links, linked backup file) with no scheduling logic. |
| `src/ui/` | `schedule-app.js` + `timetable.css` — the single DOM adapter that wires every feature into the page. |

Entry: `index.html` → `src/main.js` → `src/ui/schedule-app.js`. Tests stay next to the module they cover (`*.test.js`).
