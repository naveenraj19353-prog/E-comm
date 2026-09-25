import type { ComponentProps } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";
import type { ReceivingCommitResult, ReceivingPreview, ReceivingProduct } from "../api/receiving.api";
import ReceiveStockModal from "./ReceiveStockModal";

vi.mock("../../../api/client", () => ({ default: { get: vi.fn(), post: vi.fn() } }));

type ApiCall = (url: string, bodyOrConfig?: unknown) => Promise<{ data: unknown }>;
const get = apiClient.get as unknown as Mock<ApiCall>;
const post = apiClient.post as unknown as Mock<ApiCall>;

const PREVIEW_URL = API_ENDPOINTS.INVENTORY.RECEIVING_PREVIEW;
const COMMIT_URL = API_ENDPOINTS.INVENTORY.RECEIVING_COMMIT;

const NIKE: ReceivingProduct = {
    _id: "p-nike",
    name: "Nike T-Shirt",
    categoryId: "T_SHIRTS",
    inventory: [
        { variantId: "NK-TS-BLK-S", color: "Black", size: "S", stock: 20 },
        { variantId: "NK-TS-BLK-M", color: "Black", size: "M", stock: 100 },
    ],
};

function previewResponse(overrides: Partial<ReceivingPreview> = {}): ReceivingPreview {
    return {
        action: "EXISTING_PRODUCT",
        matchType: "explicit_product_id",
        matchReason: "productId supplied.",
        requiresConfirmation: false,
        product: { id: "p-nike", name: "Nike T-Shirt", categoryId: "T_SHIRTS", categoryName: "T-Shirts" },
        category: { categoryId: "T_SHIRTS", categoryName: "T-Shirts", status: "existing" },
        variants: [
            {
                variantId: "NK-TS-BLK-S", proposedVariantId: null, color: "Black", size: "S", matchedBy: "variant_id",
                existingStock: 20, incomingStock: 10, finalStock: 30, action: "ADD_TO_EXISTING_VARIANT",
            },
            {
                variantId: null, proposedVariantId: "NI-TSHI-YEL-XL", color: "Yellow", size: "XL", matchedBy: "new",
                existingStock: 0, incomingStock: 30, finalStock: 30, action: "CREATE_NEW_VARIANT",
            },
        ],
        totals: { existingStock: 20, incomingStock: 40, finalStock: 60 },
        warnings: [],
        previewToken: "token-1",
        expiresAt: "2026-09-25T10:00:00+00:00",
        ...overrides,
    };
}

const COMMIT_RESULT: ReceivingCommitResult = {
    success: true,
    receivingId: "rcv-1",
    productId: "p-nike",
    action: "EXISTING_PRODUCT",
    replayed: false,
    variants: [
        { variantId: "NK-TS-BLK-S", color: "Black", size: "S", beforeStock: 20, receivedStock: 10, afterStock: 30, action: "STOCK_INCREASED" },
        { variantId: "NI-TSHI-YEL-XL", color: "Yellow", size: "XL", beforeStock: 0, receivedStock: 30, afterStock: 30, action: "VARIANT_CREATED" },
    ],
    totals: { beforeStock: 20, receivedStock: 40, afterStock: 60 },
};

const apiError = (status: number, detail: unknown) => Object.assign(new Error("request failed"), { response: { status, data: { detail } } });

function callsTo(url: string) {
    return post.mock.calls.filter(([calledUrl]) => calledUrl === url);
}

function renderModal(props: Partial<ComponentProps<typeof ReceiveStockModal>> = {}) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const onClose = vi.fn();
    render(
        <QueryClientProvider client={queryClient}>
            <ReceiveStockModal tenantId="store-a" onClose={onClose} {...props} />
        </QueryClientProvider>,
    );
    return { onClose, invalidate, user: userEvent.setup() };
}

/** Enter 10 for Black / S and a new Yellow / XL variant with 30, then preview. */
async function previewNike(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText("Incoming for Black / S"), "10");
    await user.click(screen.getByRole("button", { name: "+ Add a colour / size" }));
    await user.type(screen.getByLabelText("New variant 1 colour"), "Yellow");
    await user.type(screen.getByLabelText("New variant 1 size"), "XL");
    await user.type(screen.getByLabelText("New variant 1 incoming"), "30");
    await user.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByRole("table", { name: "Receiving preview" });
}

beforeEach(() => {
    get.mockReset();
    post.mockReset();
    get.mockImplementation(async (url) => {
        if (url === API_ENDPOINTS.PRODUCT.GET_ALL) {
            return { data: { data: [NIKE] } };
        }
        if (url === API_ENDPOINTS.CATEGORIES.LIST) {
            return { data: { data: [{ _id: "T_SHIRTS", categoryId: "T_SHIRTS", name: "T-Shirts" }] } };
        }
        throw new Error(`unexpected GET ${url}`);
    });
});

describe("ReceiveStockModal preview", () => {
    it("finds a product, sends only incoming quantities and shows the backend's preview", async () => {
        post.mockResolvedValueOnce({ data: previewResponse() });
        const { user } = renderModal();

        await user.type(screen.getByLabelText("Search products"), "nike");
        await user.click(await screen.findByRole("button", { name: /Nike T-Shirt/ }));
        await previewNike(user);

        expect(get).toHaveBeenCalledWith(API_ENDPOINTS.PRODUCT.GET_ALL, {
            params: expect.objectContaining({ tenantId: "store-a", includeInactive: true }),
        });
        expect(callsTo(PREVIEW_URL)[0][1]).toEqual({
            tenantId: "store-a",
            productId: "p-nike",
            variants: [
                { variantId: "NK-TS-BLK-S", incomingStock: 10 },
                { color: "Yellow", size: "XL", incomingStock: 30 },
            ],
        });
        const rows = within(screen.getByRole("table", { name: "Receiving preview" })).getAllByRole("row");
        expect(rows[1]).toHaveTextContent(/NK-TS-BLK-S.*Black \/ S.*20.*\+10.*30.*Stock increase/);
        expect(rows[2]).toHaveTextContent(/NI-TSHI-YEL-XL.*Yellow \/ XL.*0.*\+30.*30.*New variant/);
    });

    it("shows the backend's final values as-is instead of calculating them", async () => {
        const preview = previewResponse();
        preview.variants[0] = { ...preview.variants[0], finalStock: 31 };
        post.mockResolvedValueOnce({ data: preview });
        const { user } = renderModal({ initialProduct: NIKE });

        await previewNike(user);

        const firstRow = within(screen.getByRole("table", { name: "Receiving preview" })).getAllByRole("row")[1];
        expect(firstRow).toHaveTextContent("31");
    });
});

describe("ReceiveStockModal validation", () => {
    it.each([
        ["-5", "must be a whole number"],
        ["2.5", "must be a whole number"],
        ["100001", "must be a whole number"],
    ])("rejects incoming stock %s before calling the API", async (value, message) => {
        const { user } = renderModal({ initialProduct: NIKE });

        await user.type(screen.getByLabelText("Incoming for Black / S"), value);
        await user.click(screen.getByRole("button", { name: "Preview" }));

        expect(await screen.findByRole("alert")).toHaveTextContent(message);
        expect(post).not.toHaveBeenCalled();
    });

    it("needs at least one quantity and a complete, unique new variant", async () => {
        const { user } = renderModal({ initialProduct: NIKE });

        await user.click(screen.getByRole("button", { name: "Preview" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Enter at least one incoming quantity.");

        await user.click(screen.getByRole("button", { name: "+ Add a colour / size" }));
        await user.type(screen.getByLabelText("New variant 1 colour"), "black");
        await user.type(screen.getByLabelText("New variant 1 size"), "s");
        await user.type(screen.getByLabelText("New variant 1 incoming"), "3");
        await user.click(screen.getByRole("button", { name: "Preview" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("already exists on this product");
        expect(post).not.toHaveBeenCalled();
    });

    it("shows the backend's validation message", async () => {
        post.mockRejectedValueOnce(apiError(422, [{ msg: "Input should be greater than or equal to 0" }]));
        const { user } = renderModal({ initialProduct: NIKE });

        await user.type(screen.getByLabelText("Incoming for Black / S"), "1");
        await user.click(screen.getByRole("button", { name: "Preview" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Input should be greater than or equal to 0");
    });
});

describe("ReceiveStockModal commit", () => {
    it("commits with only the token, confirm and note, then shows the result and refreshes data", async () => {
        post.mockResolvedValueOnce({ data: previewResponse() }).mockResolvedValueOnce({ data: COMMIT_RESULT });
        const { user, invalidate, onClose } = renderModal({ initialProduct: NIKE });

        await previewNike(user);
        await user.type(screen.getByLabelText("Note (optional)"), "Invoice 42");
        await user.click(screen.getByRole("button", { name: "Confirm receiving" }));

        expect(await screen.findByRole("status")).toHaveTextContent("Stock received.");
        const [url, body] = callsTo(COMMIT_URL)[0];
        expect(url).toBe(COMMIT_URL);
        expect(body).toStrictEqual({ previewToken: "token-1", confirm: false, note: "Invoice 42" });
        const result = within(screen.getByRole("table", { name: "Receiving result" })).getAllByRole("row");
        expect(result[1]).toHaveTextContent(/NK-TS-BLK-S.*20.*\+10.*30.*Stock increased/);
        expect(result[2]).toHaveTextContent(/NI-TSHI-YEL-XL.*0.*\+30.*30.*Variant created/);
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin-products", "store-a"] });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin-low-stock", "store-a"] });

        await user.click(screen.getByRole("button", { name: "Done" }));
        expect(onClose).toHaveBeenCalled();
    });

    it("never sends stock values, even without a note", async () => {
        post.mockResolvedValueOnce({ data: previewResponse() }).mockResolvedValueOnce({ data: COMMIT_RESULT });
        const { user } = renderModal({ initialProduct: NIKE });

        await previewNike(user);
        await user.click(screen.getByRole("button", { name: "Confirm receiving" }));
        await screen.findByRole("status");

        const body = callsTo(COMMIT_URL)[0][1] as Record<string, unknown>;
        expect(Object.keys(body).sort()).toEqual(["confirm", "previewToken"]);
    });

    it("commits once when Confirm is clicked twice", async () => {
        let finish: (value: { data: unknown }) => void = () => undefined;
        post.mockResolvedValueOnce({ data: previewResponse() }).mockImplementationOnce(
            () => new Promise((resolve) => { finish = resolve; }),
        );
        const { user } = renderModal({ initialProduct: NIKE });

        await previewNike(user);
        const confirm = screen.getByRole("button", { name: "Confirm receiving" });
        // Three clicks in the same tick, before React can re-render and disable the button.
        fireEvent.click(confirm);
        fireEvent.click(confirm);
        fireEvent.click(confirm);

        await waitFor(() => expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled());
        await waitFor(() => expect(callsTo(COMMIT_URL)).toHaveLength(1));
        finish({ data: COMMIT_RESULT });
        expect(await screen.findByRole("status")).toHaveTextContent("Stock received.");
        expect(callsTo(COMMIT_URL)).toHaveLength(1);
    });

    it("handles a stale preview by refreshing it and committing the new token", async () => {
        post
            .mockResolvedValueOnce({ data: previewResponse() })
            .mockRejectedValueOnce(apiError(409, {
                code: "RECEIVING_PREVIEW_STALE",
                message: "Stock changed after preview. Refresh the preview before saving.",
            }))
            .mockResolvedValueOnce({ data: previewResponse({ previewToken: "token-2" }) })
            .mockResolvedValueOnce({ data: COMMIT_RESULT });
        const { user } = renderModal({ initialProduct: NIKE });

        await previewNike(user);
        await user.click(screen.getByRole("button", { name: "Confirm receiving" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Stock changed after preview");

        await user.click(screen.getByRole("button", { name: "Refresh preview" }));
        await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
        expect(callsTo(PREVIEW_URL)[1][1]).toEqual(callsTo(PREVIEW_URL)[0][1]);

        await user.click(screen.getByRole("button", { name: "Confirm receiving" }));
        await screen.findByRole("status");
        expect(callsTo(COMMIT_URL)[1][1]).toStrictEqual({ previewToken: "token-2", confirm: false });
    });

    it("requires explicit confirmation when the preview asks for it", async () => {
        post
            .mockResolvedValueOnce({ data: previewResponse({ requiresConfirmation: true, warnings: ["Please double-check this."] }) })
            .mockResolvedValueOnce({ data: COMMIT_RESULT });
        const { user } = renderModal({ initialProduct: NIKE });

        await previewNike(user);
        expect(screen.getByRole("list", { name: "Warnings" })).toHaveTextContent("Please double-check this.");
        const confirm = screen.getByRole("button", { name: "Confirm receiving" });
        expect(confirm).toBeDisabled();

        await user.click(screen.getByRole("checkbox"));
        expect(confirm).toBeEnabled();
        await user.click(confirm);
        await screen.findByRole("status");
        expect(callsTo(COMMIT_URL)[0][1]).toStrictEqual({ previewToken: "token-1", confirm: true });
    });

    it.each([
        [409, { code: "CONFIRMATION_REQUIRED", message: "Confirm this receiving (for example its new category) before saving." }, "Confirm this receiving"],
        [409, { code: "VARIANT_ID_CONFLICT", message: "The generated variantId X is already used." }, "Change the colour or size name"],
        [403, "You do not have permission for this action.", "You don't have permission to receive stock."],
    ])("explains a %s commit error", async (status, detail, message) => {
        post.mockResolvedValueOnce({ data: previewResponse() }).mockRejectedValueOnce(apiError(status, detail));
        const { user } = renderModal({ initialProduct: NIKE });

        await previewNike(user);
        await user.click(screen.getByRole("button", { name: "Confirm receiving" }));

        expect(await screen.findByRole("alert")).toHaveTextContent(message);
    });

    it("lets the admin retry the same token after a network error", async () => {
        post
            .mockResolvedValueOnce({ data: previewResponse() })
            .mockRejectedValueOnce(new Error("Network Error"))
            .mockResolvedValueOnce({ data: { ...COMMIT_RESULT, replayed: true } });
        const { user } = renderModal({ initialProduct: NIKE });

        await previewNike(user);
        await user.click(screen.getByRole("button", { name: "Confirm receiving" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Retrying is safe");

        await user.click(screen.getByRole("button", { name: "Confirm receiving" }));
        expect(await screen.findByRole("status")).toHaveTextContent("already saved");
        expect(callsTo(COMMIT_URL).map(([, body]) => body)).toStrictEqual([
            { previewToken: "token-1", confirm: false },
            { previewToken: "token-1", confirm: false },
        ]);
    });
});

describe("ReceiveStockModal new product and candidates", () => {
    it("only offers existing categories and never sends free-text categories", async () => {
        post.mockResolvedValueOnce({
            data: previewResponse({
                action: "NEW_PRODUCT",
                matchType: "none",
                product: { id: null, name: "Linen Kurta", categoryId: "T_SHIRTS", categoryName: "T-Shirts" },
            }),
        });
        const { user } = renderModal();

        await user.click(screen.getByRole("button", { name: "Receive a new product" }));
        expect(screen.getByText(/Receiving never creates categories/)).toBeInTheDocument();
        await user.type(screen.getByLabelText("Product name"), "Linen Kurta");
        await user.type(screen.getByLabelText("New variant 1 colour"), "White");
        await user.type(screen.getByLabelText("New variant 1 size"), "L");
        await user.type(screen.getByLabelText("New variant 1 incoming"), "12");
        await user.click(screen.getByRole("button", { name: "Preview" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Choose a category.");

        const category = screen.getByLabelText("Category");
        await waitFor(() => expect(within(category).getByRole("option", { name: "T-Shirts" })).toBeInTheDocument());
        expect(within(category).getAllByRole("option").map((option) => option.textContent)).toEqual([
            "Select a category",
            "T-Shirts",
        ]);
        await user.selectOptions(category, "T_SHIRTS");
        await user.click(screen.getByRole("button", { name: "Preview" }));
        await screen.findByRole("table", { name: "Receiving preview" });

        expect(callsTo(PREVIEW_URL)[0][1]).toEqual({
            tenantId: "store-a",
            name: "Linen Kurta",
            categoryId: "T_SHIRTS",
            categoryName: "T-Shirts",
            variants: [{ color: "White", size: "L", incomingStock: 12 }],
        });
        expect(screen.getByText(/hidden draft at price 0/)).toBeInTheDocument();
    });

    it("a name + category match has no commit; the admin chooses the product first", async () => {
        post
            .mockResolvedValueOnce({
                data: previewResponse({ action: "EXISTING_PRODUCT", matchType: "candidate", requiresConfirmation: true, previewToken: null, expiresAt: null }),
            })
            .mockResolvedValueOnce({ data: previewResponse() });
        const { user } = renderModal();

        await user.click(screen.getByRole("button", { name: "Receive a new product" }));
        await user.type(screen.getByLabelText("Product name"), "Nike T-Shirt");
        const category = screen.getByLabelText("Category");
        await waitFor(() => expect(within(category).getByRole("option", { name: "T-Shirts" })).toBeInTheDocument());
        await user.selectOptions(category, "T_SHIRTS");
        await user.type(screen.getByLabelText("New variant 1 colour"), "Black");
        await user.type(screen.getByLabelText("New variant 1 size"), "S");
        await user.type(screen.getByLabelText("New variant 1 incoming"), "5");
        await user.click(screen.getByRole("button", { name: "Preview" }));

        expect(await screen.findByText(/matches the existing product/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Confirm receiving" })).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Use this product" }));
        await screen.findByRole("button", { name: "Confirm receiving" });
        expect(callsTo(PREVIEW_URL)[1][1]).toEqual({
            tenantId: "store-a",
            productId: "p-nike",
            variants: [{ color: "Black", size: "S", incomingStock: 5 }],
        });
        expect(callsTo(COMMIT_URL)).toHaveLength(0);
    });
});
