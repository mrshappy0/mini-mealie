export interface User {
    admin: boolean;
    email: string;
    fullName: string;
    group: string;
    household: string;
    username: string;
}

export enum Protocol {
    HTTP = 'http://',
    HTTPS = 'https://',
}
