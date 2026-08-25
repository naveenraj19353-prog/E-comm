import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRazorpay } from "react-razorpay";
import { useCart } from "../../features/cart/hooks/useCart";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
import { usePayment } from "../../features/payment/hooks/usePayment";
import CheckoutHeader from "./CheckoutHeader/CheckoutHeader";
import CheckoutLayout from "./CheckoutLayout/CheckoutLayout";
import CheckoutMain from "./CheckoutLayout/CheckoutMain/CheckoutMain";
import AddressSection from "./CheckoutLayout/CheckoutMain/AddressSection/AddressSection";
import DeliveryMethod from "./CheckoutLayout/CheckoutMain/DeliveryMethod/DeliveryMethod";
import PaymentMethod from "./CheckoutLayout/CheckoutMain/PaymentMethod/PaymentMethod";
import CheckoutSidebar from "./CheckoutLayout/CheckoutSidebar/CheckoutSidebar";
import styles from "./Checkout.module.css";
import type { Address } from "../../features/address/types/address.types";
import type { DeliveryOption } from "./CheckoutLayout/CheckoutMain/DeliveryMethod/DeliveryMethod";
import type { PaymentMethodType } from "./CheckoutLayout/CheckoutMain/PaymentMethod/PaymentMethod";
const Checkout = () => {
  const navigate = useNavigate();
  const { Razorpay } = useRazorpay();
  const { user } = useAuth();
  const { tenantSlug } = useStorefrontTenant();
  const { cart, grandTotal, isLoading } = useCart(
    user?._id as string,
    user?.tenantId as string,
  );
  const { createOrder, verifyPayment, isCreatingOrder, isVerifyingPayment } =
    usePayment();
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryOption>({
    id: "standard",
    name: "Standard Delivery",
    description: "Reliable delivery at no extra cost.",
    estimatedTime: "3–5 business days",
    price: 0,
  });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>("upi");
  const [isProcessing, setIsProcessing] = useState(false);
  const discount = 0;
  const subtotal = grandTotal;
  const deliveryCharge = deliveryMethod.price;
  const total = subtotal + deliveryCharge - discount;
  const handlePlaceOrder = async () => {
    try {
      if (!user?._id || !user?.tenantId) {
        alert("Please login before placing an order.");
        return;
      }
      if (!selectedAddress) {
        alert("Please select a delivery address.");
        return;
      }
      if (!cart.length) {
        alert("Your cart is empty.");
        return;
      }
      if (!Razorpay) {
        alert("Razorpay SDK is not loaded.");
        return;
      }
      setIsProcessing(true);
      const orderData = await createOrder({
        tenantId: user.tenantId,
        userId: user._id,
        couponCode: null,
      });
      console.log("Razorpay order created:", orderData);
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: orderData.amountInPaise,
        currency: "INR" as const,
        name: "OmniStore",
        description: "E-commerce Order Payment",
        order_id: orderData.orderId,
        prefill: {
          name: selectedAddress.fullName,
          contact: selectedAddress.phone,
        },
        notes: JSON.stringify({
          tenantId: user.tenantId,
          userId: user._id,
        }),
        theme: {
          color: "#2f6b52",
        },
        handler: async (paymentResponse: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          try {
            console.log("Razorpay payment response:", paymentResponse);
            const verifyData = await verifyPayment({
              tenantId: user.tenantId as string,
              userId: user._id,
              razorpayOrderId: paymentResponse.razorpay_order_id,
              razorpayPaymentId: paymentResponse.razorpay_payment_id,
              razorpaySignature: paymentResponse.razorpay_signature,
              couponCode: null,
            });
            console.log("Payment verified:", verifyData);
            alert("Payment successful! Order placed.");
            if (verifyData.orderId && tenantSlug) {
              navigate(`/${tenantSlug}`);
            }
          } catch (error) {
            console.error("Payment verification error:", error);
            alert(
              error instanceof Error
                ? error.message
                : "Payment verification failed.",
            );
          } finally {
            setIsProcessing(false);
          }
        },
        modal: {
          ondismiss: () => {
            console.log("Razorpay checkout closed.");
            setIsProcessing(false);
          },
        },
      };
      const razorpay = new Razorpay(options);
      razorpay.open();
    } catch (error) {
      console.error("Place order error:", error);
      alert(
        error instanceof Error ? error.message : "Unable to process order.",
      );
      setIsProcessing(false);
    }
  };
  /*
   * ================================
   * LOADING
   * ================================
   */
  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <CheckoutHeader />
          <div
            style={{
              padding: "60px 0",
              textAlign: "center",
            }}
          >
            Loading checkout...
          </div>
        </div>
      </div>
    );
  }
  /*
   * ================================
   * CHECKOUT UI
   * ================================
   */
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <CheckoutHeader />
        <CheckoutLayout
          main={
            <CheckoutMain>
              <AddressSection
                userId={user?._id}
                tenantId={user?.tenantId || tenantSlug}
                onAddressSelect={setSelectedAddress}
              />
              <DeliveryMethod onDeliveryChange={setDeliveryMethod} />
              <PaymentMethod
                selectedMethod={paymentMethod}
                onMethodChange={setPaymentMethod}
              />
            </CheckoutMain>
          }
          sidebar={
            <CheckoutSidebar
              items={cart.map((item) => ({
                id: item.productId,
                name: item.name,
                image: item.image,
                quantity: item.quantity,
                price: item.price,
              }))}
              subtotal={subtotal}
              deliveryCharge={deliveryCharge}
              discount={discount}
              total={total}
              onPlaceOrder={handlePlaceOrder}
              isPlacingOrder={
                isProcessing || isCreatingOrder || isVerifyingPayment
              }
            />
          }
        />
      </div>
    </div>
  );
};
export default Checkout;
