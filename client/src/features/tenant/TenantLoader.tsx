import { useEffect } from "react";
import { Outlet, useParams } from "react-router-dom";
import { useAppDispatch } from "../../app/hooks";
import { setTenantSlug } from "./tenantSlice";
const TenantLoader = () => {
  const { tenantSlug } = useParams();
  const dispatch = useAppDispatch();
  console.log("tenantSlug:", tenantSlug);
  useEffect(() => {
    if (tenantSlug) {
      dispatch(setTenantSlug(tenantSlug));
    }
  }, [tenantSlug, dispatch]);
  return <Outlet />;
};
export default TenantLoader;
