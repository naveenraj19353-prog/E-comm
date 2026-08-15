import { useState } from "react";
import { X } from "lucide-react";
import styles from "./AddressForm.module.css";
import type { Address } from "../../../../../features/address/types/address.types";
export interface AddressFormData {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  addressType: "Home" | "Office" | "Other";
  isDefault: boolean;
}
interface AddressFormProps {
  initialData?: Address;
  isEditing?: boolean;
  loading?: boolean;
  error?: string;
  onSubmit: (data: AddressFormData) => Promise<void>;
  onCancel: () => void;
}
const EMPTY_FORM: AddressFormData = {
  fullName: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  country: "India",
  postalCode: "",
  addressType: "Home",
  isDefault: false,
};
const AddressForm = ({
  initialData,
  isEditing = false,
  loading = false,
  error = "",
  onSubmit,
  onCancel,
}: AddressFormProps) => {
  const [validationError, setValidationError] = useState("");
  const [formData, setFormData] = useState<AddressFormData>(() => {
    if (initialData) {
      return {
        fullName: initialData.fullName,
        phone: initialData.phone,
        addressLine1: initialData.addressLine1,
        addressLine2: initialData.addressLine2 || "",
        city: initialData.city,
        state: initialData.state,
        country: initialData.country,
        postalCode: initialData.postalCode,
        addressType: initialData.addressType,
        isDefault: initialData.isDefault,
      };
    }
    return EMPTY_FORM;
  });
  const handleChange = (
    field: keyof AddressFormData,
    value: string | boolean,
  ) => {
    setFormData((previous) => ({
      ...previous,
      [field]: value,
    }));
    if (validationError) {
      setValidationError("");
    }
  };
  const validateForm = () => {
    if (formData.fullName.trim().length < 3) {
      return "Please enter your full name.";
    }
    if (
      formData.phone.trim().length < 10 ||
      formData.phone.trim().length > 15
    ) {
      return "Please enter a valid phone number.";
    }
    if (formData.addressLine1.trim().length < 5) {
      return "Please enter a valid address.";
    }
    if (!formData.city.trim()) {
      return "Please enter your city.";
    }
    if (!formData.state.trim()) {
      return "Please enter your state.";
    }
    if (!formData.country.trim()) {
      return "Please enter your country.";
    }
    if (!formData.postalCode.trim()) {
      return "Please enter your postal code.";
    }
    return "";
  };
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errorMessage = validateForm();
    if (errorMessage) {
      setValidationError(errorMessage);
      return;
    }
    try {
      await onSubmit({
        ...formData,
        fullName: formData.fullName.trim(),
        phone: formData.phone.trim(),
        addressLine1: formData.addressLine1.trim(),
        addressLine2: formData.addressLine2?.trim() || "",
        city: formData.city.trim(),
        state: formData.state.trim(),
        country: formData.country.trim(),
        postalCode: formData.postalCode.trim(),
      });
    } catch (submitError) {
      console.error("Address form submission failed:", submitError);
    }
  };
  return (
    <div className={styles.formWrapper}>
      <div className={styles.formHeader}>
        <div>
          <span className={styles.eyebrow}>DELIVERY ADDRESS</span>
          <h3>{isEditing ? "Edit Address" : "Add New Address"}</h3>
          <p>Enter the address where your order should be delivered.</p>
        </div>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onCancel}
          disabled={loading}
          aria-label="Close address form"
        >
          <X size={19} />
        </button>
      </div>
      {(validationError || error) && (
        <div className={styles.error}>{validationError || error}</div>
      )}
      <form className={styles.form} onSubmit={handleSubmit}>
        {}
        <div className={styles.field}>
          <label htmlFor="fullName">Full Name</label>
          <input
            id="fullName"
            type="text"
            value={formData.fullName}
            onChange={(event) => handleChange("fullName", event.target.value)}
            placeholder="Enter full name"
            disabled={loading}
          />
        </div>
        {}
        <div className={styles.field}>
          <label htmlFor="phone">Phone Number</label>
          <input
            id="phone"
            type="tel"
            value={formData.phone}
            onChange={(event) => handleChange("phone", event.target.value)}
            placeholder="Enter phone number"
            disabled={loading}
          />
        </div>
        {}
        <div className={styles.fieldFull}>
          <label htmlFor="addressLine1">Address Line 1</label>
          <input
            id="addressLine1"
            type="text"
            value={formData.addressLine1}
            onChange={(event) =>
              handleChange("addressLine1", event.target.value)
            }
            placeholder="House number, street name"
            disabled={loading}
          />
        </div>
        {}
        <div className={styles.fieldFull}>
          <label htmlFor="addressLine2">
            Address Line 2<span className={styles.optional}>Optional</span>
          </label>
          <input
            id="addressLine2"
            type="text"
            value={formData.addressLine2 || ""}
            onChange={(event) =>
              handleChange("addressLine2", event.target.value)
            }
            placeholder="Apartment, landmark, area"
            disabled={loading}
          />
        </div>
        {}
        <div className={styles.field}>
          <label htmlFor="city">City</label>
          <input
            id="city"
            type="text"
            value={formData.city}
            onChange={(event) => handleChange("city", event.target.value)}
            placeholder="City"
            disabled={loading}
          />
        </div>
        {}
        <div className={styles.field}>
          <label htmlFor="state">State</label>
          <input
            id="state"
            type="text"
            value={formData.state}
            onChange={(event) => handleChange("state", event.target.value)}
            placeholder="State"
            disabled={loading}
          />
        </div>
        {}
        <div className={styles.field}>
          <label htmlFor="country">Country</label>
          <input
            id="country"
            type="text"
            value={formData.country}
            onChange={(event) => handleChange("country", event.target.value)}
            placeholder="Country"
            disabled={loading}
          />
        </div>
        {}
        <div className={styles.field}>
          <label htmlFor="postalCode">Postal Code</label>
          <input
            id="postalCode"
            type="text"
            value={formData.postalCode}
            onChange={(event) => handleChange("postalCode", event.target.value)}
            placeholder="Postal code"
            disabled={loading}
          />
        </div>
        {}
        <div className={styles.fieldFull}>
          <label>Address Type</label>
          <div className={styles.typeOptions}>
            {(["Home", "Office", "Other"] as const).map((type) => (
              <button
                key={type}
                type="button"
                className={`${styles.typeButton} ${
                  formData.addressType === type ? styles.typeButtonActive : ""
                }`}
                onClick={() => handleChange("addressType", type)}
                disabled={loading}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
        {}
        <label className={styles.defaultOption}>
          <input
            type="checkbox"
            checked={formData.isDefault}
            onChange={(event) =>
              handleChange("isDefault", event.target.checked)
            }
            disabled={loading}
          />
          <span>Set as default address</span>
        </label>
        {}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={styles.submitButton}
            disabled={loading}
          >
            {loading
              ? "Saving..."
              : isEditing
                ? "Update Address"
                : "Save Address"}
          </button>
        </div>
      </form>
    </div>
  );
};
export default AddressForm;
