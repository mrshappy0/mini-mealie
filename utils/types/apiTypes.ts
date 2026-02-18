export interface User {
    admin: boolean;
    email: string;
    fullName: string;
    group: string;
    household: string;
    username: string;
}

export interface RecipeSummary {
    id: string;
    name: string;
    slug: string;
    orgURL?: string | null;
}

export enum Protocol {
    HTTP = 'http://',
    HTTPS = 'https://',
}
