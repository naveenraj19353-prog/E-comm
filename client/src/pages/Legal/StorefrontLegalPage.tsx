import { Navigate, useLocation } from "react-router-dom";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
import { isStorefrontPathAllowed } from "../../theme/footerDefaults";
import { routes } from "../../routes/routes";
import ContactForm from "./ContactForm";
import LegalPageView from "./LegalPageView";
import {
    mergeAboutContent,
    paragraphsFromBody,
} from "./aboutDefaults";
import {
    isStorefrontLegalSlug,
    storefrontLegalDocument,
} from "./legalContent";

const StorefrontLegalPage = () => {
    const location = useLocation();
    const { tenant, tenantSlug, tenantId } = useStorefrontTenant();
    const page = location.pathname.split("/").filter(Boolean).pop() || "";

    if (!isStorefrontLegalSlug(page)) {
        return <Navigate to={routes.home(tenantSlug)} replace />;
    }

    // Returns, Shipping and Terms exist only for retail stores.
    if (!isStorefrontPathAllowed(page, tenant?.businessType)) {
        return <Navigate to={routes.home(tenantSlug)} replace />;
    }

    const storeName = tenant?.name || tenantSlug || "Store";
    const document = storefrontLegalDocument(page, {
        storeName,
        email: tenant?.email,
    });

    if (page === "about") {
        const about = mergeAboutContent(
            storeName,
            tenant?.storefrontLayout?.aboutContent,
            tenant?.aboutContent,
        );
        document.sections = about.sections.map((section) => ({
            heading: section.heading,
            paragraphs: paragraphsFromBody(section.body),
        }));
    }

    return (
        <LegalPageView
            content={document}
            backTo={{ href: routes.home(tenantSlug), label: "Back to store" }}
        >
            {page === "contact" ? (
                <ContactForm tenantId={tenantId} storeName={storeName} />
            ) : null}
        </LegalPageView>
    );
};

export default StorefrontLegalPage;
