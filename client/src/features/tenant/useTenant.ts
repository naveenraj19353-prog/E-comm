import { useParams } from "react-router-dom";
import { useAppSelector } from "../../app/hooks";
export const useTenant = () => {
  const { tenantSlug } = useParams();
  const tenant = useAppSelector((state) => state.tenant.currentTenant);
  return {
    tenantSlug,
    tenant,
  };
};
