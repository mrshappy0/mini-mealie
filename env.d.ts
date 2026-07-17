/// <reference types="vite/client" />

interface ImportMetaEnv {
    // Built-in WXT/Vite env vars
    readonly DEV: boolean;
    readonly PROD: boolean;
    readonly MODE: string;

    // Custom Mealie dev environment vars
    readonly WXT_MEALIE_SERVER?: string;
    readonly WXT_MEALIE_API_TOKEN?: string;
    readonly WXT_MEALIE_USERNAME?: string;

    // Statically replaced by wxt.config.ts `vite.define` (JSON boolean). `true` only in
    // E2E builds (WXT_E2E=true), so the E2E message hook in background.ts is tree-shaken
    // out of production store builds.
    readonly WXT_E2E: boolean;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
