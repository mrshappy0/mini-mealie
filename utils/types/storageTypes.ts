export const storageKeys = [
    'mealieServer',
    'mealieApiToken',
    'mealieUsername',
    'ladderEnabled',
] as const;
type StorageKey = (typeof storageKeys)[number];
export type StorageData = Partial<Record<StorageKey, string> & Record<'ladderEnabled', boolean>>;
