import styles from "./ColorFilter.module.css";
import { getColorValue } from "../../utils/productColors";

interface ColorFilterProps {
    colors: string[];
    selectedColors: string[];
    onChange: (colors: string[]) => void;
}

const ColorFilter = ({ colors, selectedColors, onChange, }: ColorFilterProps) => {
    const toggleColor = (color: string) => {
        if (selectedColors.includes(color)) {
            onChange(selectedColors.filter((c) => c !== color));
        }
        else {
            onChange([...selectedColors, color]);
        }
    };
    return (<div className={styles.wrapper}>
      {colors.map((color) => (<button key={color} type="button" className={`${styles.colorItem} ${selectedColors.includes(color) ? styles.active : ""}`} onClick={() => toggleColor(color)}>
          <span className={styles.dot} style={{
                backgroundColor: getColorValue(color),
            }}/>
          <span>{color}</span>
        </button>))}
    </div>);
};
export default ColorFilter;
