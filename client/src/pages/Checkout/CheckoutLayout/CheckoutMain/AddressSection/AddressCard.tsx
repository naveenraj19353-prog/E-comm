import { Check, Edit3, Trash2 } from "lucide-react";
import styles from "./AddressCard.module.css";
import type { Address } from "../../../../../features/address/types/address.types";

interface AddressCardProps {
    address: Address;
    selected: boolean;
    onSelect: () => void;
    onEdit: () => void;
    onDelete: () => void;
    isDeleting?: boolean;
}

const AddressCard = ({
    address,
    selected,
    onSelect,
    onEdit,
    onDelete,
    isDeleting = false,
}: AddressCardProps) => {
    const addressLine = [
        address.addressLine1,
        address.addressLine2,
        `${address.city}, ${address.state} - ${address.postalCode}, ${address.country}`,
    ]
        .filter(Boolean)
        .join(", ");

    return (
        <div
            className={`${styles.card} ${selected ? styles.selected : ""}`}
            onClick={onSelect}
        >
            <div className={styles.radio}>{selected && <Check size={13} />}</div>

            <div className={styles.content}>
                <div className={styles.nameRow}>
                    <strong>{address.fullName}</strong>
                    <span className={styles.type}>{address.addressType}</span>
                    {address.isDefault && <span className={styles.default}>Default</span>}
                </div>

                <p className={styles.addressLine}>{addressLine}</p>
                <p className={styles.phone}>{address.phone}</p>

                <div className={styles.actions} onClick={(event) => event.stopPropagation()}>
                    <button type="button" onClick={onEdit}>
                        <Edit3 size={14} />
                        Edit
                    </button>
                    <button
                        type="button"
                        className={styles.deleteButton}
                        disabled={isDeleting}
                        onClick={onDelete}
                    >
                        <Trash2 size={14} />
                        {isDeleting ? "Deleting..." : "Delete"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddressCard;
