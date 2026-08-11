import { Star } from "lucide-react";

import styles from "./RatingFilter.module.css";

interface RatingFilterProps {
  value: number | null;
  onChange: (rating: number | null) => void;
}

const ratings = [5, 4, 3, 2, 1];

const RatingFilter = ({ value, onChange }: RatingFilterProps) => {
  return (
    <div className={styles.wrapper}>
      {ratings.map((rating) => {
        const isActive = value === rating;

        return (
          <button
            key={rating}
            type="button"
            className={`${styles.item} ${isActive ? styles.active : ""}`}
            onClick={() => onChange(isActive ? null : rating)}
          >
            <div className={styles.ratingContent}>
              <div className={styles.stars}>
                {Array.from({
                  length: 5,
                }).map((_, index) => (
                  <Star
                    key={index}
                    size={15}
                    fill={index < rating ? "currentColor" : "none"}
                    strokeWidth={2}
                  />
                ))}
              </div>

              <span className={styles.label}>{rating} & Up</span>
            </div>

            <span className={styles.radio}>
              {isActive && <span className={styles.radioInner} />}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default RatingFilter;
