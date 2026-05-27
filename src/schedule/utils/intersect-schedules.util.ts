export interface DayScheduleWindow {
  isClosed: boolean;
  openAt: Date;
  closeAt: Date;
}

export function intersectSchedules(
  business: DayScheduleWindow | null,
  professional: DayScheduleWindow | null,
): DayScheduleWindow | null {
  if (!business || business.isClosed) {
    return business;
  }

  if (!professional) {
    return business;
  }

  if (professional.isClosed) {
    return {
      isClosed: true,
      openAt: business.openAt,
      closeAt: business.closeAt,
    };
  }

  const openAt =
    professional.openAt > business.openAt ? professional.openAt : business.openAt;
  const closeAt =
    professional.closeAt < business.closeAt
      ? professional.closeAt
      : business.closeAt;

  if (openAt >= closeAt) {
    return {
      isClosed: true,
      openAt: business.openAt,
      closeAt: business.closeAt,
    };
  }

  return {
    isClosed: false,
    openAt,
    closeAt,
  };
}
