import { useNavigate } from "react-router-dom";
import { routes, storefrontNavigate } from "../../../routes/routes";
import { useStorefrontTenant } from "../../tenant/useTenant";
export const useProductNavigation = () => {
    const navigate = useNavigate();
    const { tenantSlug } = useStorefrontTenant();
    const goToProduct = (productId: string) => {
        if (!tenantSlug || !productId) {
            return;
        }
        storefrontNavigate(navigate, routes.product(tenantSlug, productId));
    };
    return { goToProduct };
};
