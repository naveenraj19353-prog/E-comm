import { isBusinessType } from "../../../constants/businessTypes";

export const slugifyTenantValue = (value: string): string =>
    value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

export const normalizeTenantId = (value: string): string =>
    value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "");

export interface CreateTenantFormValues {
    name: string;
    slug: string;
    tenantId: string;
    businessType: string;
    logo: string;
    theme: string;
    email: string;
    password: string;
    confirmPassword: string;
}

export const validateCreateTenantForm = (
    values: CreateTenantFormValues,
): string | null => {
    if (!values.name.trim()) {
        return "Store name is required.";
    }
    if (!values.slug.trim() || values.slug.trim().length < 2) {
        return "Store slug must be at least 2 characters.";
    }
    if (!values.tenantId.trim() || values.tenantId.trim().length < 2) {
        return "Tenant ID must be at least 2 characters.";
    }
    if (!isBusinessType(values.businessType)) {
        return "Select a business type: retail, service, or menu.";
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
        return "Enter a valid admin email address.";
    }
    if (values.password.length < 6) {
        return "Admin password must be at least 6 characters.";
    }
    if (values.password !== values.confirmPassword) {
        return "Passwords do not match.";
    }
    return null;
};

export const getApiErrorMessage = (error: unknown, fallback: string): string => {
    const detail = (
        error as {
            response?: { data?: { detail?: unknown } };
        }
    )?.response?.data?.detail;

    if (typeof detail === "string" && detail.trim()) {
        return detail;
    }
    if (Array.isArray(detail)) {
        const parts = detail
            .map((item) => {
                if (typeof item === "string") {
                    return item;
                }
                if (item && typeof item === "object" && "msg" in item) {
                    return String((item as { msg: string }).msg);
                }
                return "";
            })
            .filter(Boolean);
        if (parts.length > 0) {
            return parts.join(" ");
        }
    }
    return fallback;
};
