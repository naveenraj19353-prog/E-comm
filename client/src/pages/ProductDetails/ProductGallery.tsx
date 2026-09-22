import { useEffect, useState } from "react";
import { ZoomIn } from "lucide-react";
import ProductImage from "../../components/ProductImage";
import { DEFAULT_PRODUCT_IMAGE } from "../../constants/images";
import { getProductImagesForColor } from "../../features/products/inventory";
import { isVideoSrc } from "../../utils/mediaSrc";
import styles from "./ProductDetails.module.css";
import type { Product } from "../../features/products/types";
interface ProductGalleryProps {
    product: Product;
    selectedColor?: string;
}
const ZOOM_SCALE = 180;
const ProductGallery = ({ product, selectedColor, }: ProductGalleryProps) => {
    const [selectedImage, setSelectedImage] = useState(0);
    const [zoomVisible, setZoomVisible] = useState(false);
    const [zoomPosition, setZoomPosition] = useState({
        x: 50,
        y: 50,
    });
    const colorImages = getProductImagesForColor(product.images, selectedColor);
    const images = colorImages.length > 0
        ? colorImages
        : [DEFAULT_PRODUCT_IMAGE];
    useEffect(() => {
        setSelectedImage(0);
        setZoomVisible(false);
    }, [selectedColor]);
    const currentImage = images[selectedImage] || images[0];
    const currentIsVideo = isVideoSrc(currentImage);
    const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
        if (currentIsVideo) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 100;
        const y = ((event.clientY - rect.top) / rect.height) * 100;
        setZoomPosition({
            x: Math.max(0, Math.min(100, x)),
            y: Math.max(0, Math.min(100, y)),
        });
    };
    return (<div className={styles.gallery}>
      <div
        className={styles.mainImageWrapper}
        onMouseEnter={() => !currentIsVideo && setZoomVisible(true)}
        onMouseLeave={() => setZoomVisible(false)}
        onMouseMove={handleMouseMove}
      >
        <ProductImage
            src={currentImage}
            alt={`${product.name} ${selectedColor || ""}`}
            className={styles.mainImage}
            autoPlay
        />
        {!currentIsVideo && !zoomVisible && (
        <div className={styles.zoomHint}>
          <ZoomIn size={15}/>
          Hover to zoom
        </div>
        )}
        {!currentIsVideo && zoomVisible && (
        <div
            className={styles.zoomPreview}
            style={{
                backgroundImage: `url(${JSON.stringify(currentImage)})`,
                backgroundPosition: `${zoomPosition.x}% ${zoomPosition.y}%`,
                backgroundSize: `${ZOOM_SCALE}%`,
            }}
        />
        )}
      </div>
      {images.length > 1 && (
      <div className={styles.thumbnails}>
        {images.map((image, index) => (<button key={`${image}-${index}`} type="button" className={`${styles.thumbnail} ${selectedImage === index
                ? styles.thumbnailActive
                : ""}`} onClick={() => setSelectedImage(index)}>
            <ProductImage
                src={image}
                alt={`${product.name} ${selectedColor || ""} ${index + 1}`}
                autoPlay={false}
            />
          </button>))}
      </div>
      )}
    </div>);
};
export default ProductGallery;
