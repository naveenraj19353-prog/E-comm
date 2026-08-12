import { useState } from "react";
import { ZoomIn } from "lucide-react";


import styles from "./ProductDetails.module.css";
import type { Product } from "../../features/products/types";

interface ProductGalleryProps {
  product: Product;
}

const ProductGallery = ({ product }: ProductGalleryProps) => {
  const [selectedImage, setSelectedImage] = useState(0);

  const [zoomVisible, setZoomVisible] = useState(false);

  const [zoomPosition, setZoomPosition] = useState({
    x: 50,
    y: 50,
  });

  const images = product.images?.length
    ? product.images
    : ["https://picsum.photos/600/600"];

  const currentImage =
    images[selectedImage] || images[0];

  const handleMouseMove = (
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    const rect =
      event.currentTarget.getBoundingClientRect();

    const x =
      ((event.clientX - rect.left) / rect.width) * 100;

    const y =
      ((event.clientY - rect.top) / rect.height) * 100;

    setZoomPosition({
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    });
  };

  return (
    <div className={styles.gallery}>
      {/* Thumbnails */}
      <div className={styles.thumbnails}>
        {images.map((image, index) => (
          <button
            key={`${image}-${index}`}
            type="button"
            className={`${styles.thumbnail} ${
              selectedImage === index
                ? styles.thumbnailActive
                : ""
            }`}
            onClick={() => setSelectedImage(index)}
          >
            <img
              src={image}
              alt={`${product.name} ${index + 1}`}
            />
          </button>
        ))}
      </div>

      {/* Main Image */}
      <div
        className={styles.mainImageWrapper}
        onMouseEnter={() => setZoomVisible(true)}
        onMouseLeave={() => setZoomVisible(false)}
        onMouseMove={handleMouseMove}
      >
        <img
          src={currentImage}
          alt={product.name}
          className={styles.mainImage}
        />

        <div className={styles.zoomHint}>
          <ZoomIn size={15} />
          Hover to zoom
        </div>

        {zoomVisible && (
          <div
            className={styles.zoomPreview}
            style={{
              backgroundImage: `url("${currentImage}")`,
              backgroundPosition: `${zoomPosition.x}% ${zoomPosition.y}%`,
            }}
          />
        )}
      </div>
    </div>
  );
};

export default ProductGallery;