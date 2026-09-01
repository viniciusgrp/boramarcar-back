import {
  normalizeBackgroundPatternColor,
  normalizeBackgroundPatternIconCount,
  normalizeBackgroundPatternId,
} from './background-pattern.util';

interface PatternSlot {
  x: number;
  y: number;
  r: number;
}

const PATTERN_SLOTS: PatternSlot[] = [
  { x: 18, y: 22, r: -18 },
  { x: 78, y: 16, r: 10 },
  { x: 148, y: 20, r: -8 },
  { x: 208, y: 20, r: 8 },
  { x: 24, y: 66, r: -14 },
  { x: 92, y: 60, r: 6 },
  { x: 160, y: 58, r: -10 },
  { x: 216, y: 74, r: 12 },
  { x: 20, y: 110, r: 10 },
  { x: 86, y: 106, r: 20 },
  { x: 146, y: 104, r: -12 },
  { x: 210, y: 118, r: -14 },
  { x: 24, y: 152, r: 12 },
  { x: 90, y: 150, r: -8 },
  { x: 154, y: 154, r: 8 },
  { x: 210, y: 166, r: -18 },
  { x: 26, y: 200, r: -10 },
  { x: 92, y: 206, r: 14 },
  { x: 156, y: 202, r: -16 },
  { x: 212, y: 212, r: 10 },
  { x: 50, y: 116, r: 6 },
  { x: 126, y: 210, r: -12 },
  { x: 50, y: 38, r: 12 },
  { x: 118, y: 40, r: -16 },
  { x: 180, y: 88, r: 8 },
  { x: 58, y: 176, r: -6 },
  { x: 128, y: 78, r: 14 },
  { x: 188, y: 140, r: -10 },
  { x: 8, y: 178, r: 16 },
  { x: 70, y: 218, r: -8 },
  { x: 172, y: 32, r: 6 },
  { x: 230, y: 48, r: -12 },
];

export interface BuildBackgroundPatternSvgOptions {
  id?: string | null;
  color?: string | null;
  iconCount?: number | null;
}

export function buildBackgroundPatternSvg(
  options: BuildBackgroundPatternSvgOptions = {},
): string {
  const id = normalizeBackgroundPatternId(options.id);
  const color = normalizeBackgroundPatternColor(options.color);
  const iconCount = normalizeBackgroundPatternIconCount(options.iconCount);
  const uses = PATTERN_SLOTS.slice(0, iconCount)
    .map(
      (slot, index) =>
        `<use href="#${id}-mark" transform="translate(${slot.x} ${slot.y}) rotate(${slot.r})" data-index="${index}"/>`,
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240" fill="none" stroke="${color}" stroke-width="1.6"><defs><g id="${id}-mark"><circle cx="4" cy="4" r="3"/></g></defs>${uses}</svg>`;
}

export function countPatternUses(svg: string): number {
  return (svg.match(/<use /g) ?? []).length;
}
