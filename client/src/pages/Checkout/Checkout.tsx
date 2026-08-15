import { useState } from "react";
import { useRazorpay } from "react-razorpay";
import { useCart } from "../../features/cart/hooks/useCart";
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
import { useAuth } from "../../features/auth/hooks/useAuth";
const API_URL = "http://127.0.0.1:8000";
const Checkout = () => {
  const user = useAuth().user;
  const { cart, grandTotal, isLoading } = useCart(user?._id, user?.tenantId);
  const { Razorpay } = useRazorpay();
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
      if (!selectedAddress) {
        alert("Please select a delivery address.");
        return;
      }
      if (!cart.length) {
        alert("Your cart is empty.");
        return;
      }
      setIsProcessing(true);
 
      const response = await fetch(`${API_URL}/payments/create-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId: user?.tenantId,
          userId: user?._id,
          couponCode: null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || "Unable to create payment order.");
      }
      console.log("Razorpay order created:", data);
   
      if (!Razorpay) {
        throw new Error("Razorpay SDK is not loaded.");
      }
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: data.amountInPaise,
        currency: data.currency,
        name: "OmniStore",
        description: "E-commerce Order Payment",
        order_id: data.orderId,
        prefill: {
          name: selectedAddress.fullName,
          contact: selectedAddress.phone,
        },
        notes: JSON.stringify({
          tenantId: user?.tenantId,
          userId: user?._id,
        }),
        theme: {
          color: "#2f6b52",
        },
        handler: async function (paymentResponse: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) {
          try {
            console.log("Razorpay payment response:", paymentResponse);
          
            const verifyResponse = await fetch(`${API_URL}/payments/verify`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                tenantId: user?.tenantId,
                userId: user?._id,
                razorpayOrderId: paymentResponse.razorpay_order_id,
                razorpayPaymentId: paymentResponse.razorpay_payment_id,
                razorpaySignature: paymentResponse.razorpay_signature,
                couponCode: null,
              }),
            });
            const verifyData = await verifyResponse.json();
            if (!verifyResponse.ok) {
              throw new Error(
                verifyData?.detail || "Payment verification failed.",
              );
            }
            console.log("Payment verified:", verifyData);
          
            alert("Payment successful! Order placed.");
            console.log("Order ID:", verifyData.orderId);
            // Later:
            // navigate(`/${tenantId}/orders/${verifyData.orderId}`);
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
          ondismiss: function () {
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
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <CheckoutHeader />
        <CheckoutLayout
          main={
            <CheckoutMain>
              <AddressSection onAddressSelect={setSelectedAddress} />
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
              isPlacingOrder={isProcessing}
            />
          }
        />
      </div>
    </div>
  );
};
export default Checkout;
