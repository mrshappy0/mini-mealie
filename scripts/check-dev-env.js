#!/usr/bin/env node
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const envLocalPath = join(rootDir, '.env.local');

if (!existsSync(envLocalPath)) {
    console.error('\n⚠️  Missing .env.local file!\n');
    console.error('📋 To set up your development environment:\n');
    console.error('1. Copy .env.local.example to .env.local');
    console.error('2. Fill in your Mealie server URL and API token\n');
    console.error('Example:');
    console.error('  cp .env.local.example .env.local\n');
    console.error(
        "Without this file, you'll need to manually configure the extension on each dev session.\n",
    );

    // Don't exit with error - just warn
    // This allows devs to proceed if they want manual setup
    console.log(
        'ℹ️  Continuing anyway - you can set up credentials manually in the extension popup.\n',
    );
}

// Basic validation if file exists
if (existsSync(envLocalPath)) {
    const content = readFileSync(envLocalPath, 'utf-8');
    const hasServer = /WXT_MEALIE_SERVER\s*=\s*.+/.test(content);
    const hasToken = /WXT_MEALIE_API_TOKEN\s*=\s*.+/.test(content);

    if (!hasServer || !hasToken) {
        console.warn('\n⚠️  .env.local exists but appears incomplete!\n');
        console.warn("Make sure you've set WXT_MEALIE_SERVER and WXT_MEALIE_API_TOKEN\n");
    } else {
        console.log('✅ .env.local detected - dev environment will be pre-configured\n');
    }
}
