import { useNavigate } from "react-router-dom";
import { routes } from "../../../routes/routes";
import { useStorefrontTenant } from "../../tenant/useTenant";
export const useProductNavigation = () => {
    const navigate = useNavigate();
    const { tenantSlug } = useStorefrontTenant();
    const goToProduct = (productId: string) => {
        if (!tenantSlug || !productId) {
            return;
        }
        navigate(routes.product(tenantSlug, productId));
    };
    return { goToProduct };
};
