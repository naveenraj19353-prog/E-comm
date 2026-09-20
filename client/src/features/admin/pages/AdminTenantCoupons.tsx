import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import {
  createCoupon,
  listCoupons,
  updateCoupon,
  type CouponOfferType,
  type CouponRecord,
} from "../api/coupon.api";
import { useProducts } from "../hooks/useTenantProducts";
import PageLoader from "../../../components/PageLoader";
import styles from "../styles/AdminTenantBanners.module.css";

type CouponForm = {
  code: string;
  description: string;
  discountType: "percentage" | "fixed";
  discountValue: string;
  minimumOrderAmount: string;
  maximumDiscount: string;
  usageLimit: string;
  startDate: string;
  endDate: string;
  offerType: CouponOfferType;
  productId: string;
  festivalTitle: string;
  festivalMessage: string;
  isActive: boolean;
};

const OFFER_OPTIONS: Array<{ id: CouponOfferType; label: string; help: string }> = [
  { id: "general", label: "General", help: "Anyone can use this while it is active." },
  { id: "first_order", label: "First order", help: "Only for a customer’s first order." },
  { id: "product", label: "Particular product", help: "Discount applies only to one product." },
  { id: "festival", label: "Festival offer", help: "Show a message on the storefront template." },
];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toLocalInput(iso?: string) {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultEnd() {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return toLocalInput(date.toISOString());
}

const emptyForm = (): CouponForm => ({
  code: "",
  description: "",
  discountType: "percentage",
  discountValue: "10",
  minimumOrderAmount: "0",
  maximumDiscount: "0",
  usageLimit: "0",
  startDate: toLocalInput(),
  endDate: defaultEnd(),
  offerType: "general",
  productId: "",
  festivalTitle: "",
  festivalMessage: "",
  isActive: true,
});

function toForm(coupon: CouponRecord): CouponForm {
  return {
    code: coupon.code || "",
    description: coupon.description || "",
    discountType: coupon.discountType === "fixed" ? "fixed" : "percentage",
    discountValue: String(coupon.discountValue ?? 0),
    minimumOrderAmount: String(coupon.minimumOrderAmount ?? 0),
    maximumDiscount: String(coupon.maximumDiscount ?? 0),
    usageLimit: String(coupon.usageLimit ?? 0),
    startDate: toLocalInput(coupon.startDate),
    endDate: toLocalInput(coupon.endDate),
    offerType: coupon.offerType || "general",
    productId: coupon.productId || "",
    festivalTitle: coupon.festivalTitle || "",
    festivalMessage: coupon.festivalMessage || "",
    isActive: coupon.isActive !== false,
  };
}

function offerLabel(type?: CouponOfferType) {
  return OFFER_OPTIONS.find((option) => option.id === type)?.label || "General";
}

export default function AdminTenantCoupons() {
  const { tenantId = "" } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [coupons, setCoupons] = useState<CouponRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CouponForm>(emptyForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const productsQuery = useProducts({ tenantId, limit: 100, includeInactive: false });
  const products = useMemo(
    () => productsQuery.data?.pages.flatMap((page) => page.data || []) ?? [],
    [productsQuery.data],
  );

  const loadCoupons = async () => {
    const data = await listCoupons(tenantId);
    setCoupons(data);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        await loadCoupons();
      } catch (err) {
        if (!cancelled) {
          setError(
            axios.isAxiosError(err)
              ? String(err.response?.data?.detail || "Failed to load coupons.")
              : "Failed to load coupons.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const updateField = <K extends keyof CouponForm>(key: K, value: CouponForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    const discountValue = Number(form.discountValue);
    if (!form.code.trim() || !Number.isFinite(discountValue) || discountValue <= 0) {
      setError("Enter a coupon code and a discount greater than 0.");
      return;
    }
    if (form.offerType === "product" && !form.productId) {
      setError("Select the product this coupon applies to.");
      return;
    }
    if (form.offerType === "festival" && !form.festivalMessage.trim()) {
      setError("Add a festival message to show on the storefront.");
      return;
    }
    const payload = {
      tenantId,
      code: form.code.trim().toUpperCase(),
      description: form.description.trim(),
      discountType: form.discountType,
      discountValue,
      minimumOrderAmount: Number(form.minimumOrderAmount) || 0,
      maximumDiscount: Number(form.maximumDiscount) || 0,
      usageLimit: Number(form.usageLimit) || 0,
      startDate: new Date(form.startDate).toISOString(),
      endDate: new Date(form.endDate).toISOString(),
      offerType: form.offerType,
      productId: form.offerType === "product" ? form.productId : null,
      festivalTitle: form.offerType === "festival" ? form.festivalTitle.trim() : "",
      festivalMessage: form.offerType === "festival" ? form.festivalMessage.trim() : "",
      isActive: form.isActive,
    };
    try {
      setSaving(true);
      if (editingId) {
        await updateCoupon(editingId, payload);
        setSuccess("Coupon updated.");
      } else {
        await createCoupon(payload);
        setSuccess("Coupon created.");
      }
      resetForm();
      await loadCoupons();
    } catch (err) {
      setError(
        axios.isAxiosError(err)
          ? String(err.response?.data?.detail || "Failed to save coupon.")
          : "Failed to save coupon.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (coupon: CouponRecord) => {
    setEditingId(coupon._id);
    setForm(toForm(coupon));
    setError("");
    setSuccess("");
  };

  const handleToggleActive = async (coupon: CouponRecord) => {
    try {
      await updateCoupon(coupon._id, {
        tenantId,
        isActive: coupon.isActive === false,
      });
      await loadCoupons();
    } catch (err) {
      setError(
        axios.isAxiosError(err)
          ? String(err.response?.data?.detail || "Failed to update coupon.")
          : "Failed to update coupon.",
      );
    }
  };

  if (loading) {
    return <PageLoader message="Loading coupons..." />;
  }

  const offerHelp = OFFER_OPTIONS.find((option) => option.id === form.offerType)?.help;

  return (
    <div className={styles.page}>
      <button
        type="button"
        className={styles.backButton}
        onClick={() => navigate(`/admin/tenants/${tenantId}`)}
      >
        ← Back to store
      </button>

      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>OFFERS</span>
          <h1>Coupons</h1>
          <p>
            Create first-order, product, or festival coupons. Festival copy shows on the
            storefront home template.
          </p>
        </div>
        {editingId && (
          <button type="button" className={styles.secondaryButton} onClick={resetForm}>
            New coupon
          </button>
        )}
      </header>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <div className={styles.layout}>
        <form className={styles.card} onSubmit={handleSubmit}>
          <h2>{editingId ? "Edit coupon" : "Add coupon"}</h2>
          <p className={styles.help}>{offerHelp}</p>

          <div className={styles.formGrid}>
            <label>
              Code
              <input
                value={form.code}
                onChange={(event) => updateField("code", event.target.value.toUpperCase())}
                placeholder="DIWALI20"
                required
                disabled={Boolean(editingId)}
              />
            </label>
            <label>
              Offer type
              <select
                value={form.offerType}
                onChange={(event) =>
                  updateField("offerType", event.target.value as CouponOfferType)
                }
              >
                {OFFER_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.full}>
              Description
              <input
                value={form.description}
                onChange={(event) => updateField("description", event.target.value)}
                placeholder="Short internal note"
              />
            </label>
            <label>
              Discount type
              <select
                value={form.discountType}
                onChange={(event) =>
                  updateField(
                    "discountType",
                    event.target.value as CouponForm["discountType"],
                  )
                }
              >
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed amount</option>
              </select>
            </label>
            <label>
              Discount value
              <input
                type="number"
                min={0.01}
                step="0.01"
                value={form.discountValue}
                onChange={(event) => updateField("discountValue", event.target.value)}
                required
              />
            </label>
            <label>
              Min. order (₹)
              <input
                type="number"
                min={0}
                value={form.minimumOrderAmount}
                onChange={(event) => updateField("minimumOrderAmount", event.target.value)}
              />
            </label>
            <label>
              Max discount (₹)
              <input
                type="number"
                min={0}
                value={form.maximumDiscount}
                onChange={(event) => updateField("maximumDiscount", event.target.value)}
              />
            </label>
            <label>
              Usage limit
              <input
                type="number"
                min={0}
                value={form.usageLimit}
                onChange={(event) => updateField("usageLimit", event.target.value)}
              />
            </label>
            <label>
              Starts
              <input
                type="datetime-local"
                value={form.startDate}
                onChange={(event) => updateField("startDate", event.target.value)}
                required
              />
            </label>
            <label>
              Ends
              <input
                type="datetime-local"
                value={form.endDate}
                onChange={(event) => updateField("endDate", event.target.value)}
                required
              />
            </label>

            {form.offerType === "product" ? (
              <label className={styles.full}>
                Product
                <select
                  value={form.productId}
                  onChange={(event) => updateField("productId", event.target.value)}
                  required
                >
                  <option value="">Select a product</option>
                  {products.map((product) => (
                    <option key={product._id} value={product._id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {form.offerType === "festival" ? (
              <>
                <label className={styles.full}>
                  Festival title
                  <input
                    value={form.festivalTitle}
                    onChange={(event) => updateField("festivalTitle", event.target.value)}
                    placeholder="Diwali Special"
                  />
                </label>
                <label className={styles.full}>
                  Festival message
                  <textarea
                    value={form.festivalMessage}
                    onChange={(event) => updateField("festivalMessage", event.target.value)}
                    placeholder="Celebrate Diwali with 20% off. Use code DIWALI20 at checkout."
                    required
                  />
                </label>
              </>
            ) : null}

            <label className={styles.toggleRow}>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => updateField("isActive", event.target.checked)}
              />
              Active
            </label>
          </div>

          <div className={styles.formActions}>
            <button type="submit" className={styles.primaryButton} disabled={saving}>
              {saving ? "Saving…" : editingId ? "Update coupon" : "Create coupon"}
            </button>
          </div>
        </form>

        <div className={styles.card}>
          <h2>Current coupons</h2>
          <p className={styles.help}>{coupons.length} coupon(s) for this store.</p>
          {coupons.length === 0 ? (
            <div className={styles.empty}>No coupons yet. Create your first offer.</div>
          ) : (
            <div className={styles.list}>
              {coupons.map((coupon) => (
                <div key={coupon._id} className={styles.bannerItem} style={{ gridTemplateColumns: "1fr" }}>
                  <div className={styles.bannerMeta}>
                    <strong>{coupon.code}</strong>
                    <p>
                      {coupon.discountType === "percentage"
                        ? `${coupon.discountValue}% off`
                        : `₹${coupon.discountValue} off`}
                      {coupon.description ? ` · ${coupon.description}` : ""}
                    </p>
                    {coupon.offerType === "festival" && coupon.festivalMessage ? (
                      <p>{coupon.festivalMessage}</p>
                    ) : null}
                    <div className={styles.badgeRow}>
                      <span className={styles.badge}>{offerLabel(coupon.offerType)}</span>
                      <span className={coupon.isActive === false ? styles.badgeMuted : styles.badge}>
                        {coupon.isActive === false ? "Inactive" : "Active"}
                      </span>
                    </div>
                    <div className={styles.itemActions}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => handleEdit(coupon)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => handleToggleActive(coupon)}
                      >
                        {coupon.isActive === false ? "Activate" : "Deactivate"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
