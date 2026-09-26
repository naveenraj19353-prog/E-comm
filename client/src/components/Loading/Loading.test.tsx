import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BusyLabel from "./BusyLabel";
import Spinner from "./Spinner";

/** Lucide tags the rotating icon, so its class name proves a spinner is present. */
const spinnerIcon = (container: HTMLElement) =>
    container.querySelector('svg[class*="loader"]');

describe("Spinner", () => {
    it("renders an animated icon", () => {
        const { container } = render(<Spinner />);

        expect(spinnerIcon(container)).not.toBeNull();
    });

    it("announces itself only when given a label", () => {
        const { container, rerender } = render(<Spinner />);
        expect(screen.queryByRole("status")).toBeNull();

        rerender(<Spinner label="Saving" />);
        expect(screen.getByRole("status")).toHaveTextContent("Saving");
        expect(spinnerIcon(container)).not.toBeNull();
    });
});

describe("BusyLabel", () => {
    it("shows the idle label when not busy", () => {
        const { container } = render(
            <BusyLabel busy={false} busyText="Adding...">
                Add to cart
            </BusyLabel>,
        );

        expect(screen.getByText("Add to cart")).toBeInTheDocument();
        expect(screen.queryByText("Adding...")).toBeNull();
        expect(spinnerIcon(container)).toBeNull();
    });

    it("swaps the label and adds a spinner when busy", () => {
        const { container } = render(
            <BusyLabel busy busyText="Adding...">
                Add to cart
            </BusyLabel>,
        );

        expect(screen.getByText("Adding...")).toBeInTheDocument();
        expect(screen.queryByText("Add to cart")).toBeNull();
        expect(spinnerIcon(container)).not.toBeNull();
    });

    it("keeps the label and only adds a spinner when no busy text is given", () => {
        const { container } = render(
            <BusyLabel busy>Add to cart</BusyLabel>,
        );

        expect(screen.getByText("Add to cart")).toBeInTheDocument();
        expect(spinnerIcon(container)).not.toBeNull();
    });
});

