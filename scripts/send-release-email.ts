import { Resend } from 'resend';

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
    const now = new Date().toISOString().replace(/[:.]/g, '-'); // e.g., 2025-07-19T20-48-59-123Z
    return `Mini Mealie ${tag} - ${now}`;
}

function formatHTML(tag: string, body: string): string {
    const lines = body
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line);

    const list = lines.map((line) => `<li>${line}</li>`).join('\n');

    return `
		<div style="font-family: sans-serif; line-height: 1.6; color: #333;">
			<h1 style="color: #000;">🚀 Mini Mealie ${tag} Released</h1>
			<p>Here’s what’s new in this version:</p>
			<ul>${list}</ul>
			<p style="margin-top: 2em;">Thanks for supporting Mini Mealie! 🎉</p>
			<p>
				<a href="https://chromewebstore.google.com/detail/mini-mealie/lchfnbjpjoeejalacnpjnafenacmdocc" style="color: #007bff;">
					View in Chrome Web Store →
				</a>
			</p>
            <hr style="margin-top: 2em;"/>
            <p style="font-size: 0.8em; color: #888;">
                If you wish to unsubscribe, click here: <a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</a>
            </p>
		</div>
	`;
}

async function sendEmail() {
    const { data: createData, error: createError } = await resend.broadcasts.create({
        audienceId,
        name: generateBroadcastName(tag),
        from: 'Mini Mealie <no-reply@shaplabs.net>',
        subject: `🎉 New Mini Mealie Release: ${tag}`,
        html: formatHTML(tag, body),
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
