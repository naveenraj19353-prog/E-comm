import { Outlet } from "react-router-dom";
import Navbar from "../components/layout/Header";
import Footer, { footerData } from "../components/Footer";
import { useParams } from "react-router-dom";
const MainLayout = () => {
  const { tenantSlug } = useParams();
  console.log("Tenant ID:", tenantSlug);
  localStorage.setItem("ecommerce_tenantId", tenantSlug || "");
  return (
    <div>
      <Navbar />
      <main>
        <Outlet />
      </main>
      <Footer
        companyName={footerData.companyName}
        description={footerData.description}
        sections={footerData.sections}
      />
    </div>
  );
};
export default MainLayout;
