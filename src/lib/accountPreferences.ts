export const ACCOUNT_MODE_OPTIONS = ['edit', 'generate', 'clip'] as const;
export const ACCOUNT_ASPECT_OPTIONS = ['9:16', '1:1', '16:9'] as const;
export const ACCOUNT_CAPTION_OPTIONS = ['auto', 'clean', 'meme', 'karaoke', 'none'] as const;

export type AccountPreferencesValue = {
  defaultMode: (typeof ACCOUNT_MODE_OPTIONS)[number];
  defaultAspect: (typeof ACCOUNT_ASPECT_OPTIONS)[number];
  defaultCaptionStyle: (typeof ACCOUNT_CAPTION_OPTIONS)[number];
  openFinishedInStudio: boolean;
  showShortcutHints: boolean;
};

export const DEFAULT_ACCOUNT_PREFERENCES: AccountPreferencesValue = {
  defaultMode: 'generate',
  defaultAspect: '9:16',
  defaultCaptionStyle: 'auto',
  openFinishedInStudio: true,
  showShortcutHints: true,
};

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

export function normalizeAccountPreferences(value: Partial<AccountPreferencesValue> | null | undefined): AccountPreferencesValue {
  return {
    defaultMode: includes(ACCOUNT_MODE_OPTIONS, value?.defaultMode) ? value.defaultMode : DEFAULT_ACCOUNT_PREFERENCES.defaultMode,
    defaultAspect: includes(ACCOUNT_ASPECT_OPTIONS, value?.defaultAspect) ? value.defaultAspect : DEFAULT_ACCOUNT_PREFERENCES.defaultAspect,
    defaultCaptionStyle: includes(ACCOUNT_CAPTION_OPTIONS, value?.defaultCaptionStyle) ? value.defaultCaptionStyle : DEFAULT_ACCOUNT_PREFERENCES.defaultCaptionStyle,
    openFinishedInStudio: typeof value?.openFinishedInStudio === 'boolean' ? value.openFinishedInStudio : DEFAULT_ACCOUNT_PREFERENCES.openFinishedInStudio,
    showShortcutHints: typeof value?.showShortcutHints === 'boolean' ? value.showShortcutHints : DEFAULT_ACCOUNT_PREFERENCES.showShortcutHints,
  };
}
