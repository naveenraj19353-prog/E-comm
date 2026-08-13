import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getProfile, updateProfile } from "../api/profile.api";
import type { UpdateProfileRequest } from "../type/types";




export const useProfile = (tenantId: string, userId: string) => {
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ["profile", tenantId, userId],
    queryFn: () => getProfile(tenantId, userId),
    enabled: Boolean(tenantId && userId),
  });

  const updateMutation = useMutation({
    mutationFn: (data: UpdateProfileRequest) =>
      updateProfile(tenantId, userId, data),

    onSuccess: (response) => {
      queryClient.setQueryData(["profile", tenantId, userId], response);

      queryClient.invalidateQueries({
        queryKey: ["profile", tenantId, userId],
      });
    },
  });

  return {
    profile: profileQuery.data?.data ?? null,

    isLoading: profileQuery.isLoading,
    isError: profileQuery.isError,
    error: profileQuery.error,

    updateProfile: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
    updateSuccess: updateMutation.isSuccess,
  };
};
