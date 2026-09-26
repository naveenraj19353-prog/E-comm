import type { ReactNode } from "react";
import Spinner, { type SpinnerSize } from "./Spinner";

export interface BusyLabelProps {
    busy: boolean;
    /** Copy shown while busy. When omitted the children stay and just gain a spinner. */
    busyText?: ReactNode;
    children: ReactNode;
    size?: SpinnerSize;
}

/**
 * Standard busy state for button contents: a spinner plus swapped copy.
 *
 *   <BusyLabel busy={isAdding} busyText="Adding...">Add to cart</BusyLabel>
 */
const BusyLabel = ({ busy, busyText, children, size = "xs" }: BusyLabelProps) => (
    <>
        {busy ? <Spinner size={size} /> : null}
        {busy && busyText ? busyText : children}
    </>
);

export default BusyLabel;
