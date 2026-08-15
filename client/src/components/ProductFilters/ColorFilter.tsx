import styles from "./ColorFilter.module.css";
interface ColorFilterProps {
  colors: string[];
  selectedColors: string[];
  onChange: (colors: string[]) => void;
}
const colorMap: Record<string, string> = {
  Black: "#000000",
  White: "#FFFFFF",
  Red: "#EF4444",
  Green: "#22C55E",
  Blue: "#3B82F6",
  Yellow: "#FACC15",
  Grey: "#9CA3AF",
  Gray: "#9CA3AF",
  Pink: "#EC4899",
  Orange: "#F97316",
  Purple: "#8B5CF6",
  Brown: "#8B5A2B",
};
const ColorFilter = ({
  colors,
  selectedColors,
  onChange,
}: ColorFilterProps) => {
  const toggleColor = (color: string) => {
    if (selectedColors.includes(color)) {
      onChange(selectedColors.filter((c) => c !== color));
    } else {
      onChange([...selectedColors, color]);
    }
  };
  return (
    <div className={styles.wrapper}>
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          className={`${styles.colorItem} ${
            selectedColors.includes(color) ? styles.active : ""
          }`}
          onClick={() => toggleColor(color)}
        >
          <span
            className={styles.dot}
            style={{
              backgroundColor: colorMap[color] ?? "#D1D5DB",
            }}
          />
          <span>{color}</span>
        </button>
      ))}
    </div>
  );
};
export default ColorFilter;
