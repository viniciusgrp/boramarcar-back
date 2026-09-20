import {
  computeTourFitScale,
  flattenTourStepIds,
  nextTourIndex,
  previousTourIndex,
  resolveCompactSpotlightZoom,
  resolveTourHighlightZoom,
  shouldUseCompactTourMock,
  resolveActiveTourTopicId,
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

  it('skips highlight zoom only while the mockup is heavily scaled down', () => {
    expect(resolveTourHighlightZoom(1.2, 0.5)).toBe(1);
    expect(resolveTourHighlightZoom(1.2, 0.9)).toBe(1.08);
    expect(resolveTourHighlightZoom(1.2, 1)).toBe(1.2);
    expect(resolveTourHighlightZoom(undefined, 1)).toBe(1.12);
  });

  it('uses compact mock chrome from the container width, not the fit scale', () => {
    expect(shouldUseCompactTourMock(360)).toBe(true);
    expect(shouldUseCompactTourMock(639)).toBe(true);
    expect(shouldUseCompactTourMock(640)).toBe(false);
    expect(shouldUseCompactTourMock(0)).toBe(false);
  });

  it('zooms a small highlight to fill the compact camera window', () => {
    expect(resolveCompactSpotlightZoom(360, 220, 80, 40)).toBe(2.2);
    expect(resolveCompactSpotlightZoom(360, 220, 400, 250)).toBe(1);
    expect(resolveCompactSpotlightZoom(0, 220, 80, 40)).toBe(1);
  });

  it('keeps a valid tour topic from the URL and falls back to the first topic', () => {
    const topicIds = ['estabelecimento', 'cliente'];
    expect(resolveActiveTourTopicId('cliente', topicIds)).toBe('cliente');
    expect(resolveActiveTourTopicId('painel', topicIds)).toBe('estabelecimento');
    expect(resolveActiveTourTopicId(null, topicIds)).toBe('estabelecimento');
    expect(resolveActiveTourTopicId('cliente', [])).toBeNull();
  });
});
