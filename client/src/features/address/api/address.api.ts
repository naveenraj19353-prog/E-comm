import apiClient from "../../../api/client";
import type {
  Address,
  CreateAddressRequest,
  UpdateAddressRequest,
} from "../types/address.types";
export const getAddresses = async (
  userId: string,
  tenantId: string,
): Promise<Address[]> => {
  const response = await apiClient.get(`/addresses/get-address/${userId}`, {
    params: { tenantId },
  });
  return response.data.data;
};
export const createAddress = async (payload: CreateAddressRequest) => {
  const response = await apiClient.post("/addresses/create-address", payload);
  return response.data;
};
export const updateAddress = async (
  id: string,
  payload: UpdateAddressRequest,
) => {
  const response = await apiClient.put(
    `/addresses/update-address/${id}`,
    payload,
  );
  return response.data;
};
export const deleteAddress = async (id: string, tenantId: string) => {
  const response = await apiClient.delete(`/addresses/${id}`, {
    params: { tenantId },
  });
  return response.data;
};
