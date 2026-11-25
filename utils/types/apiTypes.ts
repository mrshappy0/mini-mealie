export interface User {
    admin: boolean;
    email: string;
    fullName: string;
    group: string;
    groupSlug: string;
    household: string;
    username: string;
}

export interface RecipeSummary {
    id: string;
    name: string;
    slug: string;
    orgURL?: string | null;
}

export type PlanEntryType =
    'breakfast' | 'lunch' | 'dinner' | 'side' | 'snack' | 'drink' | 'dessert';

export interface MealPlanEntry {
    id: number;
    date: string;
    entryType: PlanEntryType;
    title: string;
    text: string;
    recipeId: string | null;
    recipe?: RecipeSummary | null;
}

export interface ShoppingListSummary {
    id: string;
    name: string | null;
}

export enum Protocol {
    HTTP = 'http://',
    HTTPS = 'https://',
}
