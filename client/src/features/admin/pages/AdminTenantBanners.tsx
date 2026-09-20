import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import {
  createBanner,
  deleteBanner,
  getBanners,
  updateBanner,
  type BannerRecord,
} from "../api/banner.api";
import { uploadImageToS3 } from "../api/upload.api";
import { extractS3ObjectKey } from "../utils/s3Image";
import { BANNER_MEDIA_ACCEPT, isBannerVideoSrc } from "../../../components/Banner/bannerMedia";
import PageLoader from "../../../components/PageLoader";
import styles from "../styles/AdminTenantBanners.module.css";

type BannerForm = {
  title: string;
  subtitle: string;
  description: string;
  imageKey: string;
  imagePreview: string;
  mobileImageKey: string;
  mobileImagePreview: string;
  buttonText: string;
  link: string;
  priority: number;
  isActive: boolean;
};

const emptyForm = (): BannerForm => ({
  title: "",
  subtitle: "",
  description: "",
  imageKey: "",
  imagePreview: "",
  mobileImageKey: "",
  mobileImagePreview: "",
  buttonText: "Shop Now",
  link: "",
  priority: 0,
  isActive: true,
});

function toForm(banner: BannerRecord): BannerForm {
  const imageKey = extractS3ObjectKey(banner.image) || "";
  const mobileKey = banner.mobileImage
    ? extractS3ObjectKey(banner.mobileImage) || ""
    : "";
  return {
    title: banner.title || "",
    subtitle: banner.subtitle || "",
    description: banner.description || "",
    imageKey: imageKey || (banner.image?.startsWith("http") ? banner.image : ""),
    imagePreview: banner.image || "",
    mobileImageKey:
      mobileKey ||
      (banner.mobileImage?.startsWith("http") ? banner.mobileImage : ""),
    mobileImagePreview: banner.mobileImage || "",
    buttonText: banner.buttonText || "Shop Now",
    link: banner.link || "",
    priority: Number(banner.priority ?? 0),
    isActive: banner.isActive !== false,
  };
}

export default function AdminTenantBanners() {
  const { tenantId = "" } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"desktop" | "mobile" | null>(null);
  const [banners, setBanners] = useState<BannerRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BannerForm>(emptyForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadBanners = async () => {
    const data = await getBanners(tenantId);
    setBanners(data);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError("");
        await loadBanners();
      } catch (err) {
        if (!cancelled) {
          setError(
            axios.isAxiosError(err)
              ? String(err.response?.data?.detail || "Failed to load banners.")
              : "Failed to load banners.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const updateField = <K extends keyof BannerForm>(key: K, value: BannerForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const handleUpload = async (
    file: File | undefined,
    target: "desktop" | "mobile",
  ) => {
    if (!file || !tenantId) return;
    setError("");
    setUploading(target);
    try {
      const uploaded = await uploadImageToS3(file, tenantId, "banners");
      if (target === "desktop") {
        setForm((current) => ({
          ...current,
          imageKey: uploaded.key,
          imagePreview: uploaded.url,
        }));
      } else {
        setForm((current) => ({
          ...current,
          mobileImageKey: uploaded.key,
          mobileImagePreview: uploaded.url,
        }));
      }
    } catch (err) {
      setError(
        axios.isAxiosError(err)
          ? String(err.response?.data?.detail || "Upload failed.")
          : "Upload failed.",
      );
    } finally {
      setUploading(null);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!form.imageKey.trim()) {
      setError("Upload a banner image or video.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || undefined,
        description: form.description.trim() || undefined,
        image: form.imageKey.trim(),
        mobileImage: form.mobileImageKey.trim() || undefined,
        mediaType: isBannerVideoSrc(form.imageKey) ? ("video" as const) : ("image" as const),
        buttonText: form.buttonText.trim() || "Shop Now",
        link: form.link.trim() || undefined,
        priority: Number(form.priority) || 0,
        isActive: form.isActive,
      };

      if (editingId) {
        await updateBanner(editingId, payload);
        setSuccess("Banner updated.");
      } else {
        await createBanner({ ...payload, tenantId });
        setSuccess("Banner created.");
      }
      resetForm();
      await loadBanners();
    } catch (err) {
      setError(
        axios.isAxiosError(err)
          ? String(err.response?.data?.detail || "Failed to save banner.")
          : "Failed to save banner.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (banner: BannerRecord) => {
    setEditingId(banner._id);
    setForm(toForm(banner));
    setSuccess("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (bannerId: string) => {
    if (!window.confirm("Delete this banner?")) return;
    setError("");
    try {
      await deleteBanner(bannerId);
      if (editingId === bannerId) resetForm();
      setSuccess("Banner deleted.");
      await loadBanners();
    } catch (err) {
      setError(
        axios.isAxiosError(err)
          ? String(err.response?.data?.detail || "Failed to delete banner.")
          : "Failed to delete banner.",
      );
    }
  };

  const handleToggleActive = async (banner: BannerRecord) => {
    try {
      await updateBanner(banner._id, { isActive: !banner.isActive });
      await loadBanners();
    } catch (err) {
      setError(
        axios.isAxiosError(err)
          ? String(err.response?.data?.detail || "Failed to update banner.")
          : "Failed to update banner.",
      );
    }
  };

  if (loading) {
    return <PageLoader message="Loading banners..." />;
  }

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
          <span className={styles.eyebrow}>STOREFRONT</span>
          <h1>Home banners</h1>
          <p>
            Upload hero images or videos and copy for the storefront slider. Lower priority
            numbers appear first.
          </p>
        </div>
        {editingId && (
          <button type="button" className={styles.secondaryButton} onClick={resetForm}>
            New banner
          </button>
        )}
      </header>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <div className={styles.layout}>
        <form className={styles.card} onSubmit={handleSubmit}>
          <h2>{editingId ? "Edit banner" : "Add banner"}</h2>
          <p className={styles.help}>
            Desktop media is required. Use an image or a short muted video (MP4/WebM, up to
            50 MB). Mobile media is optional and used under 768px.
          </p>

          <div className={styles.formGrid}>
            <label className={styles.full}>
              Title
              <input
                value={form.title}
                onChange={(e) => updateField("title", e.target.value)}
                placeholder="Summer collection"
                required
              />
            </label>
            <label className={styles.full}>
              Subtitle
              <input
                value={form.subtitle}
                onChange={(e) => updateField("subtitle", e.target.value)}
                placeholder="New arrivals"
              />
            </label>
            <label className={styles.full}>
              Description
              <textarea
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
                placeholder="Short supporting line for the hero"
              />
            </label>
            <label>
              Button text
              <input
                value={form.buttonText}
                onChange={(e) => updateField("buttonText", e.target.value)}
                placeholder="Shop Now"
              />
            </label>
            <label>
              Button link
              <input
                value={form.link}
                onChange={(e) => updateField("link", e.target.value)}
                placeholder="/products or full URL"
              />
            </label>
            <label>
              Priority
              <input
                type="number"
                value={form.priority}
                onChange={(e) => updateField("priority", Number(e.target.value) || 0)}
              />
            </label>
            <label className={styles.toggleRow}>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => updateField("isActive", e.target.checked)}
              />
              Active on storefront
            </label>

            <div className={`${styles.full} ${styles.uploadBox}`}>
              <strong>Desktop / tablet image or video</strong>
              <input
                type="file"
                accept={BANNER_MEDIA_ACCEPT}
                onChange={(e) => handleUpload(e.target.files?.[0], "desktop")}
                disabled={uploading !== null}
              />
              {uploading === "desktop" && (
                <div className={styles.uploadOverlay} role="status" aria-live="polite">
                  <span className={styles.uploadSpinner} />
                  Uploading…
                </div>
              )}
              {form.imagePreview &&
                (isBannerVideoSrc(form.imageKey || form.imagePreview) ? (
                  <video
                    src={form.imagePreview}
                    className={styles.preview}
                    muted
                    controls
                    playsInline
                  />
                ) : (
                  <img src={form.imagePreview} alt="Banner preview" className={styles.preview} />
                ))}
            </div>

            <div className={`${styles.full} ${styles.uploadBox}`}>
              <strong>Mobile image or video (optional)</strong>
              <input
                type="file"
                accept={BANNER_MEDIA_ACCEPT}
                onChange={(e) => handleUpload(e.target.files?.[0], "mobile")}
                disabled={uploading !== null}
              />
              {uploading === "mobile" && (
                <div className={styles.uploadOverlay} role="status" aria-live="polite">
                  <span className={styles.uploadSpinner} />
                  Uploading…
                </div>
              )}
              {form.mobileImagePreview &&
                (isBannerVideoSrc(form.mobileImageKey || form.mobileImagePreview) ? (
                  <video
                    src={form.mobileImagePreview}
                    className={styles.preview}
                    muted
                    controls
                    playsInline
                  />
                ) : (
                  <img
                    src={form.mobileImagePreview}
                    alt="Mobile banner preview"
                    className={styles.preview}
                  />
                ))}
            </div>
          </div>

          <div className={styles.formActions}>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={saving || uploading !== null}
            >
              {saving ? "Saving…" : editingId ? "Update banner" : "Create banner"}
            </button>
            {editingId && (
              <button type="button" className={styles.secondaryButton} onClick={resetForm}>
                Cancel edit
              </button>
            )}
          </div>
        </form>

        <section className={styles.card}>
          <h2>Current banners</h2>
          <p className={styles.help}>{banners.length} banner(s) for this store.</p>

          {banners.length === 0 ? (
            <div className={styles.empty}>No banners yet. Create your first hero slide.</div>
          ) : (
            <div className={styles.list}>
              {banners.map((banner) => (
                <article key={banner._id} className={styles.bannerItem}>
                  {banner.image ? (
                    isBannerVideoSrc(banner.image, banner.mediaType) ? (
                      <video
                        src={banner.image}
                        className={styles.thumb}
                        muted
                        playsInline
                      />
                    ) : (
                      <img src={banner.image} alt={banner.title} className={styles.thumb} />
                    )
                  ) : (
                    <div className={styles.thumb} />
                  )}
                  <div className={styles.bannerMeta}>
                    <strong>{banner.title}</strong>
                    {banner.subtitle && <p>{banner.subtitle}</p>}
                    <div className={styles.badgeRow}>
                      <span
                        className={
                          banner.isActive ? styles.badge : `${styles.badge} ${styles.badgeMuted}`
                        }
                      >
                        {banner.isActive ? "Active" : "Hidden"}
                      </span>
                      <span className={`${styles.badge} ${styles.badgeMuted}`}>
                        Priority {banner.priority ?? 0}
                      </span>
                      {isBannerVideoSrc(banner.image, banner.mediaType) && (
                        <span className={`${styles.badge} ${styles.badgeMuted}`}>Video</span>
                      )}
                    </div>
                    <div className={styles.itemActions}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => handleEdit(banner)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => handleToggleActive(banner)}
                      >
                        {banner.isActive ? "Hide" : "Show"}
                      </button>
                      <button
                        type="button"
                        className={styles.dangerButton}
                        onClick={() => handleDelete(banner._id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
