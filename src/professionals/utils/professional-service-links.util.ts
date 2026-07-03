import type { Professional } from '../entities/professional.entity';

export function getProfessionalServiceIds(professional: Professional): string[] {
  return (
    professional.professional_services
      ?.map((link) => link.service_id)
      .filter((serviceId): serviceId is string => Boolean(serviceId)) ?? []
  );
}

/** Empty links mean the professional was configured for all tenant services. */
export function professionalOffersAllServices(
  professional: Professional,
): boolean {
  return getProfessionalServiceIds(professional).length === 0;
}

export function professionalPerformsService(
  professional: Professional,
  serviceId: string,
): boolean {
  if (professionalOffersAllServices(professional)) {
    return true;
  }

  return (
    professional.professional_services?.some(
      (link) => link.service_id === serviceId,
    ) ?? false
  );
}

export function professionalPerformsAllServices(
  professional: Professional,
  serviceIds: string[],
): boolean {
  if (serviceIds.length === 0) {
    return false;
  }

  return serviceIds.every((serviceId) =>
    professionalPerformsService(professional, serviceId),
  );
}
