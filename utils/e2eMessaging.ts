/**
 * Internal `chrome.runtime.sendMessage` type used by the E2E harnesses to trigger
 * the same `runCreateRecipe(tab)` path as the context-menu "Save to Mini Mealie" click.
 *
 * This is the only trigger that behaves identically in both targets: Chrome MV3 exposes
 * a keyboard `command` (Ctrl+Shift+M), but Firefox MV2 has no `commands` block, so the
 * message hook is the canonical cross-browser trigger.
 *
 * Only reachable from the extension's own contexts (popup / other extension pages), never
 * from a normal web page — `onMessage` (unlike `onMessageExternal`) does not receive
 * messages from web content.
 */
export const MINI_MEALIE_E2E_RUN_CREATE_RECIPE_MESSAGE =
    'mini-mealie/e2e/run-create-recipe' as const;
