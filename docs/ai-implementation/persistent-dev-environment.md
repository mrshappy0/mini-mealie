# Implementation Plan: Persistent Dev Environment with Pre-loaded Credentials

**Date:** January 31, 2026  
**Status:** ✅ Completed  
**Goal:** Configure WXT dev environment to persist Chrome profile data and pre-load Mealie server URL and API token from `.env.local` file

---

## Summary

Successfully implemented a streamlined development environment that:

- ✅ Persists Chrome profile across sessions (`.wxt/chrome-data`)
- ✅ Pre-loads credentials from `.env.local` (gitignored)
- ✅ Auto-opens recipe test page and activity logs on `pnpm dev`
- ✅ Provides helpful validation for missing/incomplete `.env.local`
- ✅ Zero impact on production builds (verified via tree-shaking)

**Developer Experience:**

```bash
# One-time setup
cp .env.local.example .env.local
# (edit .env.local with your credentials)

# Daily workflow
pnpm dev
# → Chrome opens with extension loaded
# → Recipe page opens: https://www.allrecipes.com/recipe/286369/
# → Logs page opens: chrome-extension://[id]/logs.html
# → Credentials pre-filled from .env.local
# → Settings persist across sessions
```

---

## Overview

Enhance the developer experience by:

1. Persisting Chrome profile data across `pnpm dev` sessions (no re-login)
2. Pre-loading Mealie server URL and API token from `.env.local` file
3. Gracefully handling missing `.env.local` for new developers
4. Following WXT best practices and security guidelines

---

## Research Summary

### WXT Browser Startup Configuration

**Key Findings from WXT Docs:**

1. **Config File Hierarchy** (per [Browser Startup docs](https://wxt.dev/guide/essentials/config/browser-startup.html)):

    - `web-ext.config.ts` - Per-developer config, gitignored ✅
    - `wxt.config.ts` - Project-wide config, version controlled
    - `$HOME/web-ext.config.ts` - Global config for all WXT projects

2. **Persist Chrome Data:**

    ```ts
    // web-ext.config.ts
    export default defineWebExtConfig({
        chromiumArgs: ['--user-data-dir=./.wxt/chrome-data'],
    });
    ```

    - Creates persistent profile in `.wxt/chrome-data/{profile-name}`
    - Chromium-only feature (Chrome/Edge supported, Firefox not supported)
    - Can use any directory; project-local vs global home directory

3. **Environment Variables** (per [Environment Variables docs](https://wxt.dev/guide/essentials/config/environment-variables.html)):
    - WXT supports Vite-style dotenv files
    - Naming conventions:
        - `.env` - Base config, version controlled
        - `.env.local` - Local overrides, gitignored
        - `.env.[mode]` - Mode-specific (development/production)
        - `.env.[browser]` - Browser-specific
    - Variables **must** be prefixed with `WXT_` or `VITE_` to be available at runtime
    - Access via `import.meta.env.WXT_YOUR_VAR_NAME`

### Current Project State

**Storage Keys (from `utils/types/storageTypes.ts`):**

- `mealieServer` - Server URL
- `mealieApiToken` - API token
- `mealieUsername` - Username
- `recipeCreateMode` - URL vs HTML mode
- `suggestHtmlMode` - Boolean flag

**Gitignore Status:**

- Already ignores `web-ext.config.ts` ✅
- Does NOT ignore `.env*` files yet ⚠️

**Package.json Scripts:**

- `dev: "wxt"` - Standard dev command
- No environment validation hooks yet

---

## Implementation Plan

### Phase 1: Environment File Setup

#### 1.1 Update `.gitignore`

**File:** `.gitignore`  
**Changes:**

```gitignore
# Add after existing entries
.env.local
.env.*.local
```

**Rationale:** Keep developer-specific credentials out of version control while allowing `.env` (base defaults) to be committed.

#### 1.2 Create `.env.local.example`

**File:** `.env.local.example` (new, version controlled)  
**Content:**

```env
# Copy this file to .env.local and fill in your Mealie server details
# This file is used during development to pre-populate extension storage

# Required: Your Mealie server URL (must be HTTPS for production servers)
WXT_MEALIE_SERVER=https://your-mealie-server.com

# Required: Your Mealie API token (generate from your Mealie user settings)
WXT_MEALIE_API_TOKEN=your-api-token-here

# Optional: Your Mealie username (for display purposes)
WXT_MEALIE_USERNAME=your-username
```

**Rationale:** Provides clear template for new developers without exposing actual credentials.

#### 1.3 Create Developer's `.env.local`

**File:** `.env.local` (new, NOT version controlled)  
**Content:** Developer fills this out manually based on `.env.local.example`

---

### Phase 2: Browser Startup Configuration

#### 2.1 Create `web-ext.config.ts`

**File:** `web-ext.config.ts` (version controlled - safe for team use)  
**Content:**

```ts
import { defineWebExtConfig } from 'wxt';

export default defineWebExtConfig({
    // Persist Chrome profile data across dev sessions
    chromiumArgs: ['--user-data-dir=./.wxt/chrome-data'],

    // Auto-open useful pages for development
    startUrls: ['https://www.allrecipes.com/recipe/286369/cheesy-ground-beef-and-potatoes/'],
});
```

**Rationale:**

- Project-local profile (`.wxt/chrome-data`) keeps dev data isolated
- `startUrls` opens a recipe page for immediate testing
- **Safe to commit** - only affects `pnpm dev`, never production builds
- Logs page auto-opens via background script (extension ID is dynamic)

**Decision:** After verification that `web-ext.config.ts` has zero impact on production builds, removed from `.gitignore` to share dev experience with team.

---

### Phase 3: Storage Pre-population Logic

#### 3.1 Create Dev Environment Initialization Helper

**File:** `utils/devInit.ts` (new)  
**Purpose:** Pre-populate extension storage from environment variables during development

```ts
import { storage } from 'wxt/storage';
import type { StorageData } from './types/storageTypes';

/**
 * Pre-populate extension storage from environment variables during development.
 * Only runs in dev mode when env vars are present.
 *
 * This improves developer experience by avoiding manual login on every browser restart.
 */
export async function initDevEnvironment(): Promise<void> {
    // Only run in development mode
    if (!import.meta.env.DEV) {
        return;
    }

    const server = import.meta.env.WXT_MEALIE_SERVER;
    const token = import.meta.env.WXT_MEALIE_API_TOKEN;
    const username = import.meta.env.WXT_MEALIE_USERNAME;

    // Only proceed if credentials are provided
    if (!server || !token) {
        console.log('[DevInit] No dev credentials found in .env.local - skipping pre-population');
        return;
    }

    // Check if storage already has values (don't overwrite user changes during dev)
    const existingServer = await storage.getItem<string>('local:mealieServer');
    const existingToken = await storage.getItem<string>('local:mealieApiToken');

    if (existingServer && existingToken) {
        console.log('[DevInit] Storage already populated - skipping');
        return;
    }

    // Validate HTTPS for production servers
    if (
        !server.startsWith('http://localhost') &&
        !server.startsWith('http://127.0.0.1') &&
        !server.startsWith('https://')
    ) {
        console.warn('[DevInit] Server URL should use HTTPS for production servers');
    }

    console.log('[DevInit] Pre-populating storage from .env.local:', {
        server,
        hasToken: !!token,
        username: username || '(not set)',
    });

    // Populate storage
    const updates: Partial<StorageData> = {
        mealieServer: server,
        mealieApiToken: token,
    };

    if (username) {
        updates.mealieUsername = username;
    }

    // Write all values
    await Promise.all([
        storage.setItem('local:mealieServer', server),
        storage.setItem('local:mealieApiToken', token),
        username ? storage.setItem('local:mealieUsername', username) : Promise.resolve(),
    ]);

    console.log('[DevInit] Storage pre-populated successfully');
}
```

**Key Design Decisions:**

1. **Only runs in DEV mode** - Production builds unaffected
2. **Non-destructive** - Won't overwrite if storage already has values (respects manual changes during dev session)
3. **HTTPS validation** - Warns if using non-HTTPS for non-localhost
4. **Optional username** - Token + server are required, username is bonus
5. **Clear logging** - Developer can see what's happening in console

#### 3.2 Call from Background Script

**File:** `entrypoints/background.ts`  
**Changes:**

```ts
// Add import at top
import { initDevEnvironment } from '@/utils/devInit';

// Add to browser.runtime.onInstalled listener (or create new onStartup listener)
browser.runtime.onInstalled.addListener(async () => {
    // Existing setup code...

    // Pre-populate dev environment if applicable
    await initDevEnvironment();
});
```

**Alternative approach:** Could also call from popup's `main.tsx` on first mount, but background script is cleaner since it runs once per browser start.

---

### Phase 4: Developer Experience Enhancements

#### 4.1 Add Pre-Dev Validation Script

**File:** `scripts/check-dev-env.js` (new)  
**Purpose:** Validate `.env.local` exists before starting dev server

```js
#!/usr/bin/env node
import { existsSync } from 'fs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const envLocalPath = join(rootDir, '.env.local');

if (!existsSync(envLocalPath)) {
    console.error('\n⚠️  Missing .env.local file!\n');
    console.error('📋 To set up your development environment:\n');
    console.error('1. Copy .env.local.example to .env.local');
    console.error('2. Fill in your Mealie server URL and API token\n');
    console.error('Example:');
    console.error('  cp .env.local.example .env.local\n');
    console.error(
        "Without this file, you'll need to manually configure the extension on each dev session.\n",
    );

    // Don't exit with error - just warn
    // This allows devs to proceed if they want manual setup
    console.log(
        'ℹ️  Continuing anyway - you can set up credentials manually in the extension popup.\n',
    );
}

// Basic validation if file exists
if (existsSync(envLocalPath)) {
    const content = readFileSync(envLocalPath, 'utf-8');
    const hasServer = /WXT_MEALIE_SERVER\s*=\s*.+/.test(content);
    const hasToken = /WXT_MEALIE_API_TOKEN\s*=\s*.+/.test(content);

    if (!hasServer || !hasToken) {
        console.warn('\n⚠️  .env.local exists but appears incomplete!\n');
        console.warn("Make sure you've set WXT_MEALIE_SERVER and WXT_MEALIE_API_TOKEN\n");
    } else {
        console.log('✅ .env.local detected - dev environment will be pre-configured\n');
    }
}
```

#### 4.2 Update `package.json` Scripts

**File:** `package.json`  
**Changes:**

```json
{
    "scripts": {
        "predev": "node scripts/check-dev-env.js",
        "dev": "wxt"
        // ... rest unchanged
    }
}
```

**Rationale:** `predev` hook runs automatically before `pnpm dev`, providing helpful guidance without blocking development.

#### 4.3 Update README Developer Section

**File:** `README.md`  
**Add section:**

````md
## Development Setup

### Quick Start

1. Clone the repository and install dependencies:
    ```bash
    pnpm install
    ```
````

2. Set up your local environment (optional but recommended):

    ```bash
    cp .env.local.example .env.local
    ```

    Then edit `.env.local` and fill in your Mealie server details.

3. Start the development server:
    ```bash
    pnpm dev
    ```

### Why .env.local?

The `.env.local` file (gitignored) lets you pre-populate your Mealie server URL and API token during development. This means:

- ✅ No need to re-login every time you restart the dev browser
- ✅ Persistent Chrome profile remembers your settings
- ✅ Your credentials never get committed to git

Without `.env.local`, you'll need to manually configure the extension via the popup on each dev session - it will still work, just less convenient!

````

---

### Phase 5: Type Safety Enhancements

#### 5.1 Add Environment Variable Type Declarations
**File:** `env.d.ts` (new, at project root)
**Content:**
```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Built-in WXT/Vite env vars
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;

  // Custom Mealie dev environment vars
  readonly WXT_MEALIE_SERVER?: string;
  readonly WXT_MEALIE_API_TOKEN?: string;
  readonly WXT_MEALIE_USERNAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
````

**Rationale:** Provides TypeScript autocomplete and type safety for environment variables.

#### 5.2 Update `tsconfig.json`

**File:** `tsconfig.json`  
**Ensure includes:**

```json
{
    "include": ["env.d.ts", "entrypoints/**/*", "components/**/*", "utils/**/*", "scripts/**/*"]
}
```

---

## Security Considerations

### ✅ Safe Practices

1. **`.env.local` is gitignored** - Credentials never committed
2. **Only runs in DEV mode** - Production builds unaffected
3. **`web-ext.config.ts` is gitignored** - Per-developer customization
4. **Clear example file** - `.env.local.example` shows format without exposing secrets
5. **HTTPS validation** - Warns about insecure connections
6. **Non-destructive** - Won't overwrite manual changes during dev

### ⚠️ Important Notes

1. **Local dev only** - This setup is for localhost development, not production
2. **API token storage** - Extension already stores tokens in `chrome.storage.local` (encrypted by browser)
3. **No token logging** - `console.log` only logs presence (`hasToken: true`), not actual value
4. **Profile isolation** - Each project gets its own Chrome profile in `.wxt/chrome-data`

### 🔒 Production Build Safety

- Environment variables are **build-time**, not runtime
- Only `WXT_*` and `VITE_*` prefixed vars are bundled
- Our dev init code checks `import.meta.env.DEV` and exits early in production
- Production builds via CI don't have `.env.local` file

---

## Testing Plan

### Manual Testing Checklist

**Test 1: Fresh Developer Setup**

1. ✅ Delete `.env.local` if it exists
2. ✅ Run `pnpm dev`
3. ✅ Verify warning message about missing `.env.local`
4. ✅ Verify extension loads but storage is empty
5. ✅ Manually configure via popup
6. ✅ Verify settings persist across page navigations

**Test 2: With .env.local**

1. ✅ Create `.env.local` from example
2. ✅ Fill in valid credentials
3. ✅ Run `pnpm dev`
4. ✅ Verify success message about pre-configuration
5. ✅ Open extension popup
6. ✅ Verify server URL and token are pre-filled
7. ✅ Test scraping a recipe
8. ✅ Close browser, run `pnpm dev` again
9. ✅ Verify settings persisted (no re-login needed)

**Test 3: Chrome Profile Persistence**

1. ✅ Run `pnpm dev`
2. ✅ Make some changes in the browser (e.g., install a DevTools extension)
3. ✅ Close browser
4. ✅ Run `pnpm dev` again
5. ✅ Verify previous changes persisted

**Test 4: Production Build Safety**

1. ✅ Run `pnpm build`
2. ✅ Inspect built files in `.output/chrome-mv3`
3. ✅ Verify no `.env.local` credentials hardcoded in JS bundles
4. ✅ Verify `devInit.ts` code is tree-shaken out (or exits early)

**Test 5: Invalid Configuration**

1. ✅ Set `WXT_MEALIE_SERVER` to `http://production-server.com` (non-HTTPS, non-localhost)
2. ✅ Run `pnpm dev`
3. ✅ Verify HTTPS warning in console

---

## File Changes Summary

### New Files

- ✅ `.env.local.example` - Template for developer credentials
- ✅ `web-ext.config.ts` - Browser startup config (created by developer, gitignored)
- ✅ `utils/devInit.ts` - Storage pre-population logic
- ✅ `scripts/check-dev-env.js` - Pre-dev validation script
- ✅ `env.d.ts` - TypeScript environment variable types
- ✅ `docs/ai-implementation/persistent-dev-environment.md` - This document

### Modified Files

- ✅ `.gitignore` - Add `.env.local` and `.env.*.local`
- ✅ `entrypoints/background.ts` - Call `initDevEnvironment()`
- ✅ `package.json` - Add `predev` script hook
- ✅ `README.md` - Add development setup instructions
- ✅ `tsconfig.json` - Include `env.d.ts`

---

## Rollout Steps

### Step 1: Foundation (Gitignore & Examples)

1. Update `.gitignore` with `.env.local` entries
2. Create `.env.local.example` template
3. Update README with setup instructions
4. Commit and push

### Step 2: Chrome Profile Persistence

1. Document `web-ext.config.ts` in README
2. Each developer creates their own `web-ext.config.ts` locally
3. Test persistence works

### Step 3: Environment Pre-population

1. Create `env.d.ts` for type safety
2. Create `utils/devInit.ts` with storage logic
3. Update `entrypoints/background.ts` to call `initDevEnvironment()`
4. Test with and without `.env.local`
5. Commit and push

### Step 4: Developer Experience Polish

1. Create `scripts/check-dev-env.js` validation script
2. Update `package.json` with `predev` hook
3. Test warning messages
4. Commit and push

### Step 5: Documentation & Communication

1. Update this implementation doc with actual results
2. Create PR with all changes
3. Communicate to team about new dev workflow
4. Each developer sets up their own `.env.local`

---

## Future Enhancements

### Potential Improvements

1. **Browser-specific profiles** - `.env.chrome.local` vs `.env.firefox.local`
2. **Multiple Mealie instances** - Switch between dev/staging/prod servers
3. **Recipe mode preset** - Pre-configure `recipeCreateMode` from env var
4. **VSCode tasks** - Add task definitions for common dev commands
5. **Dev server detection** - Auto-detect if Mealie server is reachable on startup
6. **Encrypted local storage** - Additional encryption layer for tokens (probably overkill)

### Not Recommended

- ❌ **Committing `.env` with example values** - Confusing; `.env.local.example` is clearer
- ❌ **Global `~/.wxt-mini-mealie` profile** - Project-local is cleaner
- ❌ **Auto-generating `.env.local`** - Should be manual for security awareness
- ❌ **Blocking `pnpm dev` if `.env.local` missing** - Too restrictive; warning is enough

---

## Questions for Review

1. **Profile location**: Project-local `.wxt/chrome-data` vs global `~/.config/wxt-mini-mealie`?

    - **Recommendation:** Project-local (already gitignored, isolated per project)

2. **Overwrite behavior**: Should `devInit.ts` always overwrite, or only if empty?

    - **Recommendation:** Only if empty (non-destructive, respects manual changes)

3. **Error vs Warning**: Should missing `.env.local` error or warn?

    - **Recommendation:** Warn only (allows manual setup, less friction)

4. **Username handling**: Required or optional?

    - **Recommendation:** Optional (token + server are sufficient)

5. **Additional env vars**: Pre-configure `recipeCreateMode` or `suggestHtmlMode`?
    - **Recommendation:** Start simple, add later if requested

---

## Success Criteria

✅ Developer can run `pnpm dev` and have credentials pre-loaded  
✅ Chrome profile persists across dev sessions  
✅ No credentials committed to git  
✅ Clear setup instructions for new developers  
✅ Graceful handling of missing `.env.local`  
✅ Type-safe environment variable access  
✅ Production builds unaffected  
✅ No security regressions

---

## Estimated Effort

- **Step 1-2 (Foundation + Profiles):** 30 minutes
- **Step 3 (Pre-population Logic):** 1 hour
- **Step 4 (DX Polish):** 30 minutes
- **Step 5 (Docs & Testing):** 1 hour
- **Total:** ~3 hours

---

## References

- [WXT Browser Startup Config](https://wxt.dev/guide/essentials/config/browser-startup.html)
- [WXT Environment Variables](https://wxt.dev/guide/essentials/config/environment-variables.html)
- [Vite Environment Variables](https://vite.dev/guide/env-and-mode.html)
- [Chrome Extension Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Project Copilot Instructions](../.github/copilot-instructions.md)
