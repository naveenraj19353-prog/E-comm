import { Star } from "lucide-react";
import styles from "./RatingFilter.module.css";

interface RatingFilterProps {
  value: number | null;
  onChange: (rating: number | null) => void;
}

const ratings = [5, 4, 3, 2, 1];

const RatingFilter = ({
  value,
  onChange,
}: RatingFilterProps) => {
  return (
    <div className={styles.wrapper}>
      {ratings.map((rating) => (
        <button
          key={rating}
          className={`${styles.item} ${
            value === rating ? styles.active : ""
          }`}
          onClick={() =>
            onChange(value === rating ? null : rating)
          }
        >
          <div className={styles.stars}>
            {Array.from({ length: 5 }).map((_, index) => (
              <Star
                key={index}
                size={16}
                fill={index < rating ? "#fbbf24" : "none"}
                stroke="#fbbf24"
              />
            ))}
          </div>

          <span>& Up</span>
        </button>
      ))}
    </div>
  );
};

export default RatingFilter;