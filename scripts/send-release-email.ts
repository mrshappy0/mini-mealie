import { Resend } from 'resend';

const rawTag = process.env.RELEASE_TAG;
const rawBody = process.env.RELEASE_BODY;
const rawApiKey = process.env.RESEND_API_KEY;

if (!rawTag || !rawBody || rawApiKey) {
    console.error(
        'Missing required environment variables: RELEASE_TAG and/or RELEASE_BODY, RELEASE_API_KEY.',
    );
    process.exit(1);
}

const tag = rawTag as string;
const body = rawBody as string;
const apiKey = rawApiKey as string;
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
    const { data, error } = await resend.emails.send({
        from: 'Mini Mealie <no-reply@shaplabs.net>',
        to: ['ajs11300@gmail.com', 'atom@shaplabs.net'], // Replace this later with real subscribers
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
