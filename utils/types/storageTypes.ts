export const RecipeCreateMode = {
    URL: 'url',
    HTML: 'html',
} as const;

export type RecipeCreateMode = (typeof RecipeCreateMode)[keyof typeof RecipeCreateMode];

export const isRecipeCreateMode = (value: unknown): value is RecipeCreateMode =>
    value === RecipeCreateMode.URL || value === RecipeCreateMode.HTML;

export const storageKeys = [
    'mealieServer',
    'mealieApiToken',
    'mealieUsername',
    'recipeCreateMode',
    'suggestHtmlMode',
] as const;

export type StorageData = {
    mealieServer?: string;
    mealieApiToken?: string;
    mealieUsername?: string;
    recipeCreateMode?: RecipeCreateMode;
    suggestHtmlMode?: boolean;
};
