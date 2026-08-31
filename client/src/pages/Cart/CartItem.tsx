import { Minus, Plus, Trash2 } from "lucide-react";
import ProductImage from "../../components/ProductImage";
import styles from "./Cart.module.css";
interface CartItemProps {
    item: {
        productId: string;
        name: string;
        image: string;
        price: number;
        quantity: number;
        subtotal: number;
    };
    isUpdating: boolean;
    isRemoving: boolean;
    onUpdateQuantity: (data: {
        productId: string;
        quantity: number;
    }) => void;
    onRemove: (productId: string) => void;
}
const CartItem = ({ item, isUpdating, isRemoving, onUpdateQuantity, onRemove, }: CartItemProps) => {
    return (<div className={styles.item}>
      <div className={styles.imageWrapper}>
        <ProductImage src={item.image} alt={item.name} className={styles.image} />
      </div>
      <div className={styles.details}>
        <h2>{item.name}</h2>
        <p className={styles.price}>₹{item.price.toLocaleString("en-IN")}</p>
        <div className={styles.actions}>
          <div className={styles.quantity}>
            <button type="button" disabled={isUpdating || item.quantity <= 1} onClick={() => onUpdateQuantity({
            productId: item.productId,
            quantity: item.quantity - 1,
        })} aria-label="Decrease quantity">
              <Minus size={15}/>
            </button>
            <span>{item.quantity}</span>
            <button type="button" disabled={isUpdating} onClick={() => onUpdateQuantity({
            productId: item.productId,
            quantity: item.quantity + 1,
        })} aria-label="Increase quantity">
              <Plus size={15}/>
            </button>
          </div>
          <button type="button" className={styles.remove} disabled={isRemoving} onClick={() => onRemove(item.productId)}>
            <Trash2 size={15}/>
            {isRemoving ? "Removing..." : "Remove"}
          </button>
        </div>
      </div>
      <div className={styles.subtotal}>
        <span>Subtotal</span>
        <strong>₹{item.subtotal.toLocaleString("en-IN")}</strong>
      </div>
    </div>);
};
export default CartItem;
