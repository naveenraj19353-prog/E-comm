import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
import { isStoreOwner } from "../../auth/roles";
import { useTenantByTenantId, useUpdateTenant } from "../hooks/useTenants";
import TenantLogoField from "../components/TenantLogoField";
import TenantCurrencyField from "../components/TenantCurrencyField";
import TenantStoreHoursField from "../components/TenantStoreHoursField";
import { emptyStoreHours, payloadStoreHours, type StoreHours } from "../../tenant/storeHours";
import { DISPLAY_CURRENCIES } from "../../../utils/currency";
import styles from "../styles/EditTenant.module.css";
import {
    GA4_ID_PATTERN,
    META_PIXEL_ID_PATTERN,
    readStoreAnalytics,
} from "../../seo/storeAnalytics";
import type { SubmitEvent } from "react";
import {
    BUSINESS_TYPE_OPTIONS,
    type BusinessType,
} from "../../../constants/businessTypes";
export default function EditTenant() {
    const { tenantId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { data: tenant, isLoading, isError, } = useTenantByTenantId(tenantId || "");
    if (user && user.role !== "super_admin" && !isStoreOwner(user.role)) {
        return <Navigate to={`/admin/tenants/${tenantId}`} replace />;
    }
    if (isLoading) {
        return (<div className={styles.state}>
        <div className={styles.spinner}/>
        <p>Loading tenant...</p>
      </div>);
    }
    if (isError || !tenant) {
        return (<div className={styles.state}>
        <h2>Tenant not found</h2>
        <p>Unable to load tenant information.</p>
        <button type="button" className={styles.secondaryButton} onClick={() => navigate("/admin/tenants")}>
          Back to Tenants
        </button>
      </div>);
    }
    return <EditTenantForm key={tenant._id} tenant={tenant}/>;
}
interface EditTenantFormProps {
    tenant: NonNullable<ReturnType<typeof useTenantByTenantId>["data"]>;
}
function EditTenantForm({ tenant }: EditTenantFormProps) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const updateTenantMutation = useUpdateTenant();
    const [name, setName] = useState(tenant.name || "");
    const [slug, setSlug] = useState(tenant.slug || "");
    const [logo, setLogo] = useState(tenant.logo || "");
    const [phone, setPhone] = useState(tenant.phone || "");
    const [theme, setTheme] = useState(tenant.theme || "green");
    const [displayCurrency, setDisplayCurrency] = useState(tenant.displayCurrency || "INR");
    const [inrPerUnit, setInrPerUnit] = useState(
        String(
            tenant.inrPerUnit
            || DISPLAY_CURRENCIES.find((item) => item.code === (tenant.displayCurrency || "INR"))?.inrPerUnit
            || 1,
        ),
    );
    const [businessType, setBusinessType] = useState<BusinessType>(
        tenant.businessType || "retail",
    );
    const [isActive, setIsActive] = useState(tenant.isActive ?? true);
    const [storeHours, setStoreHours] = useState<StoreHours>(
        tenant.storeHours || emptyStoreHours(),
    );
    const [ga4MeasurementId, setGa4MeasurementId] = useState(
        readStoreAnalytics(tenant).ga4MeasurementId || "",
    );
    const [metaPixelId, setMetaPixelId] = useState(
        readStoreAnalytics(tenant).metaPixelId || "",
    );
    const [error, setError] = useState("");
    const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError("");
        if (!name.trim()) {
            setError("Tenant name is required.");
            return;
        }
        if (!slug.trim()) {
            setError("Tenant slug is required.");
            return;
        }
        const cleanGa4 = ga4MeasurementId.trim().toUpperCase();
        const cleanPixel = metaPixelId.trim();
        if (cleanGa4 && !GA4_ID_PATTERN.test(cleanGa4)) {
            setError("GA4 measurement ID must look like G-XXXXXXXXXX.");
            return;
        }
        if (cleanPixel && !META_PIXEL_ID_PATTERN.test(cleanPixel)) {
            setError("Meta Pixel ID must be the numeric ID from Events Manager.");
            return;
        }
        // Empty strings clear an id on the server.
        const analyticsPayload = {
            analytics: { ga4MeasurementId: cleanGa4, metaPixelId: cleanPixel },
        };
        try {
            await updateTenantMutation.mutateAsync({
                id: tenant._id,
                payload: {
                    name: name.trim(),
                    slug: slug.trim(),
                    businessType,
                    logo: logo.trim(),
                    phone: phone.trim(),
                    theme,
                    displayCurrency,
                    inrPerUnit: Number(inrPerUnit) || undefined,
                    isActive,
                    storeHours: payloadStoreHours(storeHours),
                    ...analyticsPayload,
                },
            });
            navigate(`/admin/tenants/${tenant.tenantId}`);
        }
        catch (error: unknown) {
            console.error("Failed to update tenant:", error);
            setError("Failed to update tenant.");
        }
    };
    return (<div className={styles.page}>
      
      <div className={styles.header}>
        <div>
          <button type="button" className={styles.backButton} onClick={() => navigate(`/admin/tenants/${tenant.tenantId}`)}>
            ← Back to Tenant
          </button>
          <span className={styles.eyebrow}>{tenant.tenantId}</span>
          <h1>Edit Tenant</h1>
          <p>
            Update the configuration for <strong>{tenant.name}</strong>
          </p>
        </div>
      </div>
      
      <form className={styles.formCard} onSubmit={handleSubmit}>
        <div className={styles.formHeader}>
          <div>
            <h2>Tenant Information</h2>
            <p>Update the basic information and appearance of this tenant.</p>
          </div>
          <div className={`${styles.statusBadge} ${isActive ? styles.active : styles.inactive}`}>
            <span />
            {isActive ? "Active" : "Inactive"}
          </div>
        </div>
        <div className={styles.formBody}>
          
          <div className={styles.field}>
            <label>Tenant ID</label>
            <input type="text" value={tenant.tenantId} disabled/>
            <small>Tenant ID cannot be changed.</small>
          </div>
          
          <div className={styles.field}>
            <label htmlFor="tenant-name">
              Tenant Name
              <span>*</span>
            </label>
            <input id="tenant-name" type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter tenant name"/>
          </div>
          
          <div className={styles.field}>
            <label htmlFor="tenant-slug">
              Slug
              <span>*</span>
            </label>
            <input id="tenant-slug" type="text" value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/\s+/g, "-"))} placeholder="tenant-slug"/>
            <small>Store URL: /{slug || "tenant-slug"}</small>
          </div>
          
          <div className={styles.field}>
            <label htmlFor="tenant-phone">WhatsApp number</label>
            <input
              id="tenant-phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="9198XXXXXXXX"
            />
            <small>New customer orders are sent to this WhatsApp number.</small>
          </div>
          
          <TenantLogoField
              tenantId={tenant.tenantId}
              value={logo}
              onChange={setLogo}
              disabled={updateTenantMutation.isPending}
            />

          <TenantCurrencyField
              currency={displayCurrency}
              inrPerUnit={inrPerUnit}
              onCurrencyChange={setDisplayCurrency}
              onRateChange={setInrPerUnit}
            />
          
          <div className={styles.field}>
            <label htmlFor="tenant-business-type">
              Business type
              <span>*</span>
            </label>
            <select
              id="tenant-business-type"
              value={businessType}
              onChange={(event) => setBusinessType(event.target.value as BusinessType)}
            >
              {BUSINESS_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <small>Retail = products · Service = bookings · Menu = food ordering</small>
          </div>

          <div className={styles.field}>
            <label htmlFor="tenant-theme">Theme</label>
            <select id="tenant-theme" value={theme} onChange={(event) => setTheme(event.target.value)}>
              <option value="green">Green</option>
              <option value="blue">Blue</option>
              <option value="purple">Purple</option>
              <option value="orange">Orange</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          
          {/* Only the platform can switch a store on or off (the API refuses
              it from owners, who would lock themselves out). */}
          {user?.role === "super_admin" && (
          <div className={styles.statusSection}>
            <div>
              <h3>Tenant Status</h3>
              <p>Inactive stores are hidden from shoppers, and their owner, staff and customers can't sign in.</p>
            </div>
            <button type="button" className={`${styles.toggle} ${isActive ? styles.toggleActive : ""}`} onClick={() => setIsActive((value) => !value)} aria-label={isActive ? "Deactivate tenant" : "Activate tenant"}>
              <span />
            </button>
          </div>
          )}

          <div className={styles.field}>
            <label htmlFor="tenant-ga4">Google Analytics 4 measurement ID</label>
            <input
              id="tenant-ga4"
              type="text"
              value={ga4MeasurementId}
              onChange={(event) => setGa4MeasurementId(event.target.value)}
              placeholder="G-XXXXXXXXXX"
              autoComplete="off"
              spellCheck={false}
            />
            <small>
              Optional. Loaded on your storefront only. Page views are sent on every page change, so turn off
              "Page changes based on browser history events" under Enhanced measurement in GA4 to avoid double counting.
            </small>
          </div>

          <div className={styles.field}>
            <label htmlFor="tenant-meta-pixel">Meta Pixel ID</label>
            <input
              id="tenant-meta-pixel"
              type="text"
              inputMode="numeric"
              value={metaPixelId}
              onChange={(event) => setMetaPixelId(event.target.value.replace(/\s+/g, ""))}
              placeholder="123456789012345"
              autoComplete="off"
              spellCheck={false}
            />
            <small>
              Optional. Sends PageView and Purchase events from your storefront. If you sell to visitors in the EU/UK,
              you may need a cookie-consent banner before enabling tracking.
            </small>
          </div>

          <TenantStoreHoursField
            tenantId={tenant.tenantId}
            value={storeHours}
            onChange={setStoreHours}
            disabled={updateTenantMutation.isPending}
          />
          
          {error && <div className={styles.error}>{error}</div>}
        </div>
        
        <div className={styles.formFooter}>
          <button type="button" className={styles.cancelButton} onClick={() => navigate(`/admin/tenants/${tenant.tenantId}`)} disabled={updateTenantMutation.isPending}>
            Cancel
          </button>
          <button type="submit" className={styles.saveButton} disabled={updateTenantMutation.isPending}>
            {updateTenantMutation.isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>);
}
