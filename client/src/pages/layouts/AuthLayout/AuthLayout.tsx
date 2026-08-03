import { Outlet, useParams } from "react-router-dom";

const AuthLayout = () => {
  console.log(useParams());

  return <Outlet />;
};
export default AuthLayout