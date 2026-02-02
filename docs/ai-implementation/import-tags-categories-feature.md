# Import Tags & Categories Feature

**Feature Request**: Add checkboxes to enable importing original keywords as tags and categories when creating recipes in Mealie.

**API Support**: Both `/api/recipes/create/url` and `/api/recipes/create/html-or-json` endpoints support `includeTags` and `includeCategories` boolean parameters.

**Design Decision**: Two separate checkboxes, both default to `false`, persist in sync storage.

---

## Implementation Plan

### 1. Storage Layer (`utils/types/storageTypes.ts`)

**Changes:**

- Add `importTags?: boolean` to `StorageData` interface
- Add `importCategories?: boolean` to `StorageData` interface
- Add `'importTags'` to `storageKeys` array
- Add `'importCategories'` to `storageKeys` array

**Defaults**: Both default to `false` when not present in storage.

---

### 2. Network Layer (`utils/network.ts`)

**`createRecipeFromURL` function:**

- Add optional parameters: `includeTags?: boolean`, `includeCategories?: boolean`
- Include both in request body when calling the API
- Default to `false` if not provided

**`createRecipeFromHTML` function:**

- Add optional parameters: `includeTags?: boolean`, `includeCategories?: boolean`
- Replace hardcoded `includeTags: false` with parameter value
- Add `includeCategories` to request body
- Default to `false` if not provided

**Request body format:**

```typescript
// URL mode
{
    url, includeTags, includeCategories;
}

// HTML mode
{
    data, url, includeTags, includeCategories;
}
```

---

### 3. Invoke Layer (`utils/invoke.ts`)

**`runCreateRecipe` function:**

- Read `importTags` and `importCategories` from `chrome.storage.sync.get()`
- Pass both values to `createRecipeFromURL()` call
- Pass both values to `createRecipeFromHTML()` call
- Default both to `false` if not in storage

---

### 4. UI Layer (`entrypoints/popup/App.tsx`)

**State:**

- Add `const [importTags, setImportTags] = useState(false)`
- Add `const [importCategories, setImportCategories] = useState(false)`

**Load from storage (in `useEffect`):**

- Read `importTags` and `importCategories` from storage
- Set state with loaded values (default `false`)

**Update functions:**

- Create `handleImportTagsChange` to toggle and save to storage
- Create `handleImportCategoriesChange` to toggle and save to storage

**Clear settings:**

- Reset both to `false` in `clearSettings()` function

**UI placement:**

- Add two checkboxes between the recipe mode selector and "Disconnect Server" button
- Wrap in a container div with appropriate styling

**Checkbox labels:**

- "Import tags from recipe"
- "Import categories from recipe"

---

### 5. Testing (`utils/tests/network.test.ts`)

**New test cases:**

**For `createRecipeFromURL`:**

- Test with `includeTags: true, includeCategories: true`
- Test with `includeTags: false, includeCategories: false`
- Test with mixed values
- Test that parameters are included in request body
- Test defaults when parameters omitted

**For `createRecipeFromHTML`:**

- Test with `includeTags: true, includeCategories: true`
- Test with `includeTags: false, includeCategories: false`
- Test with mixed values
- Test that parameters are included in request body
- Test defaults when parameters omitted

**Test verification:**

- Mock `fetch` calls and verify body contains correct boolean values
- Ensure existing tests still pass

---

### 6. Logging (optional but recommended)

**In `utils/invoke.ts`:**

- Add log data showing `includeTags` and `includeCategories` values when creating recipes
- Include in both URL and HTML mode logging

---

## Implementation Order

1. **Storage types** - Foundation for everything else
2. **Network layer** - Core API integration
3. **Tests** - Validate network changes work correctly
4. **Invoke layer** - Wire storage to network calls
5. **UI layer** - User-facing controls
6. **Manual testing** - Verify end-to-end flow

---

## Testing Checklist

- [ ] Type checking passes (`pnpm compile`)
- [ ] Linting passes (`pnpm lint`)
- [ ] Unit tests pass (`pnpm test`)
- [ ] Coverage maintained or improved (`pnpm coverage`)
- [ ] Manual test: Checkboxes appear when connected
- [ ] Manual test: Checkboxes persist across popup close/open
- [ ] Manual test: Both checkboxes unchecked creates recipe without tags/categories
- [ ] Manual test: Tags checkbox checked includes tags in Mealie
- [ ] Manual test: Categories checkbox checked includes categories in Mealie
- [ ] Manual test: Both checked works correctly
- [ ] Manual test: Works in both URL and HTML modes
- [ ] Manual test: Settings cleared on disconnect

---

## Known Considerations

- Line endings must be LF (Unix-style), not CRLF
- Follow existing patterns for storage read/write
- Use auto-imports where possible
- Keep TypeScript strict (no `any` types)
- Small, focused commits with conventional commit messages
- Update both URL and HTML code paths consistently

---

## Future Enhancements (out of scope)

- Per-mode settings (separate for URL vs HTML)
- Tooltip/help text explaining what these options do
- Visual indicator when recipe is created with tags/categories enabled
