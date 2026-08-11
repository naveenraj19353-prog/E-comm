export interface Review {
    _id: string;
    tenantId: string;
    userId: string;
    productId: string;
    rating: number;
    title: string;
    comment: string;
    createdAt: string;
    updatedAt: string;
    userName?: string;
    images?: string[];
  }
  
  export interface ReviewsResponse {
    success: boolean;
    count: number;
    data: Review[];
  }
  
  export interface CreateReviewRequest {
    tenantId: string;
    productId: string;
    userId: string;
    userName: string;
    rating: number;
    title: string;
    comment: string;
    images: string[];
  }