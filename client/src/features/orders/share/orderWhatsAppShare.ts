import { openWhatsApp } from "../../products/share/whatsappShare";

export interface OrderWhatsAppItem {
    name: string;
    quantity: number;
    subtotal: number;
}

export interface OrderWhatsAppAddress {
    fullName?: string;
    phone?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
}

export interface OrderWhatsAppInput {
    tenantSlug: string;
    orderId: string;
    storeName?: string;
    items: OrderWhatsAppItem[];
    total: number;
    subtotal?: number;
    discount?: number;
    shipping?: number;
    paymentMethod: string;
    paymentStatus?: string;
    address?: OrderWhatsAppAddress | null;
}

const LOCAL_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

export const buildOrderPageUrl = (tenantSlug: string, orderId: string) => {
    const path = `/${tenantSlug}/orders/${orderId}`;
    const publicSite = import.meta.env.VITE_PUBLIC_URL?.trim().replace(/\/$/, "");
    if (publicSite) {
        return `${publicSite}${path}`;
    }
    const origin = window.location.origin;
    if (!LOCAL_ORIGIN_PATTERN.test(origin)) {
        return `${origin}${path}`;
    }
    return `${origin}${path}`;
};

export const buildOrderConfirmationMessage = ({
    tenantSlug,
    orderId,
    storeName,
    items,
    total,
    subtotal,
    discount,
    shipping,
    paymentMethod,
    paymentStatus,
    address,
}: OrderWhatsAppInput): string => {
    const shortId = orderId.slice(-8).toUpperCase();
    const lines = [
        `Order confirmed${storeName ? ` — ${storeName}` : ""}`,
        "",
        `Order #${shortId}`,
        `Payment: ${paymentMethod}${paymentStatus ? ` (${paymentStatus})` : ""}`,
        "",
        "Items:",
        ...items.map(
            (item) =>
                `• ${item.name} ×${item.quantity} — ₹${item.subtotal.toLocaleString("en-IN")}`,
        ),
        "",
    ];

    if (typeof subtotal === "number") {
        lines.push(`Subtotal: ₹${subtotal.toLocaleString("en-IN")}`);
    }
    if (discount && discount > 0) {
        lines.push(`Discount: -₹${discount.toLocaleString("en-IN")}`);
    }
    if (typeof shipping === "number") {
        lines.push(`Shipping: ₹${shipping.toLocaleString("en-IN")}`);
    }
    lines.push(`Total: ₹${total.toLocaleString("en-IN")}`, "");

    if (address) {
        lines.push("Delivery address:");
        if (address.fullName) {
            lines.push(address.fullName);
        }
        const street = [address.addressLine1, address.addressLine2]
            .filter(Boolean)
            .join(", ");
        if (street) {
            lines.push(street);
        }
        const cityLine = [address.city, address.state, address.postalCode]
            .filter(Boolean)
            .join(", ");
        if (cityLine) {
            lines.push(cityLine);
        }
        if (address.phone) {
            lines.push(`Phone: ${address.phone}`);
        }
        lines.push("");
    }

    lines.push(`View order: ${buildOrderPageUrl(tenantSlug, orderId)}`);
    return lines.join("\n");
};

export const sendOrderConfirmationWhatsApp = (input: OrderWhatsAppInput) => {
    openWhatsApp(buildOrderConfirmationMessage(input));
};

export const paymentMethodLabel = (method: string) => {
    if (method === "cod") {
        return "Cash on Delivery";
    }
    if (method === "upi") {
        return "UPI";
    }
    if (method === "card") {
        return "Card";
    }
    return method;
};

export const buildCheckoutOrderWhatsAppInput = (params: {
    tenantSlug: string;
    orderId: string;
    storeName?: string;
    items: OrderWhatsAppItem[];
    total: number;
    subtotal: number;
    discount: number;
    shipping: number;
    paymentMethod: string;
    paymentStatus: string;
    address?: OrderWhatsAppAddress | null;
}): OrderWhatsAppInput => ({
    tenantSlug: params.tenantSlug,
    orderId: params.orderId,
    storeName: params.storeName,
    items: params.items,
    total: params.total,
    subtotal: params.subtotal,
    discount: params.discount,
    shipping: params.shipping,
    paymentMethod: paymentMethodLabel(params.paymentMethod),
    paymentStatus: params.paymentStatus,
    address: params.address,
});
