export type CustomerReviewStatus =
  | 'PENDING'
  | 'PUBLISHED'
  | 'HIDDEN'
  | 'REJECTED';

export interface CustomerReview {
  id: string;
  tenant_id: string;
  appointment_id: string;
  customer_id: string | null;
  rating: number;
  comment: string | null;
  status: CustomerReviewStatus;
  published_at: string | null;
  moderated_at: string | null;
  moderated_by: string | null;
  created_at: string;
  updated_at: string;
}
