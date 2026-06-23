# Agent Instructions (opencode, Copilot, Claude, etc.)

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

`pnpm-workspace.yaml` pins `undici >=7.28.0` to fix 6 open CVEs. This override
can be removed when `@semantic-release/github` updates its minimum undici version.
