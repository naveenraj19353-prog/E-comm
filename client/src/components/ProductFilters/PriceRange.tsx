import { Range } from "react-range";
import styles from "./PriceRange.module.css";

interface PriceRangeProps {
  values: number[];
  min: number;
  max: number;
  onChange: (values: number[]) => void;
}

const PriceRange = ({
  values,
  min,
  max,
  onChange,
}: PriceRangeProps) => {
  return (
    <div className={styles.wrapper}>
      <Range
        step={100}
        min={min}
        max={max}
        values={values}
        onChange={onChange}
        renderTrack={({ props, children }) => (
          <div
            {...props}
            className={styles.track}
          >
            {children}
          </div>
        )}
        renderThumb={({ props }) => (
          <div
            {...props}
            className={styles.thumb}
          />
        )}
      />

      <div className={styles.values}>
        <span>₹{values[0].toLocaleString()}</span>

        <span>₹{values[1].toLocaleString()}</span>
      </div>
    </div>
  );
};

export default PriceRange;