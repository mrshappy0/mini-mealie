import { normalizeMealieServerBaseUrl, normalizeUrl } from '../utils/network';

/**
 * Browser-agnostic Mealie assertions used by both harnesses (Playwright + Selenium).
 * Uses the global `fetch` (Node 18+) so it carries no Playwright dependency.
 */

export type MealieRecipeSummary = {
    slug: string;
    name?: string;
    orgURL?: string | null;
};

async function fetchRecentRecipes(
    mealieBase: string,
    token: string,
    perPage = 100,
): Promise<MealieRecipeSummary[]> {
    const base = normalizeMealieServerBaseUrl(mealieBase);
    const apiUrl = new URL('/api/recipes', base);
    apiUrl.searchParams.set('perPage', String(perPage));
    apiUrl.searchParams.set('orderBy', 'dateUpdated');
    apiUrl.searchParams.set('orderDirection', 'desc');

    const res = await fetch(apiUrl.href, {
        headers: {
            Authorization: `Bearer ${token.trim()}`,
            Accept: 'application/json',
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`GET ${apiUrl.href} failed: ${res.status} ${text}`);
    }
    const data = (await res.json()) as { items?: MealieRecipeSummary[] };
    return data.items ?? [];
}

/**
 * Poll `GET /api/recipes` until a recipe appears that matches the import.
 *
 * Matches on `orgURL` and/or `name` (either is sufficient), never on slug: Mealie appends
 * `-1`, `-2`, … to duplicate slugs, so re-running against the same recipe would fail on slug
 * even when the import succeeded.
 * - `matchUrl` → recipe's source URL (`orgURL`), stable across re-imports of a live site.
 * - `matchName` → recipe name, used for the hermetic fixture where HTML-mode imports leave
 *   `orgURL` empty (no canonical/og:url in the page). Matched case-insensitively.
 */
export async function waitForRecipe(options: {
    mealieBase: string;
    token: string;
    matchUrl?: string;
    matchName?: string;
    timeoutMs: number;
    intervalMs?: number;
}): Promise<MealieRecipeSummary> {
    const { mealieBase, token, matchUrl, matchName, timeoutMs, intervalMs = 3000 } = options;
    if (!matchUrl && !matchName) throw new Error('waitForRecipe: pass matchUrl and/or matchName');

    const deadline = Date.now() + timeoutMs;
    const normalizedUrl = matchUrl ? normalizeUrl(matchUrl) : undefined;
    const nameNeedle = matchName?.trim().toLowerCase();
    let lastCount = 0;

    const matches = (r: MealieRecipeSummary): boolean => {
        if (normalizedUrl && r.orgURL && normalizeUrl(r.orgURL) === normalizedUrl) return true;
        if (nameNeedle && r.name && r.name.trim().toLowerCase().includes(nameNeedle)) return true;
        return false;
    };

    while (Date.now() < deadline) {
        const recipes = await fetchRecentRecipes(mealieBase, token);
        lastCount = recipes.length;
        const hit = recipes.find(matches);
        if (hit) return hit;
        await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new Error(
        `Timed out waiting for a recipe matching ${matchName ? `name "${matchName}"` : ''}${
            matchName && matchUrl ? ' or ' : ''
        }${matchUrl ? `orgURL ${matchUrl}` : ''}. Last fetch had ${lastCount} recipes.`,
    );
}
