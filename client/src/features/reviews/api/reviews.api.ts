import apiClient from "../../../api/client";
import type { CreateReviewRequest, ReviewsResponse } from "../types";
export const getProductReviews = async (
  productId: string,
  tenantId: string,
): Promise<ReviewsResponse> => {
  const response = await apiClient.get(`/reviews/product/${productId}`, {
    params: {
      tenantId,
    },
  });
  return response.data;
};
export const createReview = async (payload: CreateReviewRequest) => {
  const response = await apiClient.post("/reviews/", payload);
  return response.data;
};
