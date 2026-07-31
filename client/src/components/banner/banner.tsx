import { useEffect, useState } from "react";
import styles from "./banner.module.css";

export interface BannerSlide {
  image: string;
  title: string;
  subTitle: string;
  highlightText?: string;
  primaryButtonText?: string;
  secondaryButtonText?: string;
  onPrimaryClick?: () => void;
  onSecondaryClick?: () => void;
}

interface BannerProps {
  slides: BannerSlide[];
  autoPlay?: boolean;
  interval?: number;
}

const Banner = ({
  slides,
  autoPlay = true,
  interval = 4000,
}: BannerProps) => {
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    if (!autoPlay || slides.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, interval);

    return () => clearInterval(timer);
  }, [slides.length, autoPlay, interval]);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) =>
      prev === 0 ? slides.length - 1 : prev - 1
    );
  };

  const slide = slides[currentSlide];

  return (
    <section
      className={styles.banner}
      style={{
        backgroundImage: `url(${slide.image})`,
      }}
    >
      <div className={styles.overlay}></div>

      <div className={styles.headerContent}>
        <h1>{slide.title}</h1>

        <h3>
          {slide.subTitle}{" "}
          {slide.highlightText && (
            <span>{slide.highlightText}</span>
          )}
        </h3>

        <div className={styles.buttonContainer}>
          {slide.primaryButtonText && (
            <button
              className={styles.primaryButton}
              onClick={slide.onPrimaryClick}
            >
              {slide.primaryButtonText}
            </button>
          )}

          {slide.secondaryButtonText && (
            <button
              className={styles.secondaryButton}
              onClick={slide.onSecondaryClick}
            >
              {slide.secondaryButtonText}
            </button>
          )}
        </div>

        <div className={styles.dots}>
          {slides.map((_, index) => (
            <span
              key={index}
              className={`${styles.dot} ${
                currentSlide === index ? styles.active : ""
              }`}
              onClick={() => setCurrentSlide(index)}
            />
          ))}
        </div>
      </div>

      <button
        className={`${styles.arrow} ${styles.prev}`}
        onClick={prevSlide}
      >
        ❮
      </button>

      <button
        className={`${styles.arrow} ${styles.next}`}
        onClick={nextSlide}
      >
        ❯
      </button>
    </section>
  );
};

export default Banner;