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
        REGISTER: "/auth/register",
        FORGOT_PASSWORD: "/auth/forgot-password",
        RESET_PASSWORD: "/auth/reset-password",
    },

    USERS: {
        LIST: "/users/",
        byId: (id: string) => `/users/${id}`,
    },

    TENANTS: {
        LIST: "/tenants/",
        CREATE: "/tenants/",
        byId: (id: string) => `/tenants/${id}`,
        byTenantId: (tenantId: string) => `/tenants/tenant-id/${tenantId}`,
        bySlug: (slug: string) => `/tenants/slug/${slug}`,
        storefrontLayout: (slug: string) => `/tenants/slug/${slug}/storefront-layout`,
        theme: (id: string) => `/tenants/${id}/theme`,
    },

    PRODUCT: {
        GET_ALL: "/product/get-all-products",
        CREATE: "/product/create-product",
        BULK_IMPORT: "/product/bulk-import",
        SEARCH: "/product/search",
        byId: (id: string) => `/product/${id}`,
        inventory: (id: string) => `/product/${id}/inventory`,
        checkStock: (id: string) => `/product/${id}/check-stock`,
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
        ADMIN_LIST: "/orders/admin/list",
        adminDetail: (orderId: string) => `/orders/admin/detail/${orderId}`,
        adminStatus: (orderId: string) => `/orders/admin/${orderId}/status`,
        detail: (orderId: string) => `/orders/detail/${orderId}`,
        byUserId: (userId: string) => `/orders/${userId}`,
    },

    HOME: {
        GET: "/home/",
    },

    BANNER: {
        CREATE: "/banner/create",
        GET_ALL: "/banner/get-all",
        ACTIVE: "/banner/active",
        update: (bannerId: string) => `/banner/update/${bannerId}`,
        delete: (bannerId: string) => `/banner/delete/${bannerId}`,
    },

    SUPER_ADMIN: {
        DASHBOARD: "/super-admin/dashboard",
    },
} as const;
