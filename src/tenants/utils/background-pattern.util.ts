import {
  BACKGROUND_PATTERN_ID_SET,
  DEFAULT_BACKGROUND_PATTERN_COLOR,
  DEFAULT_BACKGROUND_PATTERN_ICON_COUNT,
  DEFAULT_BACKGROUND_PATTERN_ID,
  MAX_BACKGROUND_PATTERN_ICON_COUNT,
  MIN_BACKGROUND_PATTERN_ICON_COUNT,
  type BackgroundPatternId,
} from '../entities/background-pattern.type';

export {
  BACKGROUND_PATTERN_IDS,
  BACKGROUND_PATTERN_ID_SET,
  DEFAULT_BACKGROUND_PATTERN_COLOR,
  DEFAULT_BACKGROUND_PATTERN_ICON_COUNT,
  DEFAULT_BACKGROUND_PATTERN_ID,
  MAX_BACKGROUND_PATTERN_ICON_COUNT,
  MIN_BACKGROUND_PATTERN_ICON_COUNT,
} from '../entities/background-pattern.type';
export type { BackgroundPatternId } from '../entities/background-pattern.type';

export function isBackgroundPatternId(value: unknown): value is BackgroundPatternId {
  return typeof value === 'string' && BACKGROUND_PATTERN_ID_SET.has(value);
}

export function normalizeBackgroundPatternId(
  value: string | null | undefined,
): BackgroundPatternId {
  return isBackgroundPatternId(value) ? value : DEFAULT_BACKGROUND_PATTERN_ID;
}

export function normalizeBackgroundPatternColor(
  value: string | null | undefined,
): string {
  if (typeof value !== 'string') {
    return DEFAULT_BACKGROUND_PATTERN_COLOR;
  }

  const trimmed = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(trimmed)
    ? trimmed
    : DEFAULT_BACKGROUND_PATTERN_COLOR;
}

export function normalizeBackgroundPatternIconCount(
  value: number | null | undefined,
): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_BACKGROUND_PATTERN_ICON_COUNT;
  }

  const rounded = Math.round(parsed);

  return Math.min(
    MAX_BACKGROUND_PATTERN_ICON_COUNT,
    Math.max(MIN_BACKGROUND_PATTERN_ICON_COUNT, rounded),
  );
}
