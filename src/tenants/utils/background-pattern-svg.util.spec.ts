import { buildBackgroundPatternSvg, countPatternUses } from './background-pattern-svg.util';

describe('background-pattern-svg.util', () => {
  it('renders the requested number of pattern uses', () => {
    const svg = buildBackgroundPatternSvg({ iconCount: 8, color: '#112233' });
    expect(countPatternUses(svg)).toBe(8);
    expect(svg).toContain('#112233');
  });
});
