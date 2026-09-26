import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Product } from "../../../features/products/types";
import ProductCard from "./ProductCard";

vi.mock("../../../theme/useThemeSettings", () => ({
    useLayoutSettings: () => ({
        productCardDesign: "classic",
        showDiscountBadge: true,
        showQuickAddOnCard: true,
        showProductRating: true,
        wishlistIconPosition: "right",
        productCardImageRatio: "portrait",
    }),
}));

vi.mock("../../../features/tenant/useTenant", () => ({
    useStorefrontTenant: () => ({
        tenant: { name: "Test Store", businessType: "retail" },
        tenantId: "t1",
        tenantSlug: "test-store",
    }),
}));

vi.mock("../../../features/tenant/useFormatStorePrice", () => ({
    useFormatStorePrice: () => ({ formatPrice: (value: number) => `₹${value}` }),
}));

vi.mock("../../../features/products/hooks/useProductNavigation", () => ({
    useProductNavigation: () => ({ goToProduct: vi.fn() }),
}));

vi.mock("../../ProductImage/ProductCardMedia", () => ({ default: () => null }));

const PRODUCT = {
    _id: "p1",
    tenantId: "t1",
    name: "Cotton Shirt",
    description: "A shirt",
    categoryId: "c1",
    brand: "Acme",
    price: 999,
    finalPrice: 799,
    discountPercentage: 20,
    images: {},
    inventory: [{ variantId: "blue-m", color: "Blue", size: "M", stock: 5 }],
    isActive: true,
    averageRating: 4.5,
    reviewCount: 10,
    stock: 5,
    totalStock: 5,
} as unknown as Product;

/** Lucide tags the rotating icon, so its class name proves a spinner is present. */
const spinnerIcon = (scope: HTMLElement) =>
    scope.querySelector('svg[class*="loader"]');

describe("ProductCard busy states", () => {
    it("locks the add-to-cart button and shows a spinner while adding", () => {
        render(<ProductCard product={PRODUCT} isAdding onAddToCart={vi.fn()} />);

        const addButton = screen.getByRole("button", { name: /adding/i });
        expect(addButton).toBeDisabled();
        expect(addButton).toHaveAttribute("aria-busy", "true");
        expect(spinnerIcon(addButton)).not.toBeNull();
    });

    it("shows no spinner and an enabled wishlist button when idle", () => {
        const { container } = render(
            <ProductCard product={PRODUCT} onAddToCart={vi.fn()} />,
        );

        expect(spinnerIcon(container)).toBeNull();
        const wishlistButton = screen.getByRole("button", {
            name: "Add to wishlist",
        });
        expect(wishlistButton).toBeEnabled();
        expect(wishlistButton).toHaveAttribute("aria-busy", "false");
    });

    it("locks the wishlist button and spins it while the toggle is in flight", () => {
        render(
            <ProductCard
                product={PRODUCT}
                isWishlistPending
                onWishlist={vi.fn()}
            />,
        );

        const wishlistButton = screen.getByRole("button", {
            name: "Updating wishlist",
        });
        expect(wishlistButton).toBeDisabled();
        expect(wishlistButton).toHaveAttribute("aria-busy", "true");
        expect(spinnerIcon(wishlistButton)).not.toBeNull();
    });

    it("keeps the two busy states independent", () => {
        render(
            <ProductCard
                product={PRODUCT}
                isAdding
                onAddToCart={vi.fn()}
                onWishlist={vi.fn()}
            />,
        );

        expect(spinnerIcon(screen.getByRole("button", { name: /adding/i }))).not.toBeNull();
        expect(
            spinnerIcon(screen.getByRole("button", { name: "Add to wishlist" })),
        ).toBeNull();
    });
});
