export interface TourTopicLike {
  id: string;
  steps: Array<{ id: string }>;
}

export const TOUR_MOCKUP_DESIGN_WIDTH = 720;

export const TOUR_MOCKUP_COMPACT_MAX_WIDTH = 640;

export function computeTourFitScale(
  containerWidth: number,
  designWidth = TOUR_MOCKUP_DESIGN_WIDTH,
): number {
  if (containerWidth <= 0 || designWidth <= 0) {
    return 1;
  }

  return Math.min(1, containerWidth / designWidth);
}

export function resolveTourHighlightZoom(
  requestedZoom: number | undefined,
  fitScale: number,
): number {
  const requested = requestedZoom ?? 1.12;

  if (fitScale < 0.85) {
    return 1;
  }

  if (fitScale < 1) {
    return Math.min(requested, 1.08);
  }

  return requested;
}

export function shouldUseCompactTourMock(containerWidth: number): boolean {
  return containerWidth > 0 && containerWidth < TOUR_MOCKUP_COMPACT_MAX_WIDTH;
}

export const TOUR_COMPACT_SPOTLIGHT_MAX_ZOOM = 2.2;
export const TOUR_COMPACT_SPOTLIGHT_PADDING = 32;

export function resolveCompactSpotlightZoom(
  frameWidth: number,
  frameHeight: number,
  targetWidth: number,
  targetHeight: number,
): number {
  if (
    frameWidth <= 0 ||
    frameHeight <= 0 ||
    targetWidth <= 0 ||
    targetHeight <= 0
  ) {
    return 1;
  }

  const scale = Math.min(
    frameWidth / (targetWidth + TOUR_COMPACT_SPOTLIGHT_PADDING),
    frameHeight / (targetHeight + TOUR_COMPACT_SPOTLIGHT_PADDING),
  );

  return Math.min(TOUR_COMPACT_SPOTLIGHT_MAX_ZOOM, Math.max(1, scale));
}

export function flattenTourStepIds(topics: TourTopicLike[]): string[] {
  return topics.flatMap((topic) => topic.steps.map((step) => `${topic.id}:${step.id}`));
}

export function nextTourIndex(current: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return Math.min(current + 1, total - 1);
}

export function previousTourIndex(current: number): number {
  return Math.max(current - 1, 0);
}

export function wrapTourIndex(current: number, total: number, delta: number): number {
  if (total <= 0) {
    return 0;
  }

  return (current + delta + total) % total;
}

export function resolveActiveTourTopicId(
  topicFromUrl: string | null,
  topicIds: string[],
): string | null {
  if (topicFromUrl && topicIds.includes(topicFromUrl)) {
    return topicFromUrl;
  }

  return topicIds[0] ?? null;
}
