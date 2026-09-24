import { store } from "../../app/store";
import { logout, syncAuthSession } from "./authSlice";
import { adoptTenantIdSlot, isAuthStorageKey } from "./token";

type RouterLike = {
    subscribe: (listener: (state: { location: { pathname: string } }) => void) => () => void;
};

let started = false;

const clean = (value?: string | null) => String(value || "").trim().toLowerCase();

/**
 * Keeps `state.auth` on the session for the page being viewed:
 * - on navigation (store A → store B → admin panel) it swaps sessions
 * - when another tab signs in/out it re-reads storage
 * - once the store loads, a session saved for a different store is dropped
 */
export function startAuthSessionSync(router: RouterLike): void {
    if (started || typeof window === "undefined") {
        return;
    }
    started = true;

    let lastPathname = window.location.pathname;
    router.subscribe((state) => {
        const pathname = state.location.pathname;
        if (pathname === lastPathname) {
            return;
        }
        lastPathname = pathname;
        store.dispatch(syncAuthSession({ pathname }));
    });

    window.addEventListener("storage", (event) => {
        if (isAuthStorageKey(event.key)) {
            store.dispatch(syncAuthSession());
        }
    });

    let lastTenantKey = "";
    const checkTenant = () => {
        const { tenant, auth } = store.getState();
        const current = tenant.currentTenant;
        if (!current || auth.slot.kind !== "store") {
            lastTenantKey = "";
            return;
        }
        const slug = clean(current.slug);
        const tenantId = clean(current.tenantId);
        if (!slug || !tenantId || slug !== auth.slot.slug) {
            return;
        }
        const key = `${slug}:${tenantId}:${auth.accessToken || ""}`;
        if (key === lastTenantKey) {
            return;
        }
        lastTenantKey = key;
        if (!auth.accessToken && adoptTenantIdSlot(slug, tenantId)) {
            store.dispatch(syncAuthSession());
            return;
        }
        if (auth.user && clean(auth.user.tenantId) !== tenantId) {
            store.dispatch(logout({ slot: auth.slot, ifToken: auth.accessToken || undefined }));
        }
    };
    store.subscribe(checkTenant);
    checkTenant();
}
