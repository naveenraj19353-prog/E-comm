import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import AuthModal from "../../components/Auth/AuthModal/AuthModal";
import { useStorefrontTenant } from "./useTenant";

type OpenLoginOptions = {
  onSuccess?: () => void;
};

type StorefrontAuthModalContextValue = {
  openLogin: (options?: OpenLoginOptions) => void;
  closeLogin: () => void;
  isOpen: boolean;
};

const StorefrontAuthModalContext =
  createContext<StorefrontAuthModalContextValue | null>(null);

function resolveTenantId(storeTenantId: string): string {
  if (storeTenantId) {
    return storeTenantId;
  }
  if (typeof window === "undefined") {
    return "";
  }
  return localStorage.getItem("ecommerce_tenantId") || "";
}

export function StorefrontAuthModalProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { tenantId, tenant } = useStorefrontTenant();
  const [isOpen, setIsOpen] = useState(false);
  const onSuccessRef = useRef<(() => void) | null>(null);
  const resolvedTenantId =
    resolveTenantId(tenantId) ||
    (tenant?._id ? String(tenant._id) : "") ||
    "";

  const closeLogin = useCallback(() => {
    setIsOpen(false);
    onSuccessRef.current = null;
  }, []);

  const openLogin = useCallback((options?: OpenLoginOptions) => {
    onSuccessRef.current = options?.onSuccess ?? null;
    setIsOpen(true);
  }, []);

  const handleSuccess = useCallback(() => {
    const callback = onSuccessRef.current;
    onSuccessRef.current = null;
    setIsOpen(false);
    callback?.();
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeLogin();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeLogin, isOpen]);

  const value = useMemo(
    () => ({
      openLogin,
      closeLogin,
      isOpen,
    }),
    [openLogin, closeLogin, isOpen],
  );

  return (
    <StorefrontAuthModalContext.Provider value={value}>
      {children}
      {isOpen ? (
        <AuthModal
          tenantId={resolvedTenantId}
          onClose={closeLogin}
          onSuccess={handleSuccess}
        />
      ) : null}
    </StorefrontAuthModalContext.Provider>
  );
}

export function useStorefrontAuthModal(): StorefrontAuthModalContextValue | null {
  return useContext(StorefrontAuthModalContext);
}
