import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useDispatch } from "react-redux";

import { TENANTS } from "../../config/tenant";
import { setTenant } from "../../redux/slices/tenantSlice";

export const useTenant = () => {
  const { tenant } = useParams();
  const dispatch = useDispatch();

  const currentTenant = TENANTS.find(
    (item) => item.slug === tenant
  );

  useEffect(() => {
    if (currentTenant) {
      dispatch(setTenant(currentTenant));
    }
  }, [currentTenant, dispatch]);

  return currentTenant;
};