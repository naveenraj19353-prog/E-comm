import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createReview, getProductReviews } from "../api/reviews.api";
import type { CreateReviewRequest } from "../types";
export const useReviews = (productId: string, tenantId: string) => {
  const queryClient = useQueryClient();
  const reviewsQuery = useQuery({
    queryKey: ["reviews", productId, tenantId],
    queryFn: () => getProductReviews(productId, tenantId),
    enabled: Boolean(productId && tenantId),
  });
  const createReviewMutation = useMutation({
    mutationFn: (payload: CreateReviewRequest) => createReview(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["reviews", productId, tenantId],
      });
    },
  });
  return {
    reviews: reviewsQuery.data?.data ?? [],
    reviewCount: reviewsQuery.data?.count ?? 0,
    isLoading: reviewsQuery.isLoading,
    isError: reviewsQuery.isError,
    addReview: createReviewMutation.mutateAsync,
    isCreating: createReviewMutation.isPending,
  };
};
