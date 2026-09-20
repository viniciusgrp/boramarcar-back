import {
  computeTourFitScale,
  flattenTourStepIds,
  nextTourIndex,
  previousTourIndex,
  resolveTourHighlightZoom,
  shouldUseCompactTourMock,
  wrapTourIndex,
} from './tour-player.util';

describe('tour-player.util', () => {
  const topics = [
    { id: 'agenda', steps: [{ id: 'day' }, { id: 'status' }] },
    { id: 'servicos', steps: [{ id: 'list' }] },
  ];

  it('flattens topic steps in order', () => {
    expect(flattenTourStepIds(topics)).toEqual([
      'agenda:day',
      'agenda:status',
      'servicos:list',
    ]);
  });

  it('advances without wrapping past the last step', () => {
    expect(nextTourIndex(0, 3)).toBe(1);
    expect(nextTourIndex(2, 3)).toBe(2);
    expect(nextTourIndex(0, 0)).toBe(0);
  });

  it('goes back without going below zero', () => {
    expect(previousTourIndex(2)).toBe(1);
    expect(previousTourIndex(0)).toBe(0);
  });

  it('wraps for autoplay loops', () => {
    expect(wrapTourIndex(2, 3, 1)).toBe(0);
    expect(wrapTourIndex(0, 3, -1)).toBe(2);
  });

  it('scales the desktop mockup down to the phone width', () => {
    expect(computeTourFitScale(0)).toBe(1);
    expect(computeTourFitScale(360)).toBe(0.5);
    expect(computeTourFitScale(1200)).toBe(1);
  });

  it('skips highlight zoom while the mockup is fitted to a narrow screen', () => {
    expect(resolveTourHighlightZoom(1.2, 0.5)).toBe(1);
    expect(resolveTourHighlightZoom(1.2, 1)).toBe(1.2);
    expect(resolveTourHighlightZoom(undefined, 1)).toBe(1.12);
  });

  it('uses compact mock chrome only while the mockup is scaled to a phone', () => {
    expect(shouldUseCompactTourMock(0.5)).toBe(true);
    expect(shouldUseCompactTourMock(1)).toBe(false);
    expect(shouldUseCompactTourMock(0)).toBe(false);
  });
});
