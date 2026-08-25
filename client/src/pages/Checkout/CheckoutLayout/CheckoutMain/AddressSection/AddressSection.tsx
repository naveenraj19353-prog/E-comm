import { useState } from "react";
import { Check, Edit3, MapPin, Plus, Trash2 } from "lucide-react";
import styles from "./AddressSection.module.css";
import type { Address } from "../../../../../features/address/types/address.types";
import { useAddresses } from "../../../../../features/address/hooks/useAddresses";
import type { AddressFormData } from "./AddressForm";
import AddressForm from "./AddressForm";
interface AddressSectionProps {
    userId?: string;
    tenantId?: string;
    onAddressSelect?: (address: Address) => void;
}
const AddressSection = ({ userId, tenantId, onAddressSelect, }: AddressSectionProps) => {
    const { addresses, isLoading, isSaving, isDeleting, error, addAddress, editAddress, removeAddress, } = useAddresses(userId as string, tenantId as string);
    const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [editingAddress, setEditingAddress] = useState<Address | null>(null);
    const selectedAddress = addresses.find((address) => address._id === selectedAddressId) ||
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
            await addAddress({
                ...data,
            });
            setShowForm(false);
            setEditingAddress(null);
        }
        catch (error) {
            console.error("Failed to create address:", error);
        }
    };
    const handleUpdateAddress = async (data: AddressFormData) => {
        if (!editingAddress) {
            return;
        }
        try {
            await editAddress(editingAddress._id, {
                ...data,
            });
            setSelectedAddressId(editingAddress._id);
            setShowForm(false);
            setEditingAddress(null);
        }
        catch (error) {
            console.error("Failed to update address:", error);
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
        }
        catch (error) {
            console.error("Failed to delete address:", error);
        }
    };
    if (isLoading) {
        return (<section className={styles.section}>
        <div className={styles.header}>
          <div>
            <span className={styles.eyebrow}>DELIVERY ADDRESS</span>
            <h2>Select delivery address</h2>
          </div>
        </div>
        <div className={styles.loading}>
          <MapPin size={20}/>
          <span>Loading your addresses...</span>
        </div>
      </section>);
    }
    if (showForm) {
        return (<section className={styles.section}>
        <AddressForm key={editingAddress?._id ?? "new-address"} initialData={editingAddress || undefined} isEditing={Boolean(editingAddress)} loading={isSaving} error={error} onSubmit={editingAddress ? handleUpdateAddress : handleCreateAddress} onCancel={handleCancelForm}/>
      </section>);
    }
    return (<section className={styles.section}>
      
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>DELIVERY ADDRESS</span>
          <h2>Select delivery address</h2>
          <p>Choose where you want your order delivered.</p>
        </div>
        <button type="button" className={styles.addButton} onClick={handleAddAddress}>
          <Plus size={17}/>
          Add Address
        </button>
      </div>
      
      {error && <div className={styles.error}>{error}</div>}
      
      {addresses.length === 0 ? (<div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <MapPin size={28}/>
          </div>
          <h3>No addresses found</h3>
          <p>Add a delivery address to continue checkout.</p>
          <button type="button" className={styles.addButton} onClick={handleAddAddress}>
            <Plus size={17}/>
            Add Address
          </button>
        </div>) : (<div className={styles.addressList}>
          {addresses.map((address) => {
                const isSelected = selectedAddress?._id === address._id;
                return (<div key={address._id} className={`${styles.addressCard} ${isSelected ? styles.addressCardSelected : ""}`} onClick={() => handleSelectAddress(address)}>
                
                <div className={styles.cardTop}>
                  <div className={styles.radio}>
                    {isSelected && <Check size={14}/>}
                  </div>
                  <div className={styles.addressMain}>
                    <div className={styles.nameRow}>
                      <strong>{address.fullName}</strong>
                      <span className={styles.type}>{address.addressType}</span>
                      {address.isDefault && (<span className={styles.defaultBadge}>Default</span>)}
                    </div>
                    <p>
                      {address.addressLine1}
                      {address.addressLine2 ? `, ${address.addressLine2}` : ""}
                    </p>
                    <p>
                      {address.city}, {address.state} - {address.postalCode}
                    </p>
                    <p>{address.country}</p>
                    <span className={styles.phone}>Phone: {address.phone}</span>
                  </div>
                </div>
                
                <div className={styles.cardActions}>
                  <button type="button" onClick={(event) => {
                        event.stopPropagation();
                        handleEditAddress(address);
                    }}>
                    <Edit3 size={14}/>
                    Edit
                  </button>
                  <button type="button" className={styles.deleteButton} disabled={isDeleting} onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteAddress(address._id);
                    }}>
                    <Trash2 size={14}/>
                    {isDeleting ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>);
            })}
        </div>)}
    </section>);
};
export default AddressSection;
