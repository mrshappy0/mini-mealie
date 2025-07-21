import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const tag = 'v0.4.12';

const body = `
## [0.4.6](https://github.com/mrshappy0/mini-mealie/compare/v0.4.5...v0.4.6) (2025-06-17)

### Bug Fixes

* add @semantic-release/git ([383ec27](https://github.com/mrshappy0/mini-mealie/commit/383ec27))
* add semantic release - git ([624e986](https://github.com/mrshappy0/mini-mealie/commit/624e986))
* another attempt to fix package version bump ([e918751](https://github.com/mrshappy0/mini-mealie/commit/e918751))
* ensure package.json bump is pushed to repo ([7164302](https://github.com/mrshappy0/mini-mealie/commit/7164302))
* remove tarbell option ([3f62118](https://github.com/mrshappy0/mini-mealie/commit/3f62118))`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatePath = join(__dirname, './email-templates/mini-mealie-release.html');
let html = readFileSync(templatePath, 'utf-8');

function extractReleaseItems(body: string): string[] {
    const repo = 'mrshappy0/mini-mealie';
    const lines = body.split('\n');

    const items: string[] = [];
    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('###') || trimmed.startsWith('##')) continue;
        if (/^[-*+]\s+/.test(trimmed)) {
            let item = trimmed.replace(/^[-*+]\s+/, '');

            item = item.replace(/\[([0-9a-f]{7,})\]\(https:\/\/github\.com\/[^)]+\)/gi, '$1');

            item = item.replace(/\(([0-9a-f]{7,})\)/gi, (_, hash) => {
                const url = `https://github.com/${repo}/commit/${hash}`;
                return `(<a href="${url}">${hash}</a>)`;
            });

            items.push(item);
        }
    }

    return items;
}

const items = extractReleaseItems(body);

html = html.replace(/{{TAG}}/g, tag);

const itemsHtml = items
    .map(
        (item) =>
            `<li><span style="font-size:15px;line-height:24px;color:#374151">${item}</span></li>`,
    )
    .join('\n');

html = html.replace('{{ITEMS}}', `<ul style="padding-left:20px;margin-top:0">${itemsHtml}</ul>`);
writeFileSync('test-output.html', html);
