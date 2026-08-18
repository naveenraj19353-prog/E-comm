import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createAddress,
  deleteAddress,
  getAddresses,
  updateAddress,
} from "../api/address.api";

import type {
  Address,
  CreateAddressRequest,
  UpdateAddressRequest,
} from "../types/address.types";

export const useAddresses = (
  userId: string,
  tenantId: string,
) => {
  const queryClient = useQueryClient();

  const addressQuery = useQuery({
    queryKey: ["addresses", userId, tenantId],
    queryFn: () => getAddresses(userId, tenantId),
    enabled: Boolean(userId && tenantId),
  });

  const addMutation = useMutation({
    mutationFn: (payload: CreateAddressRequest) =>
      createAddress(payload),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["addresses", userId, tenantId],
      });
    },
  });

  const editMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateAddressRequest;
    }) => updateAddress(id, payload),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["addresses", userId, tenantId],
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      deleteAddress(id, tenantId),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["addresses", userId, tenantId],
      });
    },
  });

  const addresses: Address[] = addressQuery.data ?? [];

  const defaultAddress =
    addresses.find((address) => address.isDefault) ??
    addresses[0] ??
    null;

  const addAddress = async (
    payload: CreateAddressRequest,
  ) => {
    try {
      return await addMutation.mutateAsync(payload);
    } catch (error) {
      console.error("Failed to create address:", error);
      throw error;
    }
  };

  const editAddress = async (
    id: string,
    payload: UpdateAddressRequest,
  ) => {
    try {
      return await editMutation.mutateAsync({
        id,
        payload,
      });
    } catch (error) {
      console.error("Failed to update address:", error);
      throw error;
    }
  };

  const removeAddress = async (id: string) => {
    try {
      return await deleteMutation.mutateAsync(id);
    } catch (error) {
      console.error("Failed to delete address:", error);
      throw error;
    }
  };

  return {
    addresses,
    defaultAddress,

    isLoading: addressQuery.isLoading,
    isSaving:
      addMutation.isPending ||
      editMutation.isPending,
    isDeleting: deleteMutation.isPending,

    error:
      addressQuery.error instanceof Error
        ? addressQuery.error.message
        : addMutation.error instanceof Error
          ? addMutation.error.message
          : editMutation.error instanceof Error
            ? editMutation.error.message
            : deleteMutation.error instanceof Error
              ? deleteMutation.error.message
              : "",

    fetchAddresses: addressQuery.refetch,

    addAddress,
    editAddress,
    removeAddress,
  };
};