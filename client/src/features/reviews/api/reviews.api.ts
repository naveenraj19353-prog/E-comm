import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";
import type { CreateReviewRequest, ReviewsResponse } from "../types";
export const getProductReviews = async (productId: string, tenantId: string): Promise<ReviewsResponse> => {
    const response = await apiClient.get(API_ENDPOINTS.REVIEWS.byProductId(productId), {
        params: {
            tenantId,
        },
    });
    return response.data;
};
export const createReview = async (payload: CreateReviewRequest) => {
    const response = await apiClient.post(API_ENDPOINTS.REVIEWS.CREATE, payload);
    return response.data;
};
