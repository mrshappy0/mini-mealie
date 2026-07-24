# End-to-End Testing

Full E2E tests drive a **real browser + the built extension + a real Mealie server**, then
assert the recipe actually landed in Mealie. They cover both shipping targets:

| Target | Tool | Loads | Background |
| --- | --- | --- | --- |
| **Chrome MV3** | Playwright | `.output/chrome-mv3` | service worker |
| **Firefox MV2** | Selenium + geckodriver | `.output/*-firefox.zip` (xpi) | persistent page |

There is no single tool that loads an unsigned extension in both browsers: Playwright can only
load Chromium extensions, and Firefox needs geckodriver's temporary-add-on install. So each
target has its own thin driver harness, and both share the TypeScript helpers in `e2e-shared/`.

## How it works

Both harnesses run the same flow:

1. Load the built extension.
2. Seed Mealie creds + import options into `storage.sync` from the popup context.
3. Open a recipe page in a tab. By default this is a **hermetic local fixture**
   (`e2e-shared/fixtures/recipe.html`, served by `fixture-server.ts`) so tests never depend
   on a live recipe site. Override with `E2E_RECIPE_URL` for a real live-scrape run.
4. Fire the **internal e2e trigger** — a `runtime.sendMessage` of type
   `mini-mealie/e2e/run-create-recipe` (see `utils/e2eMessaging.ts`), which runs the exact
   same `runCreateRecipe(tab)` path as the context-menu "Save to Mini Mealie" click.

   This message is the canonical trigger because it behaves identically in both targets:
   Chrome MV3 also has a keyboard command (`Ctrl+Shift+M`), but **Firefox MV2 has no
   `commands` block**, so a keyboard trigger can't work there.

   The `background.ts` listener for this message is **gated behind `WXT_E2E`** (see
   `wxt.config.ts`), so it is tree-shaken out of production store builds and only compiled
   into E2E builds. The `test:e2e*` scripts set `WXT_E2E=true`; a plain `pnpm build` does not.
5. Poll `GET /api/recipes` until a recipe appears that matches the import by **`name` and/or
   `orgURL`** (never slug — Mealie suffixes duplicate slugs `-1`, `-2`, … so re-runs would
   otherwise fail). The default hermetic fixture matches on name, because HTML-mode imports
   leave `orgURL` empty; a live-site run also matches on `orgURL`.

## The Mealie backend (Docker)

`docker/mealie.e2e.yml` runs an ephemeral Mealie on SQLite (tmpfs, so every run is clean).
`e2e-shared/mealie-docker.ts` brings it up (image from `MEALIE_IMAGE` or **newest** in
`e2e-shared/support-range.json`), waits for health, logs in with Mealie's default
`changeme@example.com` / `MyPassword`, mints an API token, and writes `.env.e2e`
(`E2E_MEALIE_SERVER`, `E2E_MEALIE_TOKEN`). Both harnesses auto-load `.env.e2e`.

You can skip Docker and point at any Mealie instance by exporting `E2E_MEALIE_SERVER` and
`E2E_MEALIE_TOKEN` yourself (these win over `.env.e2e`).

## Running it

Chrome, fully automated (up → build → test → down):

```
pnpm test:e2e:chromium:install   # one-time: fetch Playwright chromium
pnpm test:e2e                    # docker Mealie + build + chrome spec + teardown
```

Chrome, manual control:

```
pnpm test:e2e:up                 # start Mealie, write .env.e2e
WXT_E2E=true pnpm build          # build .output/chrome-mv3 with the e2e trigger compiled in
pnpm test:e2e:chromium
pnpm test:e2e:down
```

> Note the `WXT_E2E=true` on the build — without it the e2e message hook is stripped and
> `test:e2e:chromium` will fail to trigger the import. The fully-automated `pnpm test:e2e`
> handles this for you.

Firefox:

```
pnpm test:e2e:gecko:setup        # one-time: non-snap Firefox + geckodriver
pnpm test:e2e:up                 # (if not already running)
pnpm test:e2e:gecko              # zip:firefox + run the Selenium harness
pnpm test:e2e:down
```

## Useful env vars

| Var | Default | Purpose |
| --- | --- | --- |
| `E2E_MEALIE_SERVER` / `E2E_MEALIE_TOKEN` | from `.env.e2e` | Mealie target (skip if unset) |
| `E2E_IMPORT_MODE` | `html` | `html` or `url` import mode |
| `E2E_RECIPE_URL` | local fixture | recipe to import; set a real URL for a live-scrape run |
| `E2E_FIXTURE_PORT` | `8730` | port for the local fixture server |
| `MEALIE_IMAGE` / `MEALIE_PORT` | newest from `support-range.json` / `9925` | Docker Mealie image / host port |
| `E2E_FIREFOX_XPI` | newest `.output/*-firefox.zip` | Firefox add-on to install |
| `FIREFOX_VER` | newest from `support-range.json` | Firefox version `setup.sh` fetches; set `latest` for the canary |
| `GECKO_VER` | `firefox.geckodriver` from `support-range.json` | geckodriver release tag |
| `PLAYWRIGHT_CHROME_EXECUTABLE` | (unset → Playwright Chromium) | absolute path to Chrome for Testing |
| `CHROME_FOR_TESTING_TAG` | `latest` | tag / build id for `@puppeteer/browsers` (`151.0.7922.47`, `stable`, `latest`, …) |
| `E2E_HEADLESS` | on | set `0` to watch Firefox run |

## Support range

`e2e-shared/support-range.json` is the **single source of truth** for which Mealie, Chrome,
and Firefox ends we claim to support. Local `pnpm test:e2e:up` uses **newest** Mealie when
`MEALIE_IMAGE` is unset; `setup.sh` / the Firefox harness use **newest** Firefox when
`FIREFOX_VER` is unset. Compose requires `MEALIE_IMAGE` — always go through the harness or
set it yourself from that file.

| End | Mealie | Chrome (CfT) | Firefox | Rolling rule |
| --- | --- | --- | --- | --- |
| **Oldest** | `v3.19.2` | `149.0.7827.155` | `151.0` | Mealie: latest patch of **newest − 2 minors**. Chrome: latest build of **newest − 2 milestones**. Firefox: **newest − 2 majors**. |
| **Newest** | `v3.20.1` | `151.0.7922.47` | `153.0` | Latest stable the gate (or a bump PR) has proven green |

`firefox.geckodriver` (`v0.37.1`) is pinned alongside the Firefox range — Firefox 153+ needs
geckodriver ≥ 0.37.1 for `--allow-system-access`. `wxt.config.ts` `strict_min_version` must
match `firefox.oldest`.

Raising any `*.oldest` field is an intentional change: edit the JSON and say so in the PR /
release notes. Do not raise a floor as a side effect of chasing “latest.”

**No branded Google Chrome in CI.** Store Chrome removed the flags needed to side-load unpacked
extensions. Gate Chrome range legs and the canary use **Chrome for Testing** only. Mealie legs
still use Playwright’s bundled Chromium as the harness default (not a support-range end).
**ESR** is out of the default Firefox range unless we explicitly decide to support it.

## CI (PR gate)

`.github/workflows/e2e.yml` is the **merge gate**. On every PR to `main` (and
`workflow_dispatch`) it reads `support-range.json` and runs the reusable suite
(`.github/workflows/e2e-suite.yml`) once per named leg:

| Leg | Mealie | Chrome | Firefox |
| --- | --- | --- | --- |
| `mealie-oldest` | oldest tag | Playwright Chromium | newest pin (`153.0`) |
| `mealie-newest` | newest tag | Playwright Chromium | newest pin (`153.0`) |
| `chrome-oldest` | newest tag | CfT `149.0.7827.155` | skipped |
| `chrome-newest` | newest tag | CfT `151.0.7922.47` | skipped |
| `firefox-oldest` | newest tag | skipped | `151.0` |
| `firefox-newest` | newest tag | skipped | `153.0` |

One moving piece per leg (same idea as the canary) — not a full Mealie × browser grid.
`chrome-*` legs skip Firefox and `firefox-*` legs skip Chrome so a red check names the
browser, not a duplicate run.

- Docker + Compose ship on `ubuntu-latest`, so `test:e2e:up` brings up Mealie there exactly
  as it does locally.
- No secrets: Mealie is ephemeral and the API token is minted at runtime.
- Fully hermetic: the default recipe is the local fixture, so no third-party site can flake CI.
- Chrome uses the self-contained `pnpm test:e2e`; Firefox adds the `setup.sh` step.
- **Pinned ends** so the gate is deterministic — a red PR means *your* change broke something
  in the support range, not that an upstream dep just shipped: Mealie (`oldest`…`newest`),
  Chrome (pinned CfT oldest…newest), Firefox (pinned oldest…newest), geckodriver
  (`firefox.geckodriver`).

## Canary (early warning)

`.github/workflows/e2e-canary.yml` runs the same suite weekly (and on demand) against the
**latest** of the dependencies we fetch at runtime, so brand-new upstream releases that break
the extension surface *here* before we raise the support-range ceiling. It's **non-blocking** —
a heads-up, not a merge gate — and reuses `e2e-suite.yml` via `workflow_call`.

**Gate vs canary:** the gate proves the declared support range; the canary watches floating
`:latest` / `latest` upstreams only (not a third pin in `support-range.json`).

It's a **matrix with one leg per moving dependency**, each holding the others pinned so a red leg
names the culprit:

| Leg | Overrides | Pinned | Jobs |
| --- | --- | --- | --- |
| `mealie-latest` | Mealie → `:latest` | Firefox newest pin, Playwright Chromium | Chrome + Firefox |
| `firefox-latest` | Firefox → `latest` (also catches geckodriver/Firefox skew) | Mealie newest pin | Firefox only |
| `chrome-latest` | Chrome for Testing → `latest` via `PLAYWRIGHT_CHROME_EXECUTABLE` | Mealie newest pin, Firefox newest pin, Playwright version | Chrome only |

`chrome-latest` keeps Playwright pinned and downloads **Chrome for Testing** `@latest`
(`pnpm test:e2e:chrome-cft:install`), then drives it with `executablePath`. Branded Google Chrome
is not used. Do **not** try `playwright install chromium@latest` either — that fights Playwright's
bundled-browser pairing.

Before the suite, a smoke step (`pnpm test:e2e:chrome-cft:smoke`) launches that binary with no
extension: smoke fail → Playwright↔CfT/tooling (or install/path); smoke pass + suite fail →
product / Chrome-behavior. A red leg is early warning and triage, not automatic proof that Chrome
broke the extension. (Addresses
[#183](https://github.com/mrshappy0/mini-mealie/issues/183).)

`schedule` only fires from the default branch; trigger the canary manually with "Run workflow"
otherwise.

The `firefox-latest` leg runs **only** the Firefox job (Chrome would ignore `FIREFOX_VER` and
duplicate a gate Chrome run). The `chrome-latest` leg runs **only** the Chrome job
(Firefox would ignore the CfT override). The `mealie-latest` leg still runs both browsers.

To run on your own server instead of GitHub-hosted, change `runs-on` to `[self-hosted]` —
just ensure Docker is installed and the runner user is in the `docker` group. On a persistent
runner, "latest" can go stale without care: Firefox is cached under a **version-keyed** directory
(`~/.local/firefox-nonsnap-$FIREFOX_VER`), and `FIREFOX_VER=latest` always re-downloads;
geckodriver is reinstalled when the pin in `support-range.json` moves; Chrome for Testing is
cached under `~/.cache/mini-mealie-chrome-for-testing` (clear it to force a refresh); Mealie
`compose` **pulls** only for floating `:latest` images so the canary refreshes.
GitHub-hosted `ubuntu-latest` is a fresh VM each run, so this only matters for self-hosted.
The harnesses stay excluded from lint / tsc / vitest and from the AMO sources zip.
