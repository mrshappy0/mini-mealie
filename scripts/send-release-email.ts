import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { Resend } from 'resend';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatePath = join(__dirname, './email-templates/mini-mealie-release.html');
let html = readFileSync(templatePath, 'utf-8');

const rawTag = process.env.RELEASE_TAG;
const rawBody = process.env.RELEASE_BODY;
const rawApiKey = process.env.RESEND_API_KEY;
const rawAudienceId = process.env.RESEND_AUDIENCE_ID;

if (!rawTag || !rawBody || !rawApiKey || !rawAudienceId) {
    console.error(
        'Missing required environment variables: RELEASE_TAG and/or RELEASE_BODY, RESEND_API_KEY, RESEND_AUDIENCE_ID.',
    );
    process.exit(1);
}

const tag = rawTag as string;
const body = rawBody as string;
const apiKey = rawApiKey as string;
const audienceId = rawAudienceId as string;
const resend = new Resend(apiKey);

function generateBroadcastName(tag: string): string {
    const now = new Date().toISOString().replace(/[:.]/g, '-');
    return `Mini Mealie ${tag} - ${now}`;
}

function extractReleaseItems(body: string): string[] {
    const repo = 'mrshappy0/mini-mealie';
    const lines = body.split('\n');

    const items: string[] = [];
    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('###') || trimmed.startsWith('##')) continue;
        if (/^[-*+]\s+/.test(trimmed)) {
            let item = trimmed.replace(/^[-*+]\s+/, '');

            // Replace raw markdown link with commit hash
            // e.g. ([be530c2](https://...)) → (be530c2)
            item = item.replace(/\[([0-9a-f]{7,})\]\(https:\/\/github\.com\/[^)]+\)/gi, '$1');

            // Then convert plain (be530c2) to HTML link
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

async function sendEmail() {
    const { data: createData, error: createError } = await resend.broadcasts.create({
        audienceId,
        name: generateBroadcastName(tag),
        from: 'Mini Mealie <no-reply@shaplabs.net>',
        subject: `🎉 New Mini Mealie Release: ${tag}`,
        html,
    });

    if (createError) {
        console.error('Failed to create broadcast:', createError);
        process.exit(1);
    }

    const broadcastId = createData?.id;
    if (!broadcastId) {
        console.error('Broadcast created but ID is missing.');
        process.exit(1);
    }

    const { data: sendData, error: sendError } = await resend.broadcasts.send(broadcastId);

    if (sendError) {
        console.error('Failed to send broadcast:', sendError);
        process.exit(1);
    }

    console.log('Broadcast sent successfully:', sendData);
}

sendEmail();
