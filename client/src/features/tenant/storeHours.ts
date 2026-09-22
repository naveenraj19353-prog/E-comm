export type StoreHoursKind = "on" | "off";

export type StoreHoursWindow = {
    kind: StoreHoursKind;
    startAt: string;
    endAt: string;
};

export type StoreHours = {
    enabled?: boolean;
    defaultOpen?: boolean;
    message?: string;
    images?: string[];
    windows?: StoreHoursWindow[];
    isOpen?: boolean;
    nextChangeAt?: string | null;
};

const MAX_WINDOWS = 20;
const MAX_IMAGES = 5;

export function emptyStoreHours(): StoreHours {
    return {
        enabled: false,
        defaultOpen: true,
        message: "",
        images: [],
        windows: [],
    };
}

export function resolveStoreHours(
    hours?: StoreHours | null,
    nowMs: number = Date.now(),
): Required<Pick<StoreHours, "enabled" | "defaultOpen" | "isOpen">> & StoreHours {
    const enabled = Boolean(hours?.enabled);
    const defaultOpen = hours?.defaultOpen !== false;
    const message = String(hours?.message || "").trim();
    const images = (hours?.images || []).filter(Boolean).slice(0, MAX_IMAGES);
    const windows = (hours?.windows || [])
        .filter((window) => window?.kind === "on" || window?.kind === "off")
        .filter((window) => {
            const start = Date.parse(window.startAt);
            const end = Date.parse(window.endAt);
            return Number.isFinite(start) && Number.isFinite(end) && end > start;
        })
        .slice(0, MAX_WINDOWS);

    if (!enabled) {
        return {
            enabled,
            defaultOpen,
            message,
            images,
            windows,
            isOpen: true,
            nextChangeAt: null,
        };
    }

    const covering = windows.filter((window) => {
        const start = Date.parse(window.startAt);
        const end = Date.parse(window.endAt);
        return start <= nowMs && nowMs < end;
    });
    let isOpen = defaultOpen;
    if (covering.some((window) => window.kind === "off")) {
        isOpen = false;
    } else if (covering.some((window) => window.kind === "on")) {
        isOpen = true;
    }

    const boundaries = windows
        .flatMap((window) => [Date.parse(window.startAt), Date.parse(window.endAt)])
        .filter((value) => value > nowMs)
        .sort((a, b) => a - b);

    return {
        enabled,
        defaultOpen,
        message,
        images,
        windows,
        isOpen,
        nextChangeAt: boundaries[0] ? new Date(boundaries[0]).toISOString() : null,
    };
}

export function toDatetimeLocalValue(iso?: string): string {
    if (!iso) {
        return "";
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        return "";
    }
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDatetimeLocalValue(value: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value || ""));
    if (!match) {
        return "";
    }
    const date = new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
        0,
        0,
    );
    if (Number.isNaN(date.getTime())) {
        return "";
    }
    return date.toISOString();
}

export function payloadStoreHours(hours: StoreHours): StoreHours {
    return {
        enabled: Boolean(hours.enabled),
        defaultOpen: hours.defaultOpen !== false,
        message: String(hours.message || "").trim(),
        images: (hours.images || []).filter(Boolean).slice(0, MAX_IMAGES),
        windows: (hours.windows || []).filter(
            (window) => window?.kind === "on" || window?.kind === "off",
        ),
    };
}
