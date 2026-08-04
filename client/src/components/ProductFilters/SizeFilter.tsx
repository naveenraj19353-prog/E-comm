import styles from "./SizeFilter.module.css";

interface SizeFilterProps {
  sizes: string[];
  selectedSizes: string[];
  onChange: (sizes: string[]) => void;
}

const SizeFilter = ({
  sizes,
  selectedSizes,
  onChange,
}: SizeFilterProps) => {
  const toggleSize = (size: string) => {
    if (selectedSizes.includes(size)) {
      onChange(selectedSizes.filter((s) => s !== size));
    } else {
      onChange([...selectedSizes, size]);
    }
  };

  return (
    <div className={styles.wrapper}>
      {sizes.map((size) => (
        <button
          key={size}
          type="button"
          className={`${styles.size} ${
            selectedSizes.includes(size)
              ? styles.active
              : ""
          }`}
          onClick={() => toggleSize(size)}
        >
          {size}
        </button>
      ))}
    </div>
  );
};

export default SizeFilter;