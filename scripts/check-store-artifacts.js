#!/usr/bin/env node
/**
 * Verify that `wxt zip` produced exactly the artifacts submit.yml will hand to
 * the stores.
 *
 * WHY THIS EXISTS
 * ---------------
 * submit.yml passes shell globs to `wxt submit`:
 *
 *     --firefox-zip         .output/*-firefox.zip
 *     --firefox-sources-zip .output/*-sources.zip
 *     --chrome-zip          .output/*-chrome.zip
 *
 * Those globs encode an assumption about wxt's artifact naming
 * (`{{name}}-{{packageVersion}}-{{browser}}{{modeSuffix}}.zip` and
 * `{{name}}-{{packageVersion}}-sources{{modeSuffix}}.zip`). If a wxt bump
 * renames or stops emitting an artifact, an unmatched glob is passed through
 * literally by bash and the failure surfaces as a confusing store-side error
 * during a release — or, worse, a submission missing its sources zip.
 *
 * The patterns are parsed out of submit.yml rather than duplicated here, so the
 * workflow stays the single source of truth and this check cannot silently
 * drift from what actually ships.
 *
 * Usage:  node scripts/check-store-artifacts.js [firefox|chrome]
 *         (no argument checks every store)
 */
import { glob, readFile } from 'node:fs/promises';
import process from 'node:process';

const WORKFLOW = '.github/workflows/submit.yml';

/**
 * Which `--*-zip` flags in submit.yml belong to which store. A Map rather than a
 * plain object so lookups by CLI argument aren't a dynamic property read.
 */
const STORE_FLAGS = new Map([
    ['firefox', ['firefox-zip', 'firefox-sources-zip']],
    ['chrome', ['chrome-zip']],
]);

/**
 * Pull the glob a given `--<flag>` is invoked with out of the workflow, so the
 * check always reflects what submit.yml actually passes. Scans lines rather than
 * building a regex from the flag name, which keeps the match anchored to a real
 * `--flag value` pair (`--firefox-zip ` cannot match `--firefox-sources-zip`).
 */
function extractPattern(workflow, flag) {
    const line = workflow.split('\n').find((l) => l.includes(`--${flag} `));
    const pattern = line?.trim().split(/\s+/)[1];
    if (!pattern) {
        throw new Error(
            `Could not find \`--${flag}\` in ${WORKFLOW}. If the flag was renamed or ` +
                `removed, update STORE_FLAGS in this script to match.`,
        );
    }
    return pattern;
}

async function main() {
    const requested = process.argv[2];
    if (requested && !STORE_FLAGS.has(requested)) {
        console.error(
            `Unknown store "${requested}". Expected one of: ${[...STORE_FLAGS.keys()].join(', ')}`,
        );
        process.exit(2);
    }

    const workflow = await readFile(WORKFLOW, 'utf8');
    const stores = requested ? [requested] : [...STORE_FLAGS.keys()];
    const failures = [];

    for (const store of stores) {
        for (const flag of STORE_FLAGS.get(store)) {
            const pattern = extractPattern(workflow, flag);
            const matches = [];
            for await (const entry of glob(pattern)) matches.push(entry);

            if (matches.length === 1) {
                console.log(`ok    --${flag}  ${pattern}  ->  ${matches[0]}`);
            } else if (matches.length === 0) {
                failures.push(
                    `--${flag}: pattern "${pattern}" matched no files. wxt likely renamed or ` +
                        `stopped emitting this artifact.`,
                );
            } else {
                failures.push(
                    `--${flag}: pattern "${pattern}" matched ${matches.length} files ` +
                        `(${matches.join(', ')}). The submit step needs exactly one.`,
                );
            }
        }
    }

    if (failures.length > 0) {
        console.error('\nStore artifact contract violated:\n');
        for (const failure of failures) console.error(`  - ${failure}`);
        console.error(
            `\nsubmit.yml would pass an unmatched glob straight through to \`wxt submit\`, ` +
                `failing the release. Fix wxt's zip config or update the globs in ${WORKFLOW}.\n`,
        );
        process.exit(1);
    }

    console.log(`\nAll store artifacts match the globs in ${WORKFLOW}.`);
}

await main();
