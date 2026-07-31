import styles from "./CategoryTabs.module.css";

interface Props {
  categories: string[];
  activeCategory: string;
  setCategory: (category: string) => void;
}

const CategoryTabs = ({
  categories,
  activeCategory,
  setCategory,
}: Props) => {
  return (
    <div className={styles.tabs}>
      {categories.map((item) => (
        <button
          key={item}
          className={activeCategory === item ? styles.active : ""}
          onClick={() => setCategory(item)}
        >
          {item.name}
        </button>
      ))}
    </div>
  );
};

export default CategoryTabs;