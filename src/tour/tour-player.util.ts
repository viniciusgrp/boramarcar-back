export interface TourTopicLike {
  id: string;
  steps: Array<{ id: string }>;
}

export const TOUR_MOCKUP_DESIGN_WIDTH = 720;

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
  if (fitScale < 1) {
    return 1;
  }

  return requestedZoom ?? 1.12;
}

export function shouldUseCompactTourMock(fitScale: number): boolean {
  return fitScale > 0 && fitScale < 1;
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
