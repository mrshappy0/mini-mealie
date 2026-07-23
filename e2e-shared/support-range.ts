import { readFileSync } from 'node:fs';
import path from 'node:path';

import { REPO_ROOT } from './config';

/**
 * Supported Mealie ends for the PR e2e gate.
 * Source of truth: `e2e-shared/support-range.json`.
 * Raising `mealie.oldest` is an intentional, documented change.
 */
export type SupportRange = {
    mealie: {
        repository: string;
        oldest: string;
        newest: string;
    };
};

let cached: SupportRange | undefined;

export function loadSupportRange(): SupportRange {
    if (cached) return cached;
    const file = path.join(REPO_ROOT, 'e2e-shared/support-range.json');
    cached = JSON.parse(readFileSync(file, 'utf8')) as SupportRange;
    return cached;
}

/** Full image ref for a Mealie tag from the support file (e.g. `…/mealie:v3.20.1`). */
export function mealieImageFor(tag: string, range = loadSupportRange()): string {
    return `${range.mealie.repository}:${tag}`;
}

/** Default local / unset-env Mealie image: newest end of the support range. */
export function defaultMealieImage(range = loadSupportRange()): string {
    return mealieImageFor(range.mealie.newest, range);
}
