import apiClient from "../../../api/client";

export const getWishlists = async (tenantId: string, userId:string) => {
  const response = await apiClient.get(`/wishlist/${userId}`, {
    params: {
      tenantId,
    },
  });

  return response.data;
};