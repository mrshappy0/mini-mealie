---
applyTo: '*'
---

# Copilot instructions (mini-mealie)

This repo is a **WXT + React** browser extension (MV3). Please optimize for **small, safe diffs**, strong TypeScript types, and extension-specific constraints.

## What this project is

- WXT drives builds/dev server. Output goes to `.output/`.
- Extension entrypoints live in `entrypoints/` (popup, background, etc.).
- Shared logic lives in `utils/` with Vitest coverage focused there.

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
- If imports look “missing” (especially ESLint complaining about undefined globals/imports), run `pnpm install` (or `pnpm.cmd install` on Windows).
    - The `postinstall` hook runs `wxt prepare`, which generates files under `.wxt/` (including ESLint auto-import definitions).
- When adding new exported utilities/types, prefer patterns that allow auto-imports to pick them up rather than adding manual imports everywhere.

## Commits, versioning, and releases (important)

- Use **Conventional Commits**.
    - Local helper: `pnpm commitlint` validates a message; the `.githooks/commit-msg` hook runs commitlint automatically on every commit.
    - CI enforces this on all PRs via `.github/workflows/commitlint.yml` — PRs with non-conventional commits cannot merge.
    - Keep commit message body lines ≤ 100 characters. Agent-generated commits (those containing `Agent-Logs-Url:`) are automatically skipped by commitlint, so long trailers in agent commit bodies won't fail CI.
- Releases are driven by commit history and semantic versioning via **semantic-release**.
    - On merges to `main`, GitHub Actions runs `npx semantic-release` (see `.github/workflows/release.yml` and `.releaserc`).
    - When a GitHub Release is published, CI zips the extension (`pnpm zip`) and submits it to the Chrome Web Store (see `.github/workflows/submit.yml`).
- When making changes, keep commit messages clean and scoped so release automation behaves predictably.

## Code style / quality bar

- TypeScript is **strict** (`noImplicitAny`): do not introduce `any` unless there is no reasonable alternative.
- Follow ESLint + Prettier output; don’t do stylistic refactors.
- Keep imports sorted (repo uses `eslint-plugin-simple-import-sort`).- **Line endings must be LF (Unix-style), not CRLF.** When creating new files, ensure they use `\n` only.- Prefer existing patterns:
    - typed result unions over throwing for expected errors (see `utils/network.ts`).
    - React function components + hooks in popup UI.
- Avoid widening extension permissions/host_permissions unless explicitly requested.

## Architecture conventions

- Put reusable/non-UI logic in `utils/` and add/extend Vitest tests for it.
- Keep browser/extension API usage (`chrome.*`) within entrypoints/background/popup layers; avoid leaking it deep into `utils/` unless a utility is explicitly “browser util”.
- When adding new storage keys, update the central storage types/keys in `utils/types/*` and keep read/write paths consistent.

## Testing conventions

- Prefer deterministic unit tests (no real network).
- Add tests alongside existing ones in `utils/tests/`.
- When changing behavior in `utils/`, update tests in the same PR.

## Change management

- Default to the smallest viable patch; don’t rename files or do broad refactors unless asked.
- If you suspect a change impacts the manifest, call it out and explain why.
- After code changes, run the most relevant command(s): usually `pnpm lint` and `pnpm test`.

## Extension dev troubleshooting

- If “dev opens a browser but the extension isn’t there”, verify the correct browser/profile is used and load `.output/chrome-mv3` via `chrome://extensions` → **Load unpacked**.

## When in doubt

- Ask a short clarifying question if requirements are ambiguous, especially around:
    - adding permissions
    - changes affecting user data in storage
    - security / auth token handling
