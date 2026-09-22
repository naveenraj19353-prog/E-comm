import { useFormatStorePrice } from "../../features/tenant/useFormatStorePrice";
import styles from "./PriceRange.module.css";
interface PriceRangeProps {
    values: number[];
    min: number;
    max: number;
    onChange: (values: number[]) => void;
}
const PriceRange = ({ values, min, max, onChange }: PriceRangeProps) => {
    const { formatPrice } = useFormatStorePrice();
    const minValue = values[0];
    const maxValue = values[1];
    const minPercent = ((minValue - min) / (max - min)) * 100;
    const maxPercent = ((maxValue - min) / (max - min)) * 100;
    const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = Number(e.target.value);
        if (value >= maxValue) {
            return;
        }
        onChange([value, maxValue]);
    };
    const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = Number(e.target.value);
        if (value <= minValue) {
            return;
        }
        onChange([minValue, value]);
    };
    return (<div className={styles.container}>
      <div className={styles.values}>
        <span>{formatPrice(minValue)}</span>
        <span>{formatPrice(maxValue)}</span>
      </div>
      <div className={styles.slider}>
        <div className={styles.track}/>
        <div className={styles.range} style={{
            left: `${minPercent}%`,
            right: `${100 - maxPercent}%`,
        }}/>
        <input type="range" min={min} max={max} value={minValue} onChange={handleMinChange} className={`${styles.input} ${styles.minInput}`}/>
        <input type="range" min={min} max={max} value={maxValue} onChange={handleMaxChange} className={`${styles.input} ${styles.maxInput}`}/>
      </div>
      <div className={styles.labels}>
        <span>{formatPrice(min)}</span>
        <span>{formatPrice(max)}</span>
      </div>
    </div>);
};
export default PriceRange;
