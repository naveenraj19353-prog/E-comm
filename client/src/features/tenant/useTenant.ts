import { useParams } from "react-router-dom";
import { useAppSelector } from "../../app/hooks";

export const useStorefrontTenant = () => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const tenant = useAppSelector((state) => state.tenant.currentTenant);
  const storedSlug = useAppSelector((state) => state.tenant.tenantSlug);
  const slug = tenantSlug || tenant?.slug || storedSlug || "";
  const tenantId = tenant?.tenantId || "";

  return {
    tenantSlug: slug,
    tenantId,
    tenant,
  };
};

export const useTenant = () => {
  const { tenantSlug, tenantId, tenant } = useStorefrontTenant();
  return {
    tenantSlug,
    tenant: tenant ?? tenantSlug,
    tenantId,
  };
};
