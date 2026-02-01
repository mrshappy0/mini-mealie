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
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
