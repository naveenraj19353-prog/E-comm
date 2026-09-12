import { useQuery } from "@tanstack/react-query";
import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";

export type PublicTenantPreview = {
  tenantId: string;
  slug: string;
  name: string;
  logo: string | null;
  theme: string;
  accent: string;
  productCount: number;
  coverImage: string | null;
  previewImages: string[];
  dataIsolation: string;
};

type PublicTenantsResponse = {
  success: boolean;
  count: number;
  data: PublicTenantPreview[];
};

export async function getPublicTenants(): Promise<PublicTenantPreview[]> {
  const response = await apiClient.get<PublicTenantsResponse>(
    API_ENDPOINTS.TENANTS.PUBLIC,
  );
  return response.data.data ?? [];
}

export function usePublicTenants() {
  return useQuery({
    queryKey: ["tenants", "public"],
    queryFn: getPublicTenants,
    staleTime: 60_000,
  });
}
