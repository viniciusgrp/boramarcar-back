import type { CustomerReviewStatus } from './customer-review.entity';

export interface PublicReviewItem {
  id: string;
  rating: number;
  comment: string | null;
  customerFirstName: string;
  serviceName: string | null;
  createdAt: string;
}

export interface PublicReviewsResponse {
  averageRating: number | null;
  totalCount: number;
  reviews: PublicReviewItem[];
}

export interface AdminReviewItem {
  id: string;
  rating: number;
  comment: string | null;
  status: CustomerReviewStatus;
  customerName: string;
  serviceName: string | null;
  professionalName: string | null;
  appointmentStartTime: string | null;
  publishedAt: string | null;
  createdAt: string;
}
