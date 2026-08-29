import { Outlet } from "react-router-dom";
import Navbar from "../components/Layout/Header";
import Footer from "../components/Footer";
import ProductChatbot from "../components/ProductChatbot/ProductChatbot";
import { useStorefrontTenant } from "../features/tenant/useTenant";
import { useFooterContent } from "../theme/useFooterContent";
import styles from "./MainLayout.module.css";
const MainLayout = () => {
    const { tenantSlug, tenantId } = useStorefrontTenant();
    const footerContent = useFooterContent();
    if (tenantSlug) {
        localStorage.setItem("ecommerce_tenantSlug", tenantSlug);
    }
    if (tenantId) {
        localStorage.setItem("ecommerce_tenantId", tenantId);
    }
    return (<div className={styles.shell}>
      <Navbar />
      <main className={styles.main}>
        <Outlet />
      </main>
      <Footer companyName={footerContent.companyName} description={footerContent.description} sections={footerContent.sections}/>
      <ProductChatbot />
    </div>);
};
export default MainLayout;
