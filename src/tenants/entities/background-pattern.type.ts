export const BACKGROUND_PATTERN_IDS = [
  'barbershop',
  'salon_manicure',
  'esthetics',
  'studio',
  'clinic',
  'pet',
  'neutral',
] as const;

export type BackgroundPatternId = (typeof BACKGROUND_PATTERN_IDS)[number];

export const DEFAULT_BACKGROUND_PATTERN_ID: BackgroundPatternId = 'barbershop';
export const DEFAULT_BACKGROUND_PATTERN_COLOR = '#64748b';
export const DEFAULT_BACKGROUND_PATTERN_ICON_COUNT = 22;
export const MIN_BACKGROUND_PATTERN_ICON_COUNT = 8;
export const MAX_BACKGROUND_PATTERN_ICON_COUNT = 32;

export const BACKGROUND_PATTERN_ID_SET = new Set<string>(BACKGROUND_PATTERN_IDS);
