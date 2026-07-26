import { readFileSync } from 'node:fs';
import path from 'node:path';

import { REPO_ROOT } from './config';

/**
 * Supported Mealie / Chrome ends for the PR e2e gate.
 * Source of truth: `e2e-shared/support-range.json`.
 * Raising any `*.oldest` field is an intentional, documented change.
 *
 * Chrome ends are pinned Chrome for Testing build ids (not Playwright’s bundled
 * Chromium). Canary still floats `latest` and is not stored in this file.
 */
export type SupportRange = {
    mealie: {
        repository: string;
        oldest: string;
        newest: string;
    };
    chrome: {
        /** Pinned CfT build for the oldest supported Chrome (backward-compat floor). */
        oldest: string;
        /** Pinned CfT Stable build for the newest supported Chrome. */
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
