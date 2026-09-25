/**
 * Central registry of backend API paths (relative to API_BASE_URL).
 * Must stay aligned with app/routes/*.py (see app/routes/README.md).
 *
 * After changing backend routes or frontend API calls, run from client/:
 *   npm run check:api
 */
export const API_ENDPOINTS = {
    HEALTH: "/health",
    HEALTHCHECK: "/healthcheck",

    AUTH: {
        LOGIN: "/auth/login",
        MENU_LOGIN: "/auth/menu-login",
        REGISTER: "/auth/register",
        FORGOT_PASSWORD: "/auth/forgot-password",
        RESET_PASSWORD: "/auth/reset-password",
        OTP_SEND: "/auth/otp/send",
        OTP_VERIFY: "/auth/otp/verify",
    },

    USERS: {
        LIST: "/users/",
        byId: (id: string) => `/users/${id}`,
        STORE_MANAGERS: "/users/store-managers",
        storeManagerById: (id: string) => `/users/store-managers/${id}`,
        customerNotes: (id: string) => `/users/${id}/notes`,
        customerNoteById: (id: string, noteId: string) => `/users/${id}/notes/${noteId}`,
    },

    TENANTS: {
        LIST: "/tenants/",
        CREATE: "/tenants/",
        REGISTER: "/tenants/register",
        REGISTER_SEND_OTP: "/tenants/register/send-otp",
        PUBLIC: "/tenants/public",
        byId: (id: string) => `/tenants/${id}`,
        byTenantId: (tenantId: string) => `/tenants/tenant-id/${tenantId}`,
        bySlug: (slug: string) => `/tenants/slug/${slug}`,
        storefrontLayout: (slug: string) => `/tenants/slug/${slug}/storefront-layout`,
        theme: (id: string) => `/tenants/${id}/theme`,
    },

    PRODUCT: {
        GET_ALL: "/product/get-all-products",
        LOW_STOCK: "/product/low-stock",
        CREATE: "/product/create-product",
        BULK_IMPORT: "/product/bulk-import",
        SEARCH: "/product/search",
        byId: (id: string) => `/product/${id}`,
        shareWhatsApp: (id: string) => `/product/${id}/share-whatsapp`,
        inventory: (id: string) => `/product/${id}/inventory`,
        checkStock: (id: string) => `/product/${id}/check-stock`,
        stockAdjustments: (id: string) => `/product/${id}/stock-adjustments`,
        stockMovements: (id: string) => `/product/${id}/stock-movements`,
    },

    CATEGORIES: {
        LIST: "/categories/",
        CREATE: "/categories/",
        byId: (id: string) => `/categories/${id}`,
    },

    CART: {
        ADD: "/cart/",
        CLEAR: "/cart/",
        byUserId: (userId: string) => `/cart/${userId}`,
        byProductId: (productId: string) => `/cart/${productId}`,
    },

    WISHLIST: {
        ADD: "/wishlist/",
        CLEAR: "/wishlist/",
        byUserId: (userId: string) => `/wishlist/${userId}`,
        byProductId: (productId: string) => `/wishlist/${productId}`,
    },

    ADDRESSES: {
        CREATE: "/addresses/create-address",
        byUserId: (userId: string) => `/addresses/get-address/${userId}`,
        update: (id: string) => `/addresses/update-address/${id}`,
        byId: (id: string) => `/addresses/${id}`,
    },

    CHECKOUT: {
        PREVIEW: "/checkout/",
    },

    COUPON: {
        CREATE: "/coupon/create-coupon",
        APPLY: "/coupon/apply-coupon",
        LIST: "/coupon/list",
        update: (id: string) => `/coupon/${id}`,
    },

    PAYMENTS: {
        TEST_RAZORPAY: "/payments/test-razorpay",
        CREATE_ORDER: "/payments/create-order",
        VERIFY: "/payments/verify",
        order: (orderId: string) => `/payments/order/${orderId}`,
        payment: (paymentId: string) => `/payments/payment/${paymentId}`,
        refund: (paymentId: string) => `/payments/refund/${paymentId}`,
        WEBHOOK: "/payments/webhook",
    },

    LEDGER: {
        STATEMENT: "/ledger/statement",
        PAYOUTS: "/ledger/payouts",
        COMMISSION: "/ledger/commission",
        OVERVIEW: "/ledger/overview",
        syncDeliveryCharge: (orderId: string) =>
            `/ledger/entries/${orderId}/sync-delivery-charge`,
    },

    BILLING: {
        STATUS: "/billing/status",
        SUBSCRIBE: "/billing/subscribe",
        EXEMPT: "/billing/exempt",
        OVERVIEW: "/billing/overview",
    },

    REVIEWS: {
        CREATE: "/reviews/",
        byProductId: (productId: string) => `/reviews/product/${productId}`,
        update: (id: string) => `/reviews/update-review/${id}`,
        delete: (id: string) => `/reviews/delete-review/${id}`,
    },

    PROFILE: {
        GET: "/profile/",
        UPDATE: "/profile/update-profile",
    },

    ORDERS: {
        CREATE: "/orders/",
        COD: "/orders/cod",
        MENU: "/orders/menu",
        ADMIN_LIST: "/orders/admin/list",
        ADMIN_ANALYTICS: "/orders/admin/analytics",
        adminDetail: (orderId: string) => `/orders/admin/detail/${orderId}`,
        adminStatus: (orderId: string) => `/orders/admin/${orderId}/status`,
        adminReturnApprove: (orderId: string) =>
            `/orders/admin/${orderId}/return/approve`,
        adminReturnReject: (orderId: string) =>
            `/orders/admin/${orderId}/return/reject`,
        adminReturnReceived: (orderId: string) =>
            `/orders/admin/${orderId}/return/received`,
        adminReturnRefund: (orderId: string) =>
            `/orders/admin/${orderId}/return/refund`,
        detail: (orderId: string) => `/orders/detail/${orderId}`,
        requestReturn: (orderId: string) => `/orders/detail/${orderId}/return`,
        byUserId: (userId: string) => `/orders/${userId}`,
    },

    MENU: {
        DAILY_PASSWORD: "/menu/daily-password",
        ROTATE_DAILY_PASSWORD: "/menu/daily-password/rotate",
        CARTS: "/menu/carts",
        cartPaymentDone: (userId: string) =>
            `/menu/carts/${userId}/payment-done`,
        paymentDone: (orderId: string) => `/menu/orders/${orderId}/payment-done`,
    },

    HOME: {
        GET: "/home/",
    },

    CONTACT: {
        CREATE: "/contact/",
        ADMIN_LIST: "/contact/admin/list",
        adminRead: (messageId: string) => `/contact/admin/${messageId}/read`,
    },

    UPLOAD: {
        IMAGE: "/upload/image",
    },

    BANNER: {
        CREATE: "/banner/create",
        GET_ALL: "/banner/get-all",
        ACTIVE: "/banner/active",
        update: (bannerId: string) => `/banner/update/${bannerId}`,
        delete: (bannerId: string) => `/banner/delete/${bannerId}`,
    },

    DELHIVERY: {
        SETTINGS: "/shipping/delhivery/settings",
        TEST: "/shipping/delhivery/test",
        SERVICEABILITY: "/shipping/delhivery/serviceability",
        PINCODE_CHECK: "/shipping/delhivery/pincode-check",
        SERVICEABILITY_HEAVY: "/shipping/delhivery/serviceability/heavy",
        WAREHOUSE: "/shipping/delhivery/warehouse",
        WAYBILLS: "/shipping/delhivery/waybills",
        RATE: "/shipping/delhivery/rate",
        SHIPMENTS: "/shipping/delhivery/shipments",
        PICKUP: "/shipping/delhivery/pickup",
        track: (awb: string) => `/shipping/delhivery/track/${awb}`,
        packingSlip: (awb: string) => `/shipping/delhivery/packing-slip/${awb}`,
        label: (shipmentId: string) => `/shipping/delhivery/shipments/${shipmentId}/label`,
    },

    PERISKOPE: {
        SETTINGS: "/integrations/periskope/settings",
        TEST: "/integrations/periskope/test",
        NOTIFICATIONS: "/integrations/periskope/notifications",
        retry: (notificationId: string) =>
            `/integrations/periskope/notifications/${notificationId}/retry`,
    },

    SUPER_ADMIN: {
        DASHBOARD: "/super-admin/dashboard",
    },
} as const;
