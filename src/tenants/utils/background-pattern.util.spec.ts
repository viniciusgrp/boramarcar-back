import { BACKGROUND_PATTERN_IDS } from '../entities/background-pattern.type';
import {
  DEFAULT_BACKGROUND_PATTERN_COLOR,
  DEFAULT_BACKGROUND_PATTERN_ICON_COUNT,
  DEFAULT_BACKGROUND_PATTERN_ID,
  MAX_BACKGROUND_PATTERN_ICON_COUNT,
  MIN_BACKGROUND_PATTERN_ICON_COUNT,
  normalizeBackgroundPatternColor,
  normalizeBackgroundPatternIconCount,
  normalizeBackgroundPatternId,
} from './background-pattern.util';
import {
  buildBackgroundPatternSvg,
  countPatternUses,
} from './background-pattern-svg.util';

describe('background-pattern.util', () => {
  it('keeps catalog ids and falls back to barbershop', () => {
    for (const id of BACKGROUND_PATTERN_IDS) {
      expect(normalizeBackgroundPatternId(id)).toBe(id);
    }

    expect(normalizeBackgroundPatternId('unknown')).toBe(
      DEFAULT_BACKGROUND_PATTERN_ID,
    );
    expect(normalizeBackgroundPatternId(null)).toBe(DEFAULT_BACKGROUND_PATTERN_ID);
  });

  it('normalizes hex color and falls back to slate', () => {
    expect(normalizeBackgroundPatternColor('#AABBCC')).toBe('#aabbcc');
    expect(normalizeBackgroundPatternColor('not-a-color')).toBe(
      DEFAULT_BACKGROUND_PATTERN_COLOR,
    );
    expect(normalizeBackgroundPatternColor(undefined)).toBe(
      DEFAULT_BACKGROUND_PATTERN_COLOR,
    );
  });

  it('clamps icon count between 8 and 32', () => {
    expect(normalizeBackgroundPatternIconCount(3)).toBe(
      MIN_BACKGROUND_PATTERN_ICON_COUNT,
    );
    expect(normalizeBackgroundPatternIconCount(40)).toBe(
      MAX_BACKGROUND_PATTERN_ICON_COUNT,
    );
    expect(normalizeBackgroundPatternIconCount(22.4)).toBe(
      DEFAULT_BACKGROUND_PATTERN_ICON_COUNT,
    );
    expect(normalizeBackgroundPatternIconCount(undefined)).toBe(
      DEFAULT_BACKGROUND_PATTERN_ICON_COUNT,
    );
  });
});

describe('background-pattern-svg.util', () => {
  it('embeds the stroke color and clamped use count', () => {
    const svg = buildBackgroundPatternSvg({
      id: 'clinic',
      color: '#b91c1c',
      iconCount: 8,
    });

    expect(svg).toContain('stroke="#b91c1c"');
    expect(svg).toContain('href="#clinic-mark"');
    expect(countPatternUses(svg)).toBe(8);
  });

  it('falls back to barbershop and default count for invalid input', () => {
    const svg = buildBackgroundPatternSvg({
      id: 'nope',
      color: 'red',
      iconCount: 2,
    });

    expect(svg).toContain(`href="#${DEFAULT_BACKGROUND_PATTERN_ID}-mark"`);
    expect(svg).toContain(`stroke="${DEFAULT_BACKGROUND_PATTERN_COLOR}"`);
    expect(countPatternUses(svg)).toBe(MIN_BACKGROUND_PATTERN_ICON_COUNT);
  });
});
