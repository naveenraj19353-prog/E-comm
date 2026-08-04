import styles from "./PriceFilter.module.css";

interface PriceFilterProps {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}

const PriceFilter = ({
  min,
  max,
  value,
  onChange,
}: PriceFilterProps) => {
  return (
    <div className={styles.wrapper}>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={styles.slider}
      />

      <div className={styles.labels}>
        <span>₹{min.toLocaleString()}</span>

        <strong>₹{value.toLocaleString()}</strong>

        <span>₹{max.toLocaleString()}</span>
      </div>
    </div>
  );
};

export default PriceFilter;