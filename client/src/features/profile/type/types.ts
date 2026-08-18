export interface Profile {
  _id: string;
  tenantId: string;
  name: string;
  email: string;
  phone?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}
export interface UpdateProfileRequest {
  name?: string;
  phone?: string;
}
export interface ProfileResponse {
  success: boolean;
  data: Profile;
}
export interface UpdateProfileResponse {
  success: boolean;
  message: string;
  data: Profile;
}
