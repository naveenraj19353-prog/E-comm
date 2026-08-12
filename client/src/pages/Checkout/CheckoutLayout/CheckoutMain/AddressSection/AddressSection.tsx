import { MapPin, Plus } from "lucide-react";

import styles from "./AddressSection.module.css";

const AddressSection = () => {
  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>DELIVERY</span>

          <h2>Delivery Address</h2>

          <p>
            Choose where you want your order delivered.
          </p>
        </div>

        <button
          type="button"
          className={styles.addButton}
        >
          <Plus size={16} />
          Add Address
        </button>
      </div>

      <div className={styles.addressList}>
        {/* Address cards will come here */}
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <MapPin size={20} />
          </div>

          <div>
            <strong>No delivery address selected</strong>
            <p>
              Add an address to continue with your order.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AddressSection;