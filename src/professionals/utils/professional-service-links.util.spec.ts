import {
  getProfessionalServiceIds,
  professionalOffersAllServices,
  professionalPerformsAllServices,
} from './professional-service-links.util';
import type { Professional } from '../entities/professional.entity';

function professional(
  links: Array<{ service_id: string }>,
): Professional {
  return { professional_services: links } as Professional;
}

describe('professional-service-links.util', () => {
  it('treats empty links as all services', () => {
    expect(professionalOffersAllServices(professional([]))).toBe(true);
    expect(professionalPerformsAllServices(professional([]), ['svc-1'])).toBe(
      true,
    );
  });

  it('requires every requested service when links exist', () => {
    const pro = professional([{ service_id: 'svc-1' }]);
    expect(getProfessionalServiceIds(pro)).toEqual(['svc-1']);
    expect(professionalPerformsAllServices(pro, ['svc-1', 'svc-2'])).toBe(
      false,
    );
  });
});
