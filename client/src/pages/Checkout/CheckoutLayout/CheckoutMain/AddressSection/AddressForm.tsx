import { useState } from "react";
import { X } from "lucide-react";

import styles from "./AddressForm.module.css";

import type { Address } from "../../../../../features/address/types/address.types";

import { useAppSelector } from "../../../../../app/hooks";

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
  tenantId: string;
  userId: string;
}

interface AddressFormProps {
  initialData?: Address;
  isEditing?: boolean;
  loading?: boolean;
  error?: string;
  onSubmit: (data: AddressFormData) => Promise<void>;
  onCancel: () => void;
}

const AddressForm = ({
  initialData,
  isEditing = false,
  loading = false,
  error = "",
  onSubmit,
  onCancel,
}: AddressFormProps) => {
  const user = useAppSelector((state) => state.auth.user);

  const tenantSlug = useAppSelector((state) => state.tenant.tenantSlug);

  const tenantId = tenantSlug?.trim() || "";

  const userId = user?._id || "";

  const [validationError, setValidationError] = useState("");

  const [formData, setFormData] = useState<AddressFormData>(() => ({
    fullName: initialData?.fullName || "",
    phone: initialData?.phone || "",
    addressLine1: initialData?.addressLine1 || "",
    addressLine2: initialData?.addressLine2 || "",
    city: initialData?.city || "",
    state: initialData?.state || "",
    country: initialData?.country || "India",
    postalCode: initialData?.postalCode || "",
    addressType: initialData?.addressType || "Home",
    isDefault: initialData?.isDefault || false,
    tenantId,
    userId,
  }));

  const handleChange = (
    field: keyof AddressFormData,
    value: string | boolean
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

    if (!tenantId) {
      return "Tenant information is missing.";
    }

    if (!userId) {
      return "User information is missing.";
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

        tenantId,

        userId,
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
        <div className={styles.grid}>
          <div className={styles.field}>
            <label htmlFor="fullName">
              Full Name
              <span className={styles.required}>*</span>
            </label>

            <input
              id="fullName"
              type="text"
              value={formData.fullName}
              onChange={(event) => handleChange("fullName", event.target.value)}
              placeholder="Enter full name"
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="phone">
              Phone Number
              <span className={styles.required}>*</span>
            </label>

            <input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(event) => handleChange("phone", event.target.value)}
              placeholder="Enter phone number"
              disabled={loading}
            />
          </div>

          <div className={`${styles.field} ${styles.fullWidth}`}>
            <label htmlFor="addressLine1">
              Address Line 1<span className={styles.required}>*</span>
            </label>

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

          <div className={`${styles.field} ${styles.fullWidth}`}>
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

          <div className={styles.field}>
            <label htmlFor="city">
              City
              <span className={styles.required}>*</span>
            </label>

            <input
              id="city"
              type="text"
              value={formData.city}
              onChange={(event) => handleChange("city", event.target.value)}
              placeholder="City"
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="state">
              State
              <span className={styles.required}>*</span>
            </label>

            <input
              id="state"
              type="text"
              value={formData.state}
              onChange={(event) => handleChange("state", event.target.value)}
              placeholder="State"
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="country">
              Country
              <span className={styles.required}>*</span>
            </label>

            <input
              id="country"
              type="text"
              value={formData.country}
              onChange={(event) => handleChange("country", event.target.value)}
              placeholder="Country"
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="postalCode">
              Postal Code
              <span className={styles.required}>*</span>
            </label>

            <input
              id="postalCode"
              type="text"
              value={formData.postalCode}
              onChange={(event) =>
                handleChange("postalCode", event.target.value)
              }
              placeholder="Postal code"
              disabled={loading}
            />
          </div>

          <div className={`${styles.field} ${styles.fullWidth}`}>
            <div className={styles.typeSection}>
              <label className={styles.typeLabel}>Address Type</label>

              <div className={styles.typeOptions}>
                {(["Home", "Office", "Other"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`${styles.typeButton} ${
                      formData.addressType === type
                        ? styles.typeButtonActive
                        : ""
                    }`}
                    onClick={() => handleChange("addressType", type)}
                    disabled={loading}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={`${styles.fullWidth} ${styles.defaultRow}`}>
            <input
              id="isDefault"
              className={styles.checkbox}
              type="checkbox"
              checked={formData.isDefault}
              onChange={(event) =>
                handleChange("isDefault", event.target.checked)
              }
              disabled={loading}
            />

            <label htmlFor="isDefault">Set as default address</label>
          </div>

          <div className={`${styles.fullWidth} ${styles.actions}`}>
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
              className={styles.saveButton}
              disabled={loading}
            >
              {loading
                ? "Saving..."
                : isEditing
                ? "Update Address"
                : "Save Address"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default AddressForm;
