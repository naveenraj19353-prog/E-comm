import { useCallback, useEffect, useState } from "react";
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
export const useAddresses = (userId: string, tenantId: string) => {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  const fetchAddresses = useCallback(async () => {
    try {
      setIsLoading(true);
      setError("");
      const data = await getAddresses(userId, tenantId);
      setAddresses(data);
    } catch (err) {
      console.error("Failed to fetch addresses:", err);
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Unable to load addresses.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [userId, tenantId]);
  useEffect(() => {
    if (!userId || !tenantId) {
      setAddresses([]);
      setIsLoading(false);
      return;
    }
    fetchAddresses();
  }, [userId, tenantId, fetchAddresses]);
  const addAddress = async (payload: CreateAddressRequest) => {
    try {
      setIsSaving(true);
      setError("");
      const response = await createAddress(payload);
      await fetchAddresses();
      return response;
    } catch (err) {
      console.error("Failed to create address:", err);
      const message =
        err?.response?.data?.detail || err?.message || "Unable to add address.";
      setError(message);
      throw err;
    } finally {
      setIsSaving(false);
    }
  };
  const editAddress = async (id: string, payload: UpdateAddressRequest) => {
    try {
      setIsSaving(true);
      setError("");
      const response = await updateAddress(id, payload);
      await fetchAddresses();
      return response;
    } catch (err) {
      console.error("Failed to update address:", err);
      const message =
        err?.response?.data?.detail ||
        err?.message ||
        "Unable to update address.";
      setError(message);
      throw err;
    } finally {
      setIsSaving(false);
    }
  };
  const removeAddress = async (id: string) => {
    try {
      setIsDeleting(true);
      setError("");
      const response = await deleteAddress(id, tenantId);
      await fetchAddresses();
      return response;
    } catch (err) {
      console.error("Failed to delete address:", err);
      const message =
        err?.response?.data?.detail ||
        err?.message ||
        "Unable to delete address.";
      setError(message);
      throw err;
    } finally {
      setIsDeleting(false);
    }
  };
  const defaultAddress =
    addresses.find((address) => address.isDefault) || addresses[0] || null;
  return {
    addresses,
    defaultAddress,
    isLoading,
    isSaving,
    isDeleting,
    error,
    fetchAddresses,
    addAddress,
    editAddress,
    removeAddress,
  };
};
