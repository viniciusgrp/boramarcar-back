/** True when [startA, endA) overlaps [startB, endB). */
export function doTimeRangesOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
): boolean {
  return startA < endB && endA > startB;
}

/** Postgres exclusion_violation when two overlapping booking rows collide. */
export const POSTGRES_EXCLUSION_VIOLATION = '23P01';

export function isBookingOverlapConstraintError(error: {
  code?: string;
  message?: string;
}): boolean {
  if (error.code === POSTGRES_EXCLUSION_VIOLATION) {
    return true;
  }

  const message = error.message?.toLowerCase() ?? '';
  return (
    message.includes('appointments_no_overlapping_slots') ||
    message.includes('exclusion')
  );
}
