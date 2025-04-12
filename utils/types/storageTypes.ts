export const storageKeys = ['mealieServer', 'mealieApiToken', 'mealieUsername'] as const;
type StorageKey = (typeof storageKeys)[number];
export type StorageData = Partial<Record<StorageKey, string>>;
