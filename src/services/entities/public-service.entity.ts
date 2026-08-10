import type { Service } from './service.entity';

/** Public booking catalog: no commission rates. */
export interface PublicService {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  requires_deposit: boolean;
  deposit_amount: number | null;
  loyalty_points_earned: number;
  is_active: boolean;
}

export function toPublicService(service: Service): PublicService {
  return {
    id: service.id,
    tenant_id: service.tenant_id,
    name: service.name,
    description: service.description,
    duration_minutes: service.duration_minutes,
    price: service.price,
    requires_deposit: service.requires_deposit,
    deposit_amount: service.deposit_amount,
    loyalty_points_earned: service.loyalty_points_earned,
    is_active: service.is_active,
  };
}
