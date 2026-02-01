# Copilot instructions (mini-mealie)

This repo is a **WXT + React** browser extension (MV3). Please optimize for **small, safe diffs**, strong TypeScript types, and extension-specific constraints.

## What this project is

- WXT drives builds/dev server. Output goes to `.output/`.
- Extension entrypoints live in `entrypoints/` (popup, background, etc.).
- Shared logic lives in `utils/` with Vitest coverage focused there.

## Local commands (preferred)

- Dev: `pnpm dev`
- Build: `pnpm build`
- Typecheck: `pnpm compile`
- Lint: `pnpm lint`
- Tests: `pnpm test`
- Coverage: `pnpm coverage`

Windows note: if PowerShell blocks `pnpm.ps1`, prefer `pnpm.cmd` or adjust execution policy.

## Auto-imports (important)

- This repo relies on WXT auto-import generation.
- If imports look “missing” (especially ESLint complaining about undefined globals/imports), run `pnpm install` (or `pnpm.cmd install` on Windows).
    - The `postinstall` hook runs `wxt prepare`, which generates files under `.wxt/` (including ESLint auto-import definitions).
- When adding new exported utilities/types, prefer patterns that allow auto-imports to pick them up rather than adding manual imports everywhere.

## Commits, versioning, and releases (important)

- Use **Conventional Commits**.
    - Local helpers: `pnpm commit` (Commitizen) and `pnpm commitlint`.
- Releases are driven by commit history and semantic versioning via **semantic-release**.
    - On merges to `main`, GitHub Actions runs `npx semantic-release` (see `.github/workflows/release.yml` and `.releaserc`).
    - When a GitHub Release is published, CI zips the extension (`pnpm zip`) and submits it to the Chrome Web Store (see `.github/workflows/submit.yml`).
- When making changes, keep commit messages clean and scoped so release automation behaves predictably.

## Code style / quality bar

- TypeScript is **strict** (`noImplicitAny`): do not introduce `any` unless there is no reasonable alternative.
- Follow ESLint + Prettier output; don’t do stylistic refactors.
- Keep imports sorted (repo uses `eslint-plugin-simple-import-sort`).
- Prefer existing patterns:
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
