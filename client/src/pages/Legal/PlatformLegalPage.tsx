import { Navigate, useParams } from "react-router-dom";
import LegalPageView from "./LegalPageView";
import { isPlatformLegalSlug, platformLegalDocument } from "./legalContent";

const PlatformLegalPage = () => {
    const { page = "" } = useParams();

    if (!isPlatformLegalSlug(page)) {
        return <Navigate to="/" replace />;
    }

    return (
        <LegalPageView
            content={platformLegalDocument(page)}
            backTo={{ href: "/", label: "Back to Retail Cosmos" }}
        />
    );
};

export default PlatformLegalPage;
