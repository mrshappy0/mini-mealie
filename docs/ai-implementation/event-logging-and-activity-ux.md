# Mini Mealie — Event Logging + Activity UX (Implementation Plan)

Date: 2026-01-31

## Problem Summary
Mini Mealie relies on `showBadge()` to communicate success/failure. When network calls are slow, time out, or fail, badge updates can be missed (user isn’t watching the toolbar). That leads to “rage clicking” and a sense the extension is broken.

We want two improvements:
1. **A lightweight event log** for major extension actions (connect/profile fetch, recipe creation URL/HTML, page HTML capture, recipe detection/test-scrape).
2. **Clear “in progress” UX** while operations run (badge spinner/loading, optional tooltip text, context menu disabled/retitled).

Low effort is a priority: invest most work into the event system, keep UI minimal.

## Goals
- Provide a **durable, user-visible trace** of “what happened” for major features.
- Make “something is happening” obvious during long calls.
- Avoid large permissions or heavy UI work.
- Keep changes incremental and testable.

## Non-Goals (for MVP)
- Full analytics/telemetry.
- Remote log streaming.
- Per-site recipe parsing or deep UI workflows.
- Complex DevTools integration (opening the SW console automatically).

## Key Constraints / Realities
- Extension action badges are easy to miss; **tooltips** (`chrome.action.setTitle`) persist on hover.
- Popups are ephemeral; users may never open it during a context-menu action.
- The service worker stays alive while a Promise chain is pending, so a simple spinner interval is viable during active work.
- Sync storage is not ideal for logs. Prefer **`chrome.storage.local`** (persistent) or **`chrome.storage.session`** (ephemeral).

## Proposed Strategy (Recommended MVP)
### 1) Build an event logger (core)
Create a small logging module that:
- Stores logs in a **ring buffer** (fixed size, e.g. 300 entries).
- Persists to `chrome.storage.local` under a single key (e.g. `miniMealie.eventLog`).
- Emits structured events with correlation ids:

```ts
// shape idea
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogEvent = {
  id: string; // uuid or timestamp-counter
  ts: number; // Date.now()
  level: LogLevel;
  feature: 'auth' | 'recipe-create' | 'recipe-detect' | 'html-capture' | 'network' | 'storage';
  action: string; // e.g. 'createFromUrl', 'getUser', 'testScrape'
  phase?: 'start' | 'progress' | 'success' | 'failure';
  opId?: string; // correlation id for a single operation
  message: string;
  data?: Record<string, unknown>; // safe metadata (no tokens)
};
```

Important policy:
- **Never log API tokens**.
- When logging server URLs, consider storing only origin.

Core APIs:
- `logEvent(event)`
- `withOperation({feature, action, title}, fn)` → handles `start/success/failure` + duration.
- `getRecentEvents()` and `clearEvents()`.

### 2) Add an “activity indicator” (core UX)
Define a shared “activity state” that answers:
- Is an operation active? (`activeCount > 0`)
- What is the current top-level activity label? (e.g. “Creating recipe (HTML)…”) 

Implementation idea:
- Maintain an in-memory counter in background/service worker.
- Also write a simplified state to storage so popup/pages can read it:

```ts
type ActivityState = {
  activeCount: number;
  label?: string;
  opId?: string;
  startedAt?: number;
};
```

### 3) Badge loading spinner (core UX)
While `activeCount > 0`:
- Start a timer that cycles badge text every ~150–250ms using Unicode spinner frames.
  - Example frames: `['◐','◓','◑','◒']` or `['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏']`.
- Optionally set badge background to a “working” color.

On completion:
- Stop spinner.
- Show ✅/❌ for a few seconds (existing behavior).
- Update tooltip title with the last result (“Recipe created successfully” / “Recipe creation failed (timeout)” etc).

### 4) Context menu behavior during activity (core UX)
When an operation is active:
- Update the context menu item title to reflect activity (e.g. “Creating recipe…”).
- Disable the menu item (`enabled: false`) until activity completes.

This prevents repeated clicks and communicates “busy”.

## UI Options for Logs (choose 1 for MVP)
### Option A (lowest effort): show logs in popup
- Add a small “Recent activity” panel in the existing popup.
- It reads from `chrome.storage.local` and re-renders on `chrome.storage.onChanged`.
- Provide actions:
  - “Copy logs” (copy JSON / text summary)
  - “Clear logs”

Pros: minimal surface area, no new entrypoints.
Cons: user must open popup; not great for live watching.

### Option B (recommended if you want ‘streaming’): add an internal Logs page
- Add a new extension page (opens as a normal tab) that streams logs.
- Page listens to storage changes and renders a scrollable list with filters.

Pros: best UX for long operations, easy to keep open.
Cons: slightly more setup (new entrypoint/page).

### Option C (ultra-low effort but not ideal): only console logging + helper link
- Log to `console` in background.
- Add a “How to view logs” link in popup that opens instructions.

Pros: nearly free.
Cons: not user friendly; also Chrome doesn’t reliably allow opening the SW console directly.

**Recommendation:** Start with **Option A** (popup) for MVP, and keep Option B as Phase 2 if desired.

## Where to Instrument (MVP)
- Auth/profile fetch: `getUser()` (popup connect flow)
- Recipe creation (URL): `createRecipeFromURL()`
- Recipe creation (HTML): `getPageHTML()` + `createRecipeFromHTML()`
- Recipe detection: `testScrapeUrlDetailed()` (likely `debug` or `info` with sampling to avoid spam)

## Acceptance Criteria (MVP)
- When “Create recipe” is triggered:
  - Badge shows a spinner until done.
  - Context menu becomes disabled while active.
  - On completion, badge shows ✅/❌ and tooltip explains outcome.
  - Logs record start/end + any error details (sanitized).
- When “Connect Mealie” runs:
  - Logs record start/success/failure.
- Logs are visible (Option A) in the popup and can be cleared.

## Implementation Phases
### Phase 1: Logging + Activity State
- Add `utils/logging/*` (event log + helpers)
- Add `utils/activity/*` (activeCount + badge spinner)
- Instrument the existing flows (connect + create recipe)
- Add minimal popup UI panel for logs (Option A)

### Phase 2: Stronger UX
- Add context-menu disable/enable helper
- Add tooltip updates everywhere
- Add “View logs” button to open logs page (if doing Option B)

### Phase 3: Nice-to-haves
- Severity filtering
- Export logs as file
- Correlation id grouping (“operation cards”)
- Sampling/throttling for recipe detection logs

## Open Decisions (please confirm)
1. Logs storage: `chrome.storage.local` (persistent) vs `chrome.storage.session` (ephemeral)
2. Log visibility MVP: Option A (popup) vs Option B (tab)
3. Spinner frames: simple 4-frame unicode vs braille 10-frame
4. How noisy should recipe-detection logging be? (none / debug / sampled)
