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
		</div>
	`;
}

async function sendEmail() {
    const { data, error } = await resend.broadcasts.create({
        audienceId,
        from: 'Mini Mealie <no-reply@shaplabs.net>',
        subject: `🎉 New Mini Mealie Release: ${tag}`,
        html: formatHTML(tag, body),
    });

    if (error) {
        console.error('Failed to send release email:', error);
        process.exit(1);
    }

    console.log('Email sent:', data);
}

sendEmail();
