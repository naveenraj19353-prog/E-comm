import { Star } from "lucide-react";
import type { Testimonial } from "./types";
import styles from "./TestimonialCard.module.css";
interface Props {
    testimonial: Testimonial;
}
const TestimonialCard = ({ testimonial }: Props) => {
    return (<div className={styles.card}>
      <img src={testimonial.image} alt={testimonial.name} className={styles.avatar}/>
      <h3>{testimonial.name}</h3>
      <p className={styles.role}>{testimonial.role}</p>
      <div className={styles.rating}>
        {Array.from({ length: testimonial.rating }).map((_, index) => (<Star key={index} size={16} fill="#facc15" stroke="#facc15"/>))}
      </div>
      <p className={styles.review}>"{testimonial.review}"</p>
    </div>);
};
export default TestimonialCard;
