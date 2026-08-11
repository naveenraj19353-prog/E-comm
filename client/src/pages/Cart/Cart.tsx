import {
  ArrowRight,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  Truck,
} from "lucide-react";

import { useCart } from "../../features/cart/hooks/useCart";

import styles from "./Cart.module.css";

const Cart = () => {
  const userId = "6a4c664aad39d00258ffc0ba";
  const tenantId = "TENANT001";

  const {
    cart,
    grandTotal,
    cartCount,
    isLoading,
    isUpdating,
    isRemoving,
    isClearing,
    updateCart,
    removeFromCart,
    clearCart,
  } = useCart(userId, tenantId);

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <div className={styles.loader}>
          <ShoppingBag size={24} />
        </div>
        <span>Loading your cart...</span>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>
          <ShoppingBag size={38} />
        </div>

        <h1>Your cart is empty</h1>

        <p>
          Looks like you haven't added anything
          to your cart yet.
        </p>

        <button
          type="button"
          className={styles.shopButton}
        >
          Start Shopping
          <ArrowRight size={17} />
        </button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>
            <ShoppingBag size={15} />
            Your Bag
          </div>

          <h1>Shopping Cart</h1>

          <p>
            {cartCount}{" "}
            {cartCount === 1 ? "item" : "items"}{" "}
            in your cart
          </p>
        </div>

        <button
          type="button"
          className={styles.clearCart}
          onClick={() => clearCart()}
          disabled={isClearing}
        >
          {isClearing ? "Clearing..." : "Clear Cart"}
        </button>
      </div>

      {/* Free Delivery Banner */}
      <div className={styles.deliveryBanner}>
        <div className={styles.deliveryIcon}>
          <Truck size={18} />
        </div>

        <div>
          <strong>Free delivery</strong>
          <span>
            Enjoy free delivery on your order.
          </span>
        </div>
      </div>

      {/* Main Layout */}
      <div className={styles.layout}>
        {/* Cart Items */}
        <div className={styles.items}>
          {cart.map((item) => (
            <div
              key={item.productId}
              className={styles.item}
            >
              {/* Image */}
              <div className={styles.imageWrapper}>
                <img
                  src={item.image}
                  alt={item.name}
                  className={styles.image}
                />
              </div>

              {/* Details */}
              <div className={styles.details}>
                <h2>{item.name}</h2>

                <p className={styles.price}>
                  ₹{item.price.toLocaleString()}
                </p>

                <div className={styles.actions}>
                  {/* Quantity */}
                  <div className={styles.quantity}>
                    <button
                      type="button"
                      disabled={
                        isUpdating ||
                        item.quantity <= 1
                      }
                      onClick={() =>
                        updateCart({
                          productId:
                            item.productId,
                          quantity:
                            item.quantity - 1,
                        })
                      }
                      aria-label="Decrease quantity"
                    >
                      <Minus size={15} />
                    </button>

                    <span>{item.quantity}</span>

                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() =>
                        updateCart({
                          productId:
                            item.productId,
                          quantity:
                            item.quantity + 1,
                        })
                      }
                      aria-label="Increase quantity"
                    >
                      <Plus size={15} />
                    </button>
                  </div>

                  {/* Remove */}
                  <button
                    type="button"
                    className={styles.remove}
                    disabled={isRemoving}
                    onClick={() =>
                      removeFromCart(
                        item.productId
                      )
                    }
                  >
                    <Trash2 size={15} />

                    {isRemoving
                      ? "Removing..."
                      : "Remove"}
                  </button>
                </div>
              </div>

              {/* Subtotal */}
              <div className={styles.subtotal}>
                <span>Subtotal</span>
                <strong>
                  ₹{item.subtotal.toLocaleString()}
                </strong>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <aside className={styles.summary}>
          <div className={styles.summaryHeader}>
            <h2>Order Summary</h2>

            <span>{cartCount} items</span>
          </div>

          <div className={styles.summaryRows}>
            <div className={styles.summaryRow}>
              <span>Subtotal</span>
              <span>
                ₹{grandTotal.toLocaleString()}
              </span>
            </div>

            <div className={styles.summaryRow}>
              <span>Delivery</span>
              <span className={styles.free}>
                FREE
              </span>
            </div>
          </div>

          <div className={styles.divider} />

          <div className={styles.total}>
            <div>
              <span>Total</span>
              <small>Inclusive of all taxes</small>
            </div>

            <strong>
              ₹{grandTotal.toLocaleString()}
            </strong>
          </div>

          <button
            type="button"
            className={styles.checkout}
          >
            Proceed To Checkout
            <ArrowRight size={18} />
          </button>

          <div className={styles.secure}>
            <span className={styles.secureDot} />
            Secure checkout
          </div>
        </aside>
      </div>
    </div>
  );
};

export default Cart;
