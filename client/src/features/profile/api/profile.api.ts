import apiClient from "../../../api/client";
import type {
  ProfileResponse,
  UpdateProfileRequest,
  UpdateProfileResponse,
} from "../type/types";
export const getProfile = async (
  tenantId: string,
  userId: string,
): Promise<ProfileResponse> => {
  const response = await apiClient.get("/profile/", {
    params: {
      tenantId,
      userId,
    },
  });
  return response.data;
};
export const updateProfile = async (
  tenantId: string,
  userId: string,
  data: UpdateProfileRequest,
): Promise<UpdateProfileResponse> => {
  const response = await apiClient.put("/profile/update-profile", data, {
    params: {
      tenantId,
      userId,
    },
  });
  return response.data;
};
