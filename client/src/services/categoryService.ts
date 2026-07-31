import { apiProxy } from "../api/apiProxy";

export interface CategoryRequest {
  tenantId: string;
  name: string;
  description: string;
  image: string;
}

export const createCategory = (body: CategoryRequest) =>
  apiProxy.post("/categories", body);

export interface Category {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  image: string;
  isActive:boolean
}

export interface CategoryResponse {
  success: boolean;
  data: Category[];
}

export const getCategories = (tenantId: string) => {
  return apiProxy.get<CategoryResponse>("/categories/", {
    tenantId,
  });
};