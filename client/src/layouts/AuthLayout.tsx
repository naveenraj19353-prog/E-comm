import { Outlet } from "react-router-dom";
const AuthLayout = () => {
    return (<div style={{
            display: "flex",
            minHeight: "100vh",
        }}>
      
      <div style={{
            flex: 1,
            background: "var(--primary)",
            color: "var(--surface)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "32px",
            fontWeight: "bold",
        }}>
        SaaS E-Commerce
      </div>
      
      <div style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px",
        }}>
        <Outlet />
      </div>
    </div>);
};
export default AuthLayout;
