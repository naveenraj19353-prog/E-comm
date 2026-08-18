import { Outlet } from "react-router-dom";
import Navbar from "../components/layout/Header";
import Footer, { footerData } from "../components/Footer";
const MainLayout = () => {
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
