import { useState } from "react";
import { MapPin, Plus } from "lucide-react";
import styles from "./AddressSection.module.css";
import type { Address } from "../../../../../features/address/types/address.types";
import { useAddresses } from "../../../../../features/address/hooks/useAddresses";
import type { AddressFormData } from "./AddressForm";
import AddressForm from "./AddressForm";
import AddressCard from "./AddressCard";

interface AddressSectionProps {
    userId?: string;
    tenantId?: string;
    onAddressSelect?: (address: Address) => void;
}

const AddressSection = ({
    userId,
    tenantId,
    onAddressSelect,
}: AddressSectionProps) => {
    const {
        addresses,
        isLoading,
        isSaving,
        isDeleting,
        error,
        addAddress,
        editAddress,
        removeAddress,
    } = useAddresses(userId as string, tenantId as string);
    const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [editingAddress, setEditingAddress] = useState<Address | null>(null);

    const selectedAddress =
        addresses.find((address) => address._id === selectedAddressId) ||
        addresses.find((address) => address.isDefault) ||
        addresses[0] ||
        null;

    const handleSelectAddress = (address: Address) => {
        setSelectedAddressId(address._id);
        onAddressSelect?.(address);
    };

    const handleAddAddress = () => {
        setEditingAddress(null);
        setShowForm(true);
    };

    const handleEditAddress = (address: Address) => {
        setEditingAddress(address);
        setShowForm(true);
    };

    const handleCancelForm = () => {
        setShowForm(false);
        setEditingAddress(null);
    };

    const handleCreateAddress = async (data: AddressFormData) => {
        try {
            await addAddress({ ...data });
            setShowForm(false);
            setEditingAddress(null);
        } catch (createError) {
            console.error("Failed to create address:", createError);
        }
    };

    const handleUpdateAddress = async (data: AddressFormData) => {
        if (!editingAddress) {
            return;
        }
        try {
            await editAddress(editingAddress._id, { ...data });
            setSelectedAddressId(editingAddress._id);
            setShowForm(false);
            setEditingAddress(null);
        } catch (updateError) {
            console.error("Failed to update address:", updateError);
        }
    };

    const handleDeleteAddress = async (id: string) => {
        const confirmed = window.confirm("Are you sure you want to delete this address?");
        if (!confirmed) {
            return;
        }
        try {
            await removeAddress(id);
            if (selectedAddressId === id) {
                setSelectedAddressId(null);
            }
        } catch (deleteError) {
            console.error("Failed to delete address:", deleteError);
        }
    };

    if (isLoading) {
        return (
            <section className={styles.section}>
                <div className={styles.header}>
                    <div>
                        <span className={styles.eyebrow}>DELIVERY ADDRESS</span>
                        <h2>Select delivery address</h2>
                    </div>
                </div>
                <div className={styles.loading}>
                    <MapPin size={20} />
                    <span>Loading your addresses...</span>
                </div>
            </section>
        );
    }

    if (showForm) {
        return (
            <div className={styles.formHost}>
                <AddressForm
                    key={editingAddress?._id ?? "new-address"}
                    initialData={editingAddress || undefined}
                    isEditing={Boolean(editingAddress)}
                    loading={isSaving}
                    error={error}
                    onSubmit={editingAddress ? handleUpdateAddress : handleCreateAddress}
                    onCancel={handleCancelForm}
                />
            </div>
        );
    }

    return (
        <section className={styles.section}>
            <div className={styles.header}>
                <div>
                    <span className={styles.eyebrow}>DELIVERY ADDRESS</span>
                    <h2>Select delivery address</h2>
                    <p>Choose where you want your order delivered.</p>
                </div>
                <button type="button" className={styles.addButton} onClick={handleAddAddress}>
                    <Plus size={17} />
                    Add Address
                </button>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            {addresses.length === 0 ? (
                <div className={styles.empty}>
                    <div className={styles.emptyIcon}>
                        <MapPin size={28} />
                    </div>
                    <h3>No addresses found</h3>
                    <p>Add a delivery address to continue checkout.</p>
                    <button type="button" className={styles.addButton} onClick={handleAddAddress}>
                        <Plus size={17} />
                        Add Address
                    </button>
                </div>
            ) : (
                <div className={styles.addressList}>
                    {addresses.map((address) => (
                        <AddressCard
                            key={address._id}
                            address={address}
                            selected={selectedAddress?._id === address._id}
                            onSelect={() => handleSelectAddress(address)}
                            onEdit={() => handleEditAddress(address)}
                            onDelete={() => handleDeleteAddress(address._id)}
                            isDeleting={isDeleting}
                        />
                    ))}
                </div>
            )}
        </section>
    );
};

export default AddressSection;
