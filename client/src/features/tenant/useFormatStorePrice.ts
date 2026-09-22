import { useCallback, useMemo } from "react";
import { useStorefrontTenant } from "./useTenant";
import { formatStorePrice, resolveDisplayCurrency, type StoreCurrencySettings } from "../../utils/currency";


export const useFormatStorePrice = () => {
    const { tenant } = useStorefrontTenant();
    const settings: StoreCurrencySettings = useMemo(
        () => ({
            displayCurrency: tenant?.displayCurrency,
            inrPerUnit: tenant?.inrPerUnit,
        }),
        [tenant?.displayCurrency, tenant?.inrPerUnit],
    );
    const formatPrice = useCallback(
        (amountInr: number | null | undefined) => formatStorePrice(amountInr, settings),
        [settings],
    );
    const displayCurrency = resolveDisplayCurrency(settings.displayCurrency).code;
    return {
        formatPrice,
        displayCurrency,
        isForeignCurrency: displayCurrency !== "INR",
        settings,
    };
};
