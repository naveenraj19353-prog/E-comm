import axios from "axios";
import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";

export type DelhiveryPickupLocation = {
  name?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  address?: string;
  active?: boolean;
};

export type DelhiverySettings = {
  provider: string;
  enabled: boolean;
  connected: boolean;
  hasApiToken: boolean;
  apiTokenMasked: string;
  pickupLocationName?: string;
  pickupLocation?: DelhiveryPickupLocation | null;
  updatedAt?: string;
  createdAt?: string;
};

export type DelhiveryConnectPayload = {
  enabled: boolean;
  apiToken?: string;
  pickupLocationName?: string;
};

export type DelhiveryWarehousePayload = {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  country?: string;
  pin: string;
  return_address?: string;
  return_pin?: string;
  return_city?: string;
  return_state: string;
  return_country?: string;
};

export async function createDelhiveryShipment(tenantId: string, orderId: string) {
  const response = await apiClient.post(
    API_ENDPOINTS.DELHIVERY.SHIPMENTS,
    { orderId, markShipped: true },
    { params: tenantParams(tenantId) },
  );
  return response.data as {
    success: boolean;
    message?: string;
    data: {
      shipmentId: string;
      awb: string;
      trackingUrl?: string;
      labelUrl?: string;
      status?: string;
      orderStatus?: string;
    };
  };
}

export async function downloadDelhiveryPackingSlip(tenantId: string, awb: string) {
  try {
    const response = await apiClient.get(API_ENDPOINTS.DELHIVERY.packingSlip(awb), {
      params: tenantParams(tenantId),
      responseType: "blob",
    });
    const type = String(response.headers["content-type"] || "");
    if (type.includes("application/json")) {
      throw new Error(await blobDetail(response.data, "Unable to load packing slip."));
    }
    const blobType = type.includes("html")
      ? "text/html"
      : type.includes("pdf")
        ? "application/pdf"
        : type || "application/pdf";
    return new Blob([response.data], { type: blobType });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
      throw new Error(await blobDetail(error.response.data, "Unable to load packing slip."));
    }
    throw error;
  }
}

async function blobDetail(data: Blob, fallback: string) {
  const text = await data.text();
  try {
    const parsed = JSON.parse(text) as { detail?: string | { message?: string } };
    if (typeof parsed.detail === "string") {
      return parsed.detail;
    }
    if (parsed.detail && typeof parsed.detail === "object") {
      return parsed.detail.message || fallback;
    }
  } catch {
    /* keep fallback */
  }
  return fallback;
}

export async function trackDelhiveryAwb(tenantId: string, awb: string) {
  const response = await apiClient.get(API_ENDPOINTS.DELHIVERY.track(awb), {
    params: tenantParams(tenantId),
  });
  return response.data.data as {
    awb: string;
    status?: string;
    statusCode?: string;
    location?: string;
    trackingUrl?: string;
    estimatedDelivery?: string;
    history?: Array<{ status?: string; location?: string; at?: string }>;
  };
}

export async function requestDelhiveryPickup(
  tenantId: string,
  payload: {
    shipmentIds?: string[];
    pickupDate?: string;
    pickupTime?: string;
  } = {},
) {
  const response = await apiClient.post(API_ENDPOINTS.DELHIVERY.PICKUP, payload, {
    params: tenantParams(tenantId),
  });
  return response.data as {
    success: boolean;
    message?: string;
    data: {
      pickupId?: string;
      expectedPackageCount?: number;
      awbs?: string[];
      pickupDate?: string;
      pickupTime?: string;
    };
  };
}

function tenantParams(tenantId: string) {
  return { tenantId };
}

export async function getDelhiverySettings(tenantId: string) {
  const response = await apiClient.get(API_ENDPOINTS.DELHIVERY.SETTINGS, {
    params: tenantParams(tenantId),
  });
  return response.data.data as DelhiverySettings;
}

export async function saveDelhiverySettings(
  tenantId: string,
  payload: DelhiveryConnectPayload,
) {
  const response = await apiClient.put(API_ENDPOINTS.DELHIVERY.SETTINGS, payload, {
    params: tenantParams(tenantId),
  });
  return response.data as {
    success: boolean;
    message?: string;
    data: DelhiverySettings;
  };
}

export async function testDelhiveryConnection(tenantId: string, pincode = "110001") {
  const response = await apiClient.post(
    API_ENDPOINTS.DELHIVERY.TEST,
    { pincode },
    { params: tenantParams(tenantId) },
  );
  return response.data as {
    success: boolean;
    message?: string;
    data: {
      serviceable?: boolean;
      pincode?: string;
      cod?: boolean;
      prepaid?: boolean;
    };
  };
}

export async function createDelhiveryWarehouse(
  tenantId: string,
  payload: DelhiveryWarehousePayload,
) {
  const response = await apiClient.post(API_ENDPOINTS.DELHIVERY.WAREHOUSE, payload, {
    params: tenantParams(tenantId),
  });
  return response.data as {
    success: boolean;
    message?: string;
    data: {
      name: string;
      pickupLocation?: DelhiveryPickupLocation | null;
    };
  };
}
