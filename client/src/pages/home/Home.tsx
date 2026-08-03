import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { setTenant } from "../../redux/slices/tenantSlice";
import { useTenant } from "../../hooks/tenant/useTenant";
import { store } from "../../redux/store";

const Home = () => {
  const dispatch = useDispatch();
  const tenant = useTenant();

  useEffect(() => {
    console.log("Dispatching:", tenant);
  
    if (tenant) {
      dispatch(setTenant(tenant));
    }
  }, [tenant, dispatch]);

  console.log(tenant);
  console.log(store.getState());

  return <div>Home</div>;
};

export default Home