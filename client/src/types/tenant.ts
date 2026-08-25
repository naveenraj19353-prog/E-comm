export interface Tenant {
  _id: string;
  tenantId: string;
  slug: string;
  name: string;
  logo: string;
  theme: string;
  isActive?: boolean;
}
