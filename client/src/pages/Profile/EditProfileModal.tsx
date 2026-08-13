import { useEffect, useState } from "react";
import { X, User, Phone } from "lucide-react";


import styles from "./EditProfileModal.module.css";
import type { Profile, UpdateProfileRequest } from "../../features/profile/type/types";

interface Props {
  profile: Profile;
  isUpdating: boolean;
  onClose: () => void;
  onSubmit: (
    data: UpdateProfileRequest
  ) => Promise<void>;
}

const EditProfileModal = ({
  profile,
  isUpdating,
  onClose,
  onSubmit,
}: Props) => {

  const [name, setName] = useState(
    profile.name || ""
  );

  const [phone, setPhone] = useState(
    profile.phone || ""
  );

  const [error, setError] =
    useState("");

  useEffect(() => {
    setName(profile.name || "");
    setPhone(profile.phone || "");
  }, [profile]);

  const handleSubmit = async (
    event: React.FormEvent
  ) => {

    event.preventDefault();

    setError("");

    if (name.trim().length < 2) {
      setError(
        "Name must contain at least 2 characters."
      );
      return;
    }

    if (
      phone &&
      (phone.length < 10 ||
        phone.length > 15)
    ) {
      setError(
        "Please enter a valid phone number."
      );
      return;
    }

    try {

      await onSubmit({
        name: name.trim(),
        phone: phone.trim(),
      });

    } catch {
      setError(
        "Unable to update profile."
      );
    }
  };

  return (
    <div
      className={styles.overlay}
      onMouseDown={onClose}
    >

      <div
        className={styles.modal}
        onMouseDown={(event) =>
          event.stopPropagation()
        }
      >

        {/* Header */}

        <div className={styles.header}>

          <div>
            <h2>Edit Profile</h2>

            <p>
              Update your personal information.
            </p>
          </div>

          <button
            className={styles.closeButton}
            onClick={onClose}
            type="button"
          >
            <X size={20} />
          </button>

        </div>

        {/* Form */}

        <form
          onSubmit={handleSubmit}
          className={styles.form}
        >

          {/* Name */}

          <div className={styles.field}>

            <label htmlFor="profile-name">
              Full Name
            </label>

            <div className={styles.inputWrapper}>
              <User size={18} />

              <input
                id="profile-name"
                type="text"
                value={name}
                onChange={(event) =>
                  setName(event.target.value)
                }
                placeholder="Enter your name"
              />
            </div>

          </div>

          {/* Email */}

          <div className={styles.field}>

            <label htmlFor="profile-email">
              Email
            </label>

            <input
              id="profile-email"
              type="email"
              value={profile.email}
              disabled
            />

            <small>
              Email cannot be changed here.
            </small>

          </div>

          {/* Phone */}

          <div className={styles.field}>

            <label htmlFor="profile-phone">
              Phone Number
            </label>

            <div className={styles.inputWrapper}>
              <Phone size={18} />

              <input
                id="profile-phone"
                type="tel"
                value={phone}
                onChange={(event) =>
                  setPhone(event.target.value)
                }
                placeholder="Enter phone number"
              />
            </div>

          </div>

          {/* Error */}

          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}

          {/* Actions */}

          <div className={styles.actions}>

            <button
              type="button"
              className={styles.cancelButton}
              onClick={onClose}
              disabled={isUpdating}
            >
              Cancel
            </button>

            <button
              type="submit"
              className={styles.saveButton}
              disabled={isUpdating}
            >
              {isUpdating
                ? "Saving..."
                : "Save Changes"}
            </button>

          </div>

        </form>

      </div>

    </div>
  );
};

export default EditProfileModal;