export interface Customer {
  id: string;
  tenant_id: string;
  auth_user_id: string | null;
  name: string;
  phone: string;
  email: string | null;
  birth_date: string | null;
  instagram_handle: string | null;
  acquisition_source: string | null;
  profile_picture_url: string | null;
  referral_code: string | null;
  referred_by_id: string | null;
  points_balance: number;
  created_at: string;
  updated_at: string;
}

export interface CustomerMeResponse {
  customer: Customer | null;
  isProfileComplete: boolean;
}

export interface CustomerListItem {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  birthDate: string | null;
  instagramHandle: string | null;
  acquisitionSource: string | null;
  profilePictureUrl: string | null;
  pointsBalance: number;
  createdAt: string;
}
