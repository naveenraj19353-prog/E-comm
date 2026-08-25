import { Outlet } from "react-router-dom";
import Navbar from "../components/layout/Header";
import Footer, { footerData } from "../components/Footer";
import { useStorefrontTenant } from "../features/tenant/useTenant";

const MainLayout = () => {
  const { tenantSlug, tenantId } = useStorefrontTenant();
  if (tenantSlug) {
    localStorage.setItem("ecommerce_tenantSlug", tenantSlug);
  }
  if (tenantId) {
    localStorage.setItem("ecommerce_tenantId", tenantId);
  }
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
