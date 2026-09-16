import type { BusinessType } from "../../constants/businessTypes";

/** Default inventory labels when a service listing has no color/size UI. */
export const SERVICE_DEFAULT_COLOR = "Standard";
export const SERVICE_DEFAULT_SIZE = "One Size";

export function isServiceBusiness(
  businessType?: BusinessType | string | null,
): boolean {
  return businessType === "service";
}

export function isMenuBusiness(
  businessType?: BusinessType | string | null,
): boolean {
  return businessType === "menu";
}

/** Checkout / delivery are retail-only. */
export function isRetailBusiness(
  businessType?: BusinessType | string | null,
): boolean {
  return !businessType || businessType === "retail";
}

export function addToListLabel(
  isService: boolean,
  options?: {
    adding?: boolean;
    unavailable?: boolean;
    isMenu?: boolean;
  },
): string {
  if (options?.unavailable) {
    return "Unavailable";
  }
  if (options?.adding) {
    return "Adding...";
  }
  if (options?.isMenu || isService) {
    return options?.isMenu ? "Add to order" : "Add to my list";
  }
  return "Add to Cart";
}
