# Agent Instructions (opencode, Claude, etc.)

This repo is a **WXT + React** browser extension (MV3). Please optimize for **small, safe diffs**, strong TypeScript types, and extension-specific constraints.

## What this project is

- WXT drives builds/dev server. Output goes to `.output/`.
- Extension entrypoints live in `entrypoints/` (popup, background, etc.).
- Shared logic lives in `utils/` with Vitest coverage focused there. `entrypoints/**` (popup, logs, background) also has real Vitest coverage now, but isn't part of the enforced coverage gate — see Testing conventions below.

## Local commands (preferred)

- Dev: `pnpm dev`
- Build: `pnpm build`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`
- Tests: `pnpm test`
- Coverage: `pnpm coverage`

Windows note: if PowerShell blocks `pnpm.ps1`, prefer `pnpm.cmd` or adjust execution policy.

## Development environment setup

- Create `.env.local` from `.env.local.example` and fill in your Mealie server details (URL, API token, username).
- `pnpm dev` automatically:
    - Opens Chrome with persistent profile (`.wxt/chrome-data`)
    - Pre-populates credentials from `.env.local` (dev mode only, never in production)
    - Opens a recipe page (https://www.allrecipes.com/recipe/286369/) for testing
    - Opens the logs page (`chrome-extension://[id]/logs.html`) for monitoring activity
- Settings persist across sessions - no re-login needed.
- Production builds (`pnpm build`) never include dev config or credentials - verified by tree-shaking.

## Auto-imports (important)

- This repo relies on WXT auto-import generation.
- If imports look "missing" (especially ESLint complaining about undefined globals/imports), run `pnpm install` (or `pnpm.cmd install` on Windows).
    - The `postinstall` hook runs `wxt prepare`, which generates files under `.wxt/` (including ESLint auto-import definitions).
- When adding new exported utilities/types, prefer patterns that allow auto-imports to pick them up rather than adding manual imports everywhere.
- **Exception — files inside `utils/` must use explicit imports for anything they consume at runtime.**
  Relying on auto-imports inside `utils/` breaks istanbul coverage instrumentation (the unimport
  transform mangles the sourcemap): before explicit imports were added, `invoke.ts` reported 0
  instrumentable statements and `storage.ts` reported 8 (of ~100+), silently deflating the
  coverage gate. Auto-imports remain fine in `entrypoints/**` (already excluded from the gate)
  and for type-only references anywhere (types are erased at compile time).

## Commits, versioning, and releases (important)

- Use **Conventional Commits**.
    - Local helper: `pnpm commitlint` validates a message; the `.githooks/commit-msg` hook runs commitlint automatically on every commit.
    - CI enforces this on all PRs via `.github/workflows/commitlint.yml` — PRs with non-conventional commits cannot merge.
    - Keep commit message body lines ≤ 100 characters. Agent-generated commits (those containing `Agent-Logs-Url:`) are automatically skipped by commitlint, so long trailers in agent commit bodies won't fail CI.
- Releases are driven by commit history and semantic versioning via **semantic-release**.
    - On merges to `main`, GitHub Actions runs `npx semantic-release` (see `.github/workflows/release.yml` and `.releaserc`).
    - When a GitHub Release is published, CI zips the extension (`pnpm zip`) and submits it to the Chrome Web Store and Firefox Add-ons (see `.github/workflows/submit.yml`).
    - `submit.yml` also runs on a 4-hour schedule as a **catch-up**: Chrome rejects uploads while
      a prior submission is in review, so releases published during that window are tolerated as
      no-ops and retried later. Each run targets the **latest** GitHub Release and skips stores
      that already have that version (or newer) uploaded — so releases that stack up during one
      Chrome review collapse into a single submission of the newest version, while every PR keeps
      its own tag/GitHub Release for tracking. Store version numbers can never decrease; rolling
      back means reverting commits and releasing a new, higher version.
- When making changes, keep commit messages clean and scoped so release automation behaves predictably.

## Code style / quality bar

- TypeScript is **strict** (`noImplicitAny`): do not introduce `any` unless there is no reasonable alternative.
- Follow ESLint + Prettier output; don't do stylistic refactors.
- Keep imports sorted (repo uses `eslint-plugin-simple-import-sort`).
- **Line endings must be LF (Unix-style), not CRLF.** When creating new files, ensure they use `\n` only.
- Prefer existing patterns:
    - typed result unions over throwing for expected errors (see `utils/network.ts`).
    - React function components + hooks in popup UI.
- Avoid widening extension permissions/host_permissions unless explicitly requested.

## Architecture conventions

- Put reusable/non-UI logic in `utils/` and add/extend Vitest tests for it.
- Keep browser/extension API usage (`chrome.*`) within entrypoints/background/popup layers; avoid leaking it deep into `utils/` unless a utility is explicitly "browser util".
- When adding new storage keys, update the central storage types/keys in `utils/types/*` and keep read/write paths consistent.

## Testing conventions

- Prefer deterministic unit tests (no real network).
- Add tests alongside existing ones in `utils/tests/`.
- When changing behavior in `utils/`, update tests in the same PR.
- `entrypoints/**/tests/` uses jsdom + `@testing-library/react` + `@testing-library/user-event`
  for component/entrypoint tests. `vitest.setup.ts` bridges fake-browser's promise-only
  `chrome.storage.*` to the callback style used throughout this codebase, normalizes
  `chrome.runtime.lastError` to `undefined`, and runs RTL's `cleanup()` after each test.
- `entrypoints/**` is excluded from the enforced coverage gate (`scripts/check-coverage.sh`):
  statement coverage reports 0 for these files under both v8 and istanbul providers, a
  sourcemap-chain issue between WXT's auto-import/JSX transform (or `defineBackground`) and
  this toolchain. The tests still run and catch regressions — they just don't count toward
  the gate.

## Change management

- Default to the smallest viable patch; don't rename files or do broad refactors unless asked.
- If you suspect a change impacts the manifest, call it out and explain why.
- After code changes, run the most relevant command(s): usually `pnpm lint` and `pnpm test`.

## Extension dev troubleshooting

- If "dev opens a browser but the extension isn't there", verify the correct browser/profile is used and load `.output/chrome-mv3` via `chrome://extensions` → **Load unpacked**.

## When in doubt

- Ask a short clarifying question if requirements are ambiguous, especially around:
    - adding permissions
    - changes affecting user data in storage
    - security / auth token handling

## Watched Dependencies

### `eslint-plugin-react` — Forked for ESLint 10 Compatibility

The `eslint-plugin-react` dependency in `package.json` is installed from a fork branch
instead of the npm registry:

```
"eslint-plugin-react": "github:ledsun/eslint-plugin-react#update-deprecated-calls-v8"
```

**Why:** ESLint 10 removed `context.getFilename()` (deprecated since v9), which
`eslint-plugin-react@7.37.5` relies on in `lib/util/version.js`. The fork applies
the fix from [upstream PR #3979](https://github.com/jsx-eslint/eslint-plugin-react/pull/3979)
which hasn't been merged or released yet.

**Checklist before modifying this dependency:**

1. Check if [jsx-eslint/eslint-plugin-react#3979](https://github.com/jsx-eslint/eslint-plugin-react/pull/3979) has been merged.
2. Check if a new npm version (>7.37.5) with ESLint 10 support has been published.
3. If yes to either: revert to the npm registry version (`"eslint-plugin-react": "^7.x.x"`).
4. If no: do NOT bump to a newer npm version of eslint-plugin-react unless you also
   verify it's ESLint 10 compatible (peer deps include `^10`).

**Automation:** A GitHub Action runs every 3 days to check if PR #3979 is merged
and opens a `tech-debt` labeled issue if so.

## Undici Security Overrides

`pnpm-workspace.yaml` scopes two separate `undici` overrides (`>=7.28.0`) to known CVEs
rather than one blanket override: `@actions/http-client>undici` (real path is
semantic-release → `@semantic-release/npm` → `@actions/core` → `@actions/http-client`)
and `jsdom>undici` (capped `<8.0.0`, since jsdom bundles its own `^7.25.0` and a blanket
override was forcing it to an incompatible major). See the comments in
`pnpm-workspace.yaml` for the full reasoning; revisit when either dependency chain
bumps its own undici floor.
