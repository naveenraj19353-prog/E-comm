
import { Outlet } from "react-router-dom";
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { useTenant } from "../../../hooks/tenant/useTenant";
import { setTenant } from "../../../redux/slices/tenantSlice";



const MainLayout = () => {
  const dispatch = useDispatch();
  const tenant = useTenant();

  useEffect(() => {
    if (tenant) {
      dispatch(setTenant(tenant));
    }
  }, [tenant, dispatch]);

  return (
    <>
      {/* Header */}
      <Outlet />
      {/* Footer */}
    </>
  );
};

export default MainLayout;