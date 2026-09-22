import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
import {
    STORE_PERMISSIONS,
    defaultNewManagerPermissions,
    type StorePermissionMap,
} from "../../auth/permissions";
import { isStoreOwner } from "../../auth/roles";
import {
    createStoreManager,
    deleteStoreManager,
    listStoreManagers,
    updateStoreManager,
    type StoreManager,
} from "../api/storeManager.api";
import styles from "../styles/CreateTenant.module.css";
import tableStyles from "../styles/AdminCustomers.module.css";

import { getApiErrorMessage } from "../utils/tenantForm.utils";

function toPermissionMap(raw?: Record<string, boolean> | null): StorePermissionMap {
    const next = defaultNewManagerPermissions();
    if (!raw) {
        return next;
    }
    for (const item of STORE_PERMISSIONS) {
        next[item.key] = Boolean(raw[item.key]);
    }
    return next;
}

function PermissionChecks({
    value,
    onChange,
    idPrefix,
}: {
    value: StorePermissionMap;
    onChange: (next: StorePermissionMap) => void;
    idPrefix: string;
}) {
    return (
        <div className={styles.permissionGrid}>
            {STORE_PERMISSIONS.map((item) => (
                <label key={item.key} className={styles.permissionItem} htmlFor={`${idPrefix}-${item.key}`}>
                    <input
                        id={`${idPrefix}-${item.key}`}
                        type="checkbox"
                        checked={value[item.key]}
                        onChange={(event) =>
                            onChange({
                                ...value,
                                [item.key]: event.target.checked,
                            })
                        }
                    />
                    {item.label}
                </label>
            ))}
        </div>
    );
}

export default function AdminStoreManagers() {
    const { tenantId = "" } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const canManage = user?.role === "super_admin" || isStoreOwner(user?.role);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [permissions, setPermissions] = useState<StorePermissionMap>(
        defaultNewManagerPermissions,
    );
    const [rowPermissions, setRowPermissions] = useState<Record<string, StorePermissionMap>>({});
    const [error, setError] = useState("");

    const managersQuery = useQuery({
        queryKey: ["admin", "store-managers", tenantId],
        queryFn: () => listStoreManagers(tenantId),
        enabled: Boolean(tenantId),
    });

    const createMutation = useMutation({
        mutationFn: createStoreManager,
        onSuccess: () => {
            setName("");
            setEmail("");
            setPhone("");
            setPassword("");
            setPermissions(defaultNewManagerPermissions());
            setError("");
            void queryClient.invalidateQueries({
                queryKey: ["admin", "store-managers", tenantId],
            });
        },
        onError: (err) => setError(getApiErrorMessage(err, "Unable to save store manager.")),
    });

    const updateMutation = useMutation({
        mutationFn: updateStoreManager,
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: ["admin", "store-managers", tenantId],
            });
        },
        onError: (err) => setError(getApiErrorMessage(err, "Unable to update permissions.")),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => deleteStoreManager(id, tenantId),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: ["admin", "store-managers", tenantId],
            });
        },
    });

    if (!canManage) {
        return <Navigate to={`/admin/tenants/${tenantId}`} replace />;
    }

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError("");
        if (name.trim().length < 2) {
            setError("Enter the manager's name.");
            return;
        }
        if (!email.trim().includes("@")) {
            setError("Enter a valid email.");
            return;
        }
        if (password.length < 6) {
            setError("Password must be at least 6 characters.");
            return;
        }
        createMutation.mutate({
            tenantId,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim() || undefined,
            password,
            permissions,
        });
    };

    const managers = managersQuery.data || [];
    const grantAll = (target: StorePermissionMap, granted: boolean): StorePermissionMap => {
        const next = { ...target };
        for (const item of STORE_PERMISSIONS) {
            next[item.key] = granted;
        }
        if (!granted) {
            next.read = true;
        }
        return next;
    };
    const currentRowPermissions = (manager: StoreManager): StorePermissionMap =>
        rowPermissions[manager._id] || toPermissionMap(manager.permissions);

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <button
                    type="button"
                    className={styles.backButton}
                    onClick={() => navigate(`/admin/tenants/${tenantId}`)}
                >
                    ← Back
                </button>
                <span className={styles.eyebrow}>TEAM</span>
                <h1>Store managers</h1>
                <p>
                    Choose what each manager can do. Unchecked items stay hidden and blocked.
                    Existing managers keep full access until you save a new set.
                    After you save, ask that manager to log in again.
                </p>
            </header>

            <form className={styles.formCard} onSubmit={handleSubmit}>
                <div className={styles.formBody}>
                <div className={styles.field}>
                    <label htmlFor="manager-name">
                        Name<span>*</span>
                    </label>
                    <input
                        id="manager-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        autoComplete="name"
                    />
                </div>
                <div className={styles.field}>
                    <label htmlFor="manager-email">
                        Email<span>*</span>
                    </label>
                    <input
                        id="manager-email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        autoComplete="username"
                    />
                </div>
                <div className={styles.field}>
                    <label htmlFor="manager-phone">Phone (optional)</label>
                    <input
                        id="manager-phone"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        autoComplete="tel"
                    />
                </div>
                <div className={styles.field}>
                    <label htmlFor="manager-password">
                        Password<span>*</span>
                    </label>
                    <input
                        id="manager-password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="new-password"
                    />
                </div>
                <div className={styles.permissionBlock}>
                    <p className={styles.permissionHint}>
                        Permissions. New managers start with read only. Check inventory,
                        orders, product update, coupons, and anything else they need.
                    </p>
                    <PermissionChecks
                        idPrefix="create"
                        value={permissions}
                        onChange={setPermissions}
                    />
                    <div className={styles.permissionActions}>
                        <button
                            type="button"
                            className={styles.backButton}
                            onClick={() => setPermissions(grantAll(permissions, true))}
                        >
                            Allow all
                        </button>
                        <button
                            type="button"
                            className={styles.backButton}
                            onClick={() => setPermissions(grantAll(permissions, false))}
                        >
                            Read only
                        </button>
                    </div>
                </div>
                {error ? <p className={styles.error}>{error}</p> : null}
                </div>
                <div className={styles.formFooter}>
                <button
                    type="submit"
                    className={styles.saveButton}
                    disabled={createMutation.isPending}
                >
                    {createMutation.isPending ? "Adding..." : "Add store manager"}
                </button>
                </div>
            </form>

            {managersQuery.isLoading ? (
                <div className={tableStyles.state}>Loading managers...</div>
            ) : managersQuery.isError ? (
                <div className={tableStyles.state}>
                    {getApiErrorMessage(
                        managersQuery.error,
                        "Unable to load store managers.",
                    )}
                </div>
            ) : managers.length === 0 ? (
                <div className={tableStyles.state}>No store managers yet.</div>
            ) : (
                <div className={tableStyles.tableWrap} style={{ marginTop: "1.5rem" }}>
                    <table className={tableStyles.table}>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Permissions</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {managers.map((manager) => (
                                <tr key={manager._id}>
                                    <td>{manager.name}</td>
                                    <td>{manager.email}</td>
                                    <td className={styles.tablePermissions}>
                                        <PermissionChecks
                                            idPrefix={manager._id}
                                            value={currentRowPermissions(manager)}
                                            onChange={(next) =>
                                                setRowPermissions((prev) => ({
                                                    ...prev,
                                                    [manager._id]: next,
                                                }))
                                            }
                                        />
                                        <div className={styles.permissionActions}>
                                            <button
                                                type="button"
                                                className={styles.saveButton}
                                                disabled={updateMutation.isPending}
                                                onClick={() =>
                                                    updateMutation.mutate({
                                                        id: manager._id,
                                                        tenantId,
                                                        permissions: currentRowPermissions(manager),
                                                    })
                                                }
                                            >
                                                Save permissions
                                            </button>
                                        </div>
                                    </td>
                                    <td>
                                        <button
                                            type="button"
                                            className={styles.backButton}
                                            disabled={deleteMutation.isPending}
                                            onClick={() => deleteMutation.mutate(manager._id)}
                                        >
                                            Remove
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
