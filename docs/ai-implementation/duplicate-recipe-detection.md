# Duplicate Recipe Detection Feature

**Feature Request**: Detect if a recipe already exists in the user's Mealie library before importing, providing soft warnings via context menu items.

**Approach**: Hybrid detection using both exact URL matching (high confidence) and fuzzy name matching (lower confidence) to warn users of potential duplicates.

**User Experience**: Add conditional context menu items that:

- Show exact URL match with link to existing recipe (⚠️ high confidence)
- Show similar recipe names with link to search results (💡 lower confidence)
- Allow users to proceed with import anyway (non-blocking)

**Date**: 2026-02-17

---

## Problem Summary

Users may accidentally import duplicate recipes because:

1. They've already imported from the same URL
2. They've created recipes manually that match the current page
3. Mealie's non-deterministic parsing creates variations of the same recipe

The extension should detect potential duplicates and warn users **before** they import, while:

- Never blocking the import (soft warnings only)
- Providing clear confidence signals (exact match vs. similar)
- Offering one-click access to check the existing recipe(s)

---

## Goals

- **Detect exact URL duplicates** using Mealie's `orgURL` field
- **Detect similar recipes** using fuzzy name matching
- **Provide clear UX** via dynamic context menu items
- **Cache results** to avoid repeated API calls
- **Non-blocking warnings** that let users proceed if desired

---

## Non-Goals (for MVP)

- Content hashing/fingerprinting (too fragile)
- Preventing duplicates (only warning)
- Detecting duplicates from JSON/HTML imports with no URL
- Complex multi-field matching beyond URL and name
- Automatic duplicate merging

---

## Key API Findings

From Mealie API documentation:

- **Recipe objects contain `orgURL` field** (string, nullable) - stores original URL when scraped
- **GET `/api/recipes`** supports `queryFilter` parameter with SQL-like syntax
- **Filter example**: `orgURL = "https://example.com/recipe"` for exact URL match
- **Search parameter**: `search` query parameter for fuzzy name matching
- **Recipe response includes**: `id`, `name`, `slug`, `orgURL`, `groupId`, `householdId`

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  background.ts (tab change, URL update)                │
│         ↓                                               │
│  checkStorageAndUpdateBadge()                          │
│         ↓                                               │
│  testScrapeUrlDetailed() → recipe detected?           │
│         ↓ (if yes)                                      │
│  checkForDuplicates()                                   │
│         ├─ findRecipeByURL() (exact match)            │
│         └─ searchRecipesByName() (fuzzy match)        │
│         ↓                                               │
│  updateContextMenuWithDuplicates()                     │
│         ├─ Main: "Create Recipe from URL"              │
│         ├─ Exact: "⚠️ Exact match: [name]"            │
│         └─ Similar: "💡 Similar recipes (N)"          │
│         ↓                                               │
│  chrome.contextMenus.onClicked                         │
│         ├─ Create recipe (existing flow)               │
│         ├─ Open exact match recipe page                │
│         └─ Open search page with query                 │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: API Layer (`utils/network.ts`)

**Add new functions:**

#### `findRecipeByURL`

```typescript
/**
 * Find a recipe by exact orgURL match.
 * Returns null if no match found.
 */
export async function findRecipeByURL(
    url: string,
    server: string,
    token: string,
): Promise<{ id: string; name: string; slug: string } | null>;
```

**Implementation:**

- Normalize URL (strip tracking params, www., trailing slashes, fragments)
- Call `GET /api/recipes?queryFilter=orgURL = "${normalizedUrl}"&perPage=1`
- Parse response and return first match or null
- Log result via logging system

**URL Normalization:**

- Remove `www.` prefix
- Strip query parameters (except essential ones like recipe IDs)
- Remove trailing slashes
- Remove URL fragments (#)
- Lowercase domain

#### `searchRecipesByName`

```typescript
/**
 * Search for recipes by name (fuzzy match).
 * Returns top 5 matches sorted by relevance.
 */
export async function searchRecipesByName(
    name: string,
    server: string,
    token: string,
): Promise<Array<{ id: string; name: string; slug: string; similarity?: number }>>;
```

**Implementation:**

- Call `GET /api/recipes?search=${encodeURIComponent(name)}&perPage=5`
- Parse response and return matches
- Optionally calculate Levenshtein distance for similarity scores
- Log result via logging system

**Error Handling:**

- Both functions return empty/null results on network errors (no throwing)
- Log errors but don't block recipe creation workflow
- Cache failures to avoid repeated calls

---

### Phase 2: Detection Cache Enhancement (`utils/storage.ts`)

**Extend cache types:**

```typescript
type DuplicateDetectionResult =
    | { type: 'none' }
    | { type: 'url'; match: { id: string; name: string; slug: string } }
    | { type: 'name'; matches: Array<{ id: string; name: string; slug: string }> };

type CachedDetection = {
    checkedAt: number;
    outcome: DetectionOutcome;
    status?: number;
    recipeName?: string; // NEW: Add parsed recipe name
    duplicateDetection?: DuplicateDetectionResult; // NEW: Add duplicate info
};
```

**Extend `testScrapeUrlDetailed` return type:**

```typescript
export type TestScrapeUrlDetailedResult =
    | { outcome: 'recipe'; recipeName?: string } // Add recipeName
    | { outcome: 'not-recipe' }
    | { outcome: 'timeout'; timeoutMs: number }
    | { outcome: 'http-error'; status: number; details?: string }
    | { outcome: 'error'; message: string };
```

**Update `testScrapeUrlDetailed` implementation:**

- Parse recipe name from test scrape response if available
- Return it in the result object

**Add new function `checkForDuplicates`:**

```typescript
async function checkForDuplicates(
    url: string,
    recipeName: string | undefined,
    server: string,
    token: string,
): Promise<DuplicateDetectionResult>;
```

**Implementation:**

1. Try `findRecipeByURL(url, server, token)` first
2. If URL match found, return `{ type: 'url', match }`
3. If no URL match and `recipeName` exists, call `searchRecipesByName(recipeName, server, token)`
4. If name matches found (length > 0), return `{ type: 'name', matches }`
5. Otherwise return `{ type: 'none' }`

**Update `checkStorageAndUpdateBadge`:**

- After successful recipe detection, call `checkForDuplicates`
- Store duplicate result in cache alongside detection outcome
- Pass duplicate info to enhanced context menu system

---

### Phase 3: Context Menu Enhancement (`utils/contextMenu.ts`)

**Add new menu IDs:**

```typescript
const RUN_CREATE_RECIPE_MENU_ID = 'runCreateRecipe';
const DUPLICATE_URL_MENU_ID = 'viewDuplicateUrl';
const DUPLICATE_NAME_MENU_ID = 'viewDuplicatesByName';
```

**Export duplicate info type:**

```typescript
export type DuplicateInfo =
    | { type: 'none' }
    | { type: 'url'; match: { slug: string; name: string } }
    | { type: 'name'; matches: Array<{ slug: string; name: string }>; searchQuery: string };
```

**Refactor existing functions:**

Current `addContextMenu(title, enabled)` becomes internal.

**Add new primary function:**

```typescript
export const updateContextMenu = (
    createTitle: string,
    createEnabled: boolean,
    duplicateInfo: DuplicateInfo,
    mealieServer: string,
    groupSlug: string,
) => void
```

**Implementation:**

1. Always create/update main menu item (RUN_CREATE_RECIPE_MENU_ID)
2. Remove old duplicate menu items if they exist
3. Based on `duplicateInfo.type`:
    - **'url'**: Create DUPLICATE_URL_MENU_ID with "⚠️ Exact match: \"{name}\""
    - **'name'**: Create DUPLICATE_NAME_MENU_ID with "💡 Similar recipes ({count})"
    - **'none'**: Remove any duplicate menu items

**Menu item configuration:**

- Use `contexts: ['page']` for all items
- Set `enabled: true` for duplicate items (always clickable)
- Store necessary data in menu item properties for click handler

**Add cleanup function:**

```typescript
export const removeAllDuplicateMenus = () => void
```

Removes both DUPLICATE_URL_MENU_ID and DUPLICATE_NAME_MENU_ID.

---

### Phase 4: Background Integration (`entrypoints/background.ts`)

**Extend click handler:**

```typescript
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab?.url || !tab.id) return;

    const menuId = info.menuItemId as string;

    switch (menuId) {
        case RUN_CREATE_RECIPE_MENU_ID:
            // Existing recipe creation flow
            runCreateRecipe(tab);
            break;

        case DUPLICATE_URL_MENU_ID:
            // Open existing recipe page
            await handleViewDuplicate(info, 'url');
            break;

        case DUPLICATE_NAME_MENU_ID:
            // Open search page
            await handleViewDuplicate(info, 'name');
            break;
    }
});
```

**Add handler function:**

```typescript
async function handleViewDuplicate(
    info: chrome.contextMenus.OnClickData,
    type: 'url' | 'name',
) => Promise<void>
```

**Implementation:**

1. Read `mealieServer` and user's `group` slug from storage
2. Read cached duplicate detection result for current tab URL
3. For URL type: Open `${server}/g/${groupSlug}/recipes/${slug}`
4. For name type: Open `${server}/g/${groupSlug}?search=${encodeURIComponent(query)}`
5. Log the action via logging system

**Storage requirements:**

- Need to store user's group slug (add to StorageData)
- Fetch during initial auth/profile fetch from `getUser()` response
- Cache alongside mealieServer and mealieApiToken

---

### Phase 5: Storage Schema Updates (`utils/types/storageTypes.ts`)

**Add new fields to `StorageData`:**

```typescript
export interface StorageData {
    // ... existing fields
    mealieGroupSlug?: string; // NEW: User's group slug for URL construction
}
```

**Add to `storageKeys` array:**

```typescript
export const storageKeys = [
    // ... existing keys
    'mealieGroupSlug',
] as const;
```

**Update auth flow:**

- When `getUser()` succeeds in popup/background, extract `group` slug
- Store in `chrome.storage.sync` under `mealieGroupSlug` key
- Use in URL construction for duplicate menu items

---

### Phase 6: Logging Integration

**Add new log events:**

```typescript
// In findRecipeByURL
await logEvent({
    level: 'info',
    feature: 'duplicate-detect',
    action: 'findByUrl',
    phase: 'success',
    message: 'Found exact URL match',
    data: { url: sanitizeUrl(url), recipeName: match.name },
});

// In searchRecipesByName
await logEvent({
    level: 'info',
    feature: 'duplicate-detect',
    action: 'searchByName',
    phase: 'success',
    message: `Found ${matches.length} similar recipes`,
    data: { recipeName: name, matchCount: matches.length },
});

// When user clicks duplicate menu item
await logEvent({
    level: 'info',
    feature: 'duplicate-detect',
    action: 'viewDuplicate',
    phase: 'start',
    message: 'User viewing potential duplicate',
    data: { type: 'url' | 'name', recipeName },
});
```

---

## Testing Strategy

### Unit Tests

**`utils/network.test.ts`:**

- Test `findRecipeByURL` with exact match, no match, error cases
- Test URL normalization (www, trailing slashes, query params, fragments)
- Test `searchRecipesByName` with multiple matches, no matches, error cases
- Mock fetch responses from Mealie API

**`utils/storage.test.ts`:**

- Test `checkForDuplicates` returns correct result types
- Test cache stores duplicate detection alongside recipe detection
- Test cache TTL and pruning with duplicate data

**`utils/contextMenu.test.ts`:**

- Test `updateContextMenu` creates appropriate menu items based on duplicate type
- Test menu cleanup when switching between duplicate types
- Test menu removal when no duplicates found

### Integration Tests

**Manual testing scenarios:**

1. **Exact URL match:**

    - Import recipe from URL X
    - Navigate to same URL X
    - Verify context menu shows exact match warning
    - Click warning, verify opens existing recipe

2. **Similar name match:**

    - Import "Chicken Carbonara"
    - Navigate to URL with "Carbonara with Chicken"
    - Verify context menu shows similar recipes warning
    - Click warning, verify opens search page with query

3. **No duplicates:**

    - Navigate to new recipe URL
    - Verify only main "Create Recipe" menu item appears

4. **Cache behavior:**
    - Trigger duplicate detection
    - Verify subsequent tab activations don't re-fetch
    - Wait > 30s (cache TTL)
    - Verify re-fetches duplicate info

---

## UX Examples

### Context Menu States

**State 1: No duplicates detected**

```
Right-click menu:
└─ ✓ Create Recipe from URL
```

**State 2: Exact URL match (high confidence)**

```
Right-click menu:
├─ ✓ Create Recipe from URL
└─ ⚠️ Exact match: "Chicken Carbonara"
    (Click to view existing recipe)
```

**State 3: Similar name matches (lower confidence)**

```
Right-click menu:
├─ ✓ Create Recipe from URL
└─ 💡 Similar recipes (3)
    (Click to search in Mealie)
```

**State 4: No recipe detected**

```
Right-click menu:
└─ ✗ No Recipe - Switch to HTML Mode
    (No duplicate check performed)
```

---

## Edge Cases & Considerations

### URL Normalization Edge Cases

**Same recipe, different URLs:**

- `https://site.com/recipe` vs `http://site.com/recipe` (protocol)
- `https://site.com/recipe` vs `https://www.site.com/recipe` (www)
- `https://site.com/recipe/` vs `https://site.com/recipe` (trailing slash)
- `https://site.com/recipe?utm_source=x` vs `https://site.com/recipe` (tracking)

**Solution:** Aggressive normalization before query

### Recipe Name Parsing

**Issue:** `testScrapeUrl` currently doesn't return recipe name

**Options:**

1. Enhance to parse and return name (preferred)
2. Make separate API call to get scraped recipe data (wasteful)
3. Skip name-based detection until URL import completes (delayed check)

**Decision:** Enhance `testScrapeUrlDetailed` to return recipe name when available

### Performance Considerations

**Caching strategy:**

- Cache duplicate detection for same TTL as recipe detection (30s)
- Avoid duplicate API calls within cache window
- Prune cache aggressively to prevent memory bloat

**API call optimization:**

- URL check: Single query filter request, fast
- Name search: Single search request, returns top 5
- Total: 2 API calls max per page load (cached 30s)

### Failure Modes

**Network errors:**

- Duplicate detection fails silently
- Show main menu item as normal
- Log error for debugging
- User can still import recipe

**Missing group slug:**

- Detect during auth flow
- Store in sync storage
- Fallback: construct URL without group (may work depending on Mealie config)

**Mealie API changes:**

- `orgURL` field removed or renamed: URL detection stops working
- Search endpoint changed: Name detection stops working
- Non-breaking: Feature degrades gracefully to no warnings

---

## Rollout Plan

### Phase 1: Core Infrastructure (Milestone 1)

- [ ] Add `findRecipeByURL` and `searchRecipesByName` to network.ts
- [ ] Add URL normalization utility function
- [ ] Add unit tests for new API functions
- [ ] Enhance `testScrapeUrlDetailed` to return recipe name

### Phase 2: Detection Logic (Milestone 2)

- [ ] Add `checkForDuplicates` to storage.ts
- [ ] Extend cache types to store duplicate detection results
- [ ] Update `checkStorageAndUpdateBadge` to call duplicate detection
- [ ] Add unit tests for detection logic

### Phase 3: Context Menu Enhancement (Milestone 3)

- [ ] Add multiple menu item support to contextMenu.ts
- [ ] Implement `updateContextMenu` with duplicate warnings
- [ ] Add menu cleanup functions
- [ ] Add unit tests for menu management

### Phase 4: User Interaction (Milestone 4)

- [ ] Add group slug to storage types and auth flow
- [ ] Implement duplicate menu click handlers in background.ts
- [ ] Open recipe page or search page based on menu selection
- [ ] Add logging for user interactions

### Phase 5: Testing & Polish (Milestone 5)

- [ ] Manual testing of all duplicate scenarios
- [ ] Performance testing with cache behavior
- [ ] Edge case testing (URL normalization, errors)
- [ ] Documentation updates

---

## Future Enhancements (Post-MVP)

### Similarity Scoring

- Calculate Levenshtein distance for name matches
- Show similarity percentage in menu: "💡 Similar: Chicken Pasta (92%)"
- Only show matches above threshold (e.g., >75%)

### Duplicate Prevention Option

- Add setting: "Warn before importing duplicates" (default: on)
- Add setting: "Block duplicate imports" (default: off)
- Store user preference in sync storage

### Multi-field Matching

- Compare ingredients list (requires parsing)
- Compare cooking time / servings
- Aggregate confidence score from multiple signals

### Duplicate Management

- Show "Already imported" badge on extension icon
- Add "View in Mealie" as primary action when exact match found
- Allow quick duplicate merge/delete from extension

### Recipe History

- Track all imported recipes in local storage
- Show "imported 2 weeks ago" in duplicate warning
- Provide import history view in popup

---

## Open Questions

1. **Group slug storage**: Should we fetch on every auth, or cache long-term?

    - **Decision**: Cache long-term in sync storage, refresh on auth

2. **Name matching threshold**: How many similar recipes to show?

    - **Decision**: Top 5 results from Mealie's search, let user decide

3. **URL normalization strictness**: Remove all query params or keep some?

    - **Decision**: Remove tracking params (utm\_\*, fbclid), keep recipe-specific params

4. **Recipe name availability**: Will Mealie's test-scrape-url return the name?

    - **Decision**: Parse from response if available, otherwise skip name detection

5. **Menu item ordering**: Should duplicate warnings appear above or below create action?
    - **Decision**: Below, so primary action stays in same position (muscle memory)

---

## Success Metrics

**Feature adoption:**

- % of recipe detections that also check for duplicates
- % of duplicate warnings shown (url vs name type)
- % of users who click duplicate warnings (engagement)

**Duplicate prevention:**

- Reduction in duplicate recipe reports/complaints
- User feedback on warning accuracy

**Performance:**

- Duplicate detection latency (target: <500ms)
- Cache hit rate (target: >70%)
- False positive rate (target: <10% for URL matches)

---

## References

- **Mealie API Docs**: https://docs.mealie.io/api/redoc/
- **Recipe Schema**: See "Recipe: CRUD" section for full response structure
- **Query Filter Syntax**: See "Pagination and Filtering" for filter examples
- **Chrome Context Menus API**: https://developer.chrome.com/docs/extensions/reference/contextMenus/
