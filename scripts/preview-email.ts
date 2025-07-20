import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const tag = 'v0.4.12';
const items = [
    'Improved scraping accuracy',
    'Bug fix: version bump matches manifest',
    'Polish and cleanup tasks',
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatePath = join(__dirname, './email-templates/mini-mealie-release.html');
let html = readFileSync(templatePath, 'utf-8');

html = html.replace(/{{TAG}}/g, tag);

const itemsHtml = items
    .map(
        (item) =>
            `<li><span style="font-size:15px;line-height:24px;color:#374151">${item}</span></li>`,
    )
    .join('\n');

html = html.replace('{{ITEMS}}', `<ul style="padding-left:20px;margin-top:0">${itemsHtml}</ul>`);
writeFileSync('test-output.html', html);
