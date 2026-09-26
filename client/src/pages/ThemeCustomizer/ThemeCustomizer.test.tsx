import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import { store } from "../../app/store";
import { THEME_LIBRARY } from "../../theme/themeLibrary";
import ThemeCustomizer from "./ThemeCustomizer";

// The live preview pane is unrelated to the library and heavy to render.
vi.mock("./ThemePreview", () => ({ default: () => null }));

vi.mock("../../features/tenant/useTenant", () => ({
    useStorefrontTenant: () => ({
        tenantSlug: "test-store",
        tenantId: "t1",
        tenant: { _id: "t1", name: "Test Store", businessType: "retail" },
    }),
}));

const renderCustomizer = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    render(
        <Provider store={store}>
            <QueryClientProvider client={queryClient}>
                <MemoryRouter>
                    <ThemeCustomizer />
                </MemoryRouter>
            </QueryClientProvider>
        </Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Colors" }));
};

const cardFor = (label: string) =>
    screen.getByRole("heading", { name: label }).closest("article") as HTMLElement;

describe("Themes library", () => {
    it("lists every library template in the Colors tab", () => {
        renderCustomizer();

        expect(screen.getByRole("heading", { name: "Themes library" })).toBeInTheDocument();
        THEME_LIBRARY.forEach((template) => {
            expect(
                screen.getByRole("heading", { name: template.label }),
            ).toBeInTheDocument();
        });
    });

    it("keeps the quick colour presets alongside the library", () => {
        renderCustomizer();

        expect(screen.getByText(/quick colour presets/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Forest Green/ })).toBeInTheDocument();
    });

    it("applies a template's palette, layout and font to the draft", () => {
        renderCustomizer();

        fireEvent.click(within(cardFor("Editorial Noir")).getByRole("button", { name: "Apply" }));

        // Palette reaches the colour fields (swatch input, then hex input)...
        const primaryRow = screen.getByText("Primary").closest("label") as HTMLElement;
        const primaryInputs = primaryRow.querySelectorAll("input");
        expect(primaryInputs[1]).toHaveValue("#1C1917");
        // ...the layout fields...
        fireEvent.click(screen.getByRole("button", { name: "Catalog" }));
        expect(screen.getByLabelText("Card corners")).toHaveValue("sharp");
        expect(screen.getByLabelText("Font")).toHaveValue("playfair-display");
        // ...and the card reports itself as applied.
        fireEvent.click(screen.getByRole("button", { name: "Colors" }));
        expect(
            within(cardFor("Editorial Noir")).getByRole("button", { name: "Applied" }),
        ).toBeDisabled();
    });

    it("marks only the applied template", () => {
        renderCustomizer();

        fireEvent.click(within(cardFor("Midnight Gold")).getByRole("button", { name: "Apply" }));

        expect(
            within(cardFor("Midnight Gold")).getByRole("button", { name: "Applied" }),
        ).toBeDisabled();
        expect(
            within(cardFor("Electric Pop")).getByRole("button", { name: "Apply" }),
        ).toBeEnabled();
    });
});
