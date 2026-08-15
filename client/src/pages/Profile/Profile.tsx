import { useState } from "react";
import {
  User,
  Mail,
  Phone,
  ShieldCheck,
  MapPin,
  Package,
  Heart,
  Pencil,
  LogOut,
} from "lucide-react";
import { useProfile } from "../../features/profile/hooks/useProfile";
import styles from "./Profile.module.css";
import EditProfileModal from "./EditProfileModal";
import { useAuth } from "../../features/auth/hooks/useAuth";
const Profile = () => {
  const user = useAuth().user;
  const { profile, isLoading, isError, updateProfile, isUpdating } = useProfile(
    user?.tenantId,
    user?._id,
  );
  const [editOpen, setEditOpen] = useState(false);
  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.loading}>Loading profile...</div>
        </div>
      </div>
    );
  }
  if (isError || !profile) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.error}>Unable to load profile.</div>
        </div>
      </div>
    );
  }
  const initial = profile.name?.charAt(0)?.toUpperCase() || "U";
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        
        
        
        <div className={styles.pageHeader}>
          <div>
            <h1>My Profile</h1>
            <p>Manage your personal information and account settings.</p>
          </div>
        </div>
        
        
        
        <section className={styles.profileHero}>
          <div className={styles.avatar}>{initial}</div>
          <div className={styles.heroInfo}>
            <h2>{profile.name}</h2>
            <p>{profile.email}</p>
            <span className={styles.activeBadge}>
              <span />
              Active account
            </span>
          </div>
          <button
            className={styles.editButton}
            onClick={() => setEditOpen(true)}
          >
            <Pencil size={16} />
            Edit Profile
          </button>
        </section>
        
        
        
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h3>Personal Information</h3>
              <p>Your basic account information.</p>
            </div>
            <User size={20} />
          </div>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <div className={styles.icon}>
                <User size={18} />
              </div>
              <div>
                <span>Full Name</span>
                <strong>{profile.name || "Not provided"}</strong>
              </div>
            </div>
            <div className={styles.infoItem}>
              <div className={styles.icon}>
                <Mail size={18} />
              </div>
              <div>
                <span>Email</span>
                <strong>{profile.email}</strong>
              </div>
            </div>
            <div className={styles.infoItem}>
              <div className={styles.icon}>
                <Phone size={18} />
              </div>
              <div>
                <span>Phone</span>
                <strong>{profile.phone || "Not provided"}</strong>
              </div>
            </div>
            <div className={styles.infoItem}>
              <div className={styles.icon}>
                <ShieldCheck size={18} />
              </div>
              <div>
                <span>Account Status</span>
                <strong>{profile.isActive ? "Active" : "Inactive"}</strong>
              </div>
            </div>
          </div>
        </section>
        
        
        
        <section className={styles.quickGrid}>
          <button className={styles.quickCard}>
            <div className={styles.quickIcon}>
              <Package size={22} />
            </div>
            <div>
              <strong>My Orders</strong>
              <span>View your orders</span>
            </div>
          </button>
          <button className={styles.quickCard}>
            <div className={styles.quickIcon}>
              <MapPin size={22} />
            </div>
            <div>
              <strong>Addresses</strong>
              <span>Manage delivery addresses</span>
            </div>
          </button>
          <button className={styles.quickCard}>
            <div className={styles.quickIcon}>
              <Heart size={22} />
            </div>
            <div>
              <strong>Wishlist</strong>
              <span>View saved products</span>
            </div>
          </button>
          <button className={styles.quickCard}>
            <div className={styles.quickIcon}>
              <ShieldCheck size={22} />
            </div>
            <div>
              <strong>Security</strong>
              <span>Password & security</span>
            </div>
          </button>
        </section>
        
        
        
        <button className={styles.logoutButton}>
          <LogOut size={17} />
          Sign Out
        </button>
      </div>
      
      
      
      {editOpen && (
        <EditProfileModal
          profile={profile}
          isUpdating={isUpdating}
          onClose={() => setEditOpen(false)}
          onSubmit={async (data) => {
            await updateProfile(data);
            setEditOpen(false);
          }}
        />
      )}
    </div>
  );
};
export default Profile;
