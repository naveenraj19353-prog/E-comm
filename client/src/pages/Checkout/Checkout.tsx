import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRazorpay } from "react-razorpay";
import { useQueryClient } from "@tanstack/react-query";
import { useCart } from "../../features/cart/hooks/useCart";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
import { usePayment } from "../../features/payment/hooks/usePayment";
import { useNavigateToLogin } from "../../features/auth/hooks/useNavigateToLogin";
import {
    useCheckout,
    useCheckoutPreview,
} from "../../features/checkout/hooks/useCheckout";
import type { DeliveryMethodType } from "../../features/checkout/api/checkout.api";
import CheckoutHeader from "./CheckoutHeader/CheckoutHeader";
import PageLoader from "../../components/PageLoader";
import CheckoutLayout from "./CheckoutLayout/CheckoutLayout";
import CheckoutMain from "./CheckoutLayout/CheckoutMain/CheckoutMain";
import AddressSection from "./CheckoutLayout/CheckoutMain/AddressSection/AddressSection";
import DeliveryMethod from "./CheckoutLayout/CheckoutMain/DeliveryMethod/DeliveryMethod";
import CouponSection from "./CheckoutLayout/CheckoutMain/CouponSection/CouponSection";
import PaymentMethod from "./CheckoutLayout/CheckoutMain/PaymentMethod/PaymentMethod";
import CheckoutSidebar from "./CheckoutLayout/CheckoutSidebar/CheckoutSidebar";
import styles from "./Checkout.module.css";
import type { Address } from "../../features/address/types/address.types";
import type { DeliveryOption } from "./CheckoutLayout/CheckoutMain/DeliveryMethod/DeliveryMethod";
import type { PaymentMethodType } from "./CheckoutLayout/CheckoutMain/PaymentMethod/PaymentMethod";
import { RAZORPAY_KEY_ID } from "../../constants/api";
import { routes } from "../../routes/routes";

const Checkout = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { Razorpay } = useRazorpay();
    const { user } = useAuth();
    const { tenantSlug } = useStorefrontTenant();
    const navigateToLogin = useNavigateToLogin();
    const { cart, grandTotal, isLoading } = useCart(
        user?._id as string,
        user?.tenantId as string,
    );
    const { createOrder, verifyPayment, isCreatingOrder, isVerifyingPayment } =
        usePayment();
    const { placeCodOrder, isPlacingCodOrder } = useCheckout();

    const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
    const [deliveryMethod, setDeliveryMethod] =
        useState<DeliveryMethodType>("standard");
    const [paymentMethod, setPaymentMethod] =
        useState<PaymentMethodType>("upi");
    const [couponInput, setCouponInput] = useState("");
    const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
    const [couponError, setCouponError] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const {
        data: checkoutPreview,
        isLoading: isPreviewLoading,
        isFetching: isPreviewFetching,
        error: previewError,
    } = useCheckoutPreview({
        tenantId: user?.tenantId || undefined,
        userId: user?._id || undefined,
        addressId: selectedAddress?._id || undefined,
        couponCode: appliedCoupon || undefined,
        deliveryMethod,
        enabled: Boolean(user?._id && user?.tenantId && cart.length > 0),
    });

    useEffect(() => {
        if (!appliedCoupon) {
            setCouponError(null);
            return;
        }
        if (previewError) {
            const axiosDetail = (
                previewError as {
                    response?: { data?: { detail?: string } };
                }
            ).response?.data?.detail;
            const message =
                axiosDetail ||
                (previewError instanceof Error
                    ? previewError.message
                    : "Invalid coupon code.");
            setCouponError(message);
            return;
        }
        if (checkoutPreview?.couponCode) {
            setCouponError(null);
        }
    }, [appliedCoupon, previewError, checkoutPreview?.couponCode]);

    const summary = useMemo(() => {
        if (checkoutPreview) {
            return {
                subtotal: checkoutPreview.subtotal,
                deliveryCharge: checkoutPreview.shipping,
                discount: checkoutPreview.discount,
                total: checkoutPreview.grandTotal,
            };
        }
        return {
            subtotal: grandTotal,
            deliveryCharge: 0,
            discount: 0,
            total: grandTotal,
        };
    }, [checkoutPreview, grandTotal]);

    const handleApplyCoupon = () => {
        const normalized = couponInput.trim().toUpperCase();
        if (!normalized) {
            return;
        }
        setCouponError(null);
        setAppliedCoupon(normalized);
    };

    const handleRemoveCoupon = () => {
        setAppliedCoupon(null);
        setCouponInput("");
        setCouponError(null);
    };

    const handleDeliveryChange = (option: DeliveryOption) => {
        setDeliveryMethod(option.id);
    };

    const redirectToThankYou = (params: {
        orderId?: string;
        amount?: number;
        paymentStatus?: string;
        paymentMethod?: "cod" | "online";
    }) => {
        if (!tenantSlug) {
            return;
        }
        if (params.orderId) {
            navigate(routes.thankYou(tenantSlug, params.orderId), {
                replace: true,
                state: {
                    amount: params.amount,
                    paymentStatus: params.paymentStatus,
                    paymentMethod: params.paymentMethod,
                },
            });
            return;
        }
        navigate(routes.home(tenantSlug), { replace: true });
    };

    const handlePlaceOrder = async () => {
        try {
            if (!user || !user._id || !user.tenantId) {
                navigateToLogin();
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
            if (appliedCoupon && couponError) {
                alert("Please fix the coupon before placing your order.");
                return;
            }

            setIsProcessing(true);

            if (paymentMethod === "cod") {
                const codOrder = await placeCodOrder({
                    tenantId: user.tenantId,
                    userId: user._id,
                    addressId: selectedAddress._id,
                    couponCode: appliedCoupon,
                    deliveryMethod,
                });
                await queryClient.invalidateQueries({ queryKey: ["cart"] });
                redirectToThankYou({
                    orderId: codOrder.orderId,
                    amount: codOrder.amount,
                    paymentStatus: codOrder.paymentStatus,
                    paymentMethod: "cod",
                });
                setIsProcessing(false);
                return;
            }

            if (!Razorpay) {
                alert("Razorpay SDK is not loaded.");
                setIsProcessing(false);
                return;
            }
            if (!RAZORPAY_KEY_ID) {
                alert("Payment is not configured. Please contact support.");
                setIsProcessing(false);
                return;
            }

            const orderData = await createOrder({
                tenantId: user.tenantId,
                userId: user._id,
                addressId: selectedAddress._id,
                couponCode: appliedCoupon,
                deliveryMethod,
            });

            const razorpayMethod =
                paymentMethod === "card"
                    ? "card"
                    : paymentMethod === "netbanking"
                      ? "netbanking"
                      : "upi";

            const options = {
                key: RAZORPAY_KEY_ID,
                amount: orderData.amountInPaise,
                currency: "INR" as const,
                name: "OmniStore",
                description: "E-commerce Order Payment",
                order_id: orderData.orderId,
                method: razorpayMethod,
                prefill: {
                    name: selectedAddress.fullName,
                    contact: selectedAddress.phone,
                },
                notes: {
                    tenantId: user.tenantId,
                    userId: user._id,
                } as unknown as string,
                theme: {
                    color: "#2f6b52",
                },
                handler: async (paymentResponse: {
                    razorpay_payment_id: string;
                    razorpay_order_id: string;
                    razorpay_signature: string;
                }) => {
                    try {
                        const verifyData = await verifyPayment({
                            tenantId: user.tenantId as string,
                            userId: user._id,
                            razorpayOrderId: paymentResponse.razorpay_order_id,
                            razorpayPaymentId: paymentResponse.razorpay_payment_id,
                            razorpaySignature: paymentResponse.razorpay_signature,
                            couponCode: appliedCoupon,
                        });
                        await queryClient.invalidateQueries({ queryKey: ["cart"] });
                        redirectToThankYou({
                            orderId: verifyData.orderId,
                            amount: verifyData.amount,
                            paymentStatus: verifyData.paymentStatus || "paid",
                            paymentMethod: "online",
                        });
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
                        setIsProcessing(false);
                    },
                },
            };

            const razorpay = new Razorpay(options);
            razorpay.on(
                "payment.failed",
                (response: {
                    error?: {
                        description?: string;
                        reason?: string;
                        code?: string;
                    };
                }) => {
                    const description =
                        response?.error?.description ||
                        response?.error?.reason ||
                        "Payment failed. Please try again.";
                    console.error("Razorpay payment.failed:", response);
                    alert(description);
                    setIsProcessing(false);
                },
            );
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
        return <PageLoader message="Loading checkout..." />;
    }

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
                            <DeliveryMethod
                                subtotal={summary.subtotal}
                                selectedMethod={deliveryMethod}
                                onDeliveryChange={handleDeliveryChange}
                            />
                            <CouponSection
                                value={couponInput}
                                appliedCode={
                                    checkoutPreview?.couponCode || appliedCoupon
                                }
                                error={couponError}
                                isApplying={isPreviewFetching && Boolean(appliedCoupon)}
                                onChange={setCouponInput}
                                onApply={handleApplyCoupon}
                                onRemove={handleRemoveCoupon}
                            />
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
                            subtotal={summary.subtotal}
                            deliveryCharge={summary.deliveryCharge}
                            discount={summary.discount}
                            appliedCoupon={checkoutPreview?.couponCode || appliedCoupon}
                            total={summary.total}
                            paymentMethod={paymentMethod}
                            onPlaceOrder={handlePlaceOrder}
                            isPlacingOrder={
                                isProcessing ||
                                isCreatingOrder ||
                                isVerifyingPayment ||
                                isPlacingCodOrder
                            }
                            isPreviewLoading={isPreviewLoading || isPreviewFetching}
                        />
                    }
                />
            </div>
        </div>
    );
};

export default Checkout;
