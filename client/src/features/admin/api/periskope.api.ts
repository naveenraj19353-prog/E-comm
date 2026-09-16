import apiClient from "../../../api/client";
import { API_ENDPOINTS } from "../../../api/endpoints";

export type PeriskopeNotificationPreferences = {
  orderConfirmation: boolean;
  paymentSuccess: boolean;
  shipmentUpdates: boolean;
  deliveryUpdates: boolean;
  cancellation: boolean;
};

export type PeriskopeSettings = {
  provider: string;
  enabled: boolean;
  connected: boolean;
  senderPhone: string;
  webhookEnabled: boolean;
  webhookConfigured: boolean;
  notifications: PeriskopeNotificationPreferences;
  updatedAt?: string;
  createdAt?: string;
};

export type PeriskopeNotificationLog = {
  id: string;
  eventType: string;
  orderId?: string;
  productId?: string;
  phone: string;
  status: "pending" | "sending" | "sent" | "failed" | "skipped";
  attempts: number;
  messageId?: string;
  error?: string;
  createdAt?: string;
  updatedAt?: string;
};

const tenantParams = (tenantId: string) => ({ tenantId });

export async function getPeriskopeSettings(tenantId: string) {
  const response = await apiClient.get(API_ENDPOINTS.PERISKOPE.SETTINGS, {
    params: tenantParams(tenantId),
  });
  return response.data.data as PeriskopeSettings;
}

export async function savePeriskopeSettings(
  tenantId: string,
  payload: Pick<
    PeriskopeSettings,
    "enabled" | "webhookEnabled" | "notifications"
  >,
) {
  const response = await apiClient.put(API_ENDPOINTS.PERISKOPE.SETTINGS, payload, {
    params: tenantParams(tenantId),
  });
  return response.data as {
    success: boolean;
    message?: string;
    data: PeriskopeSettings;
  };
}

export async function testPeriskopeConnection(tenantId: string) {
  const response = await apiClient.post(
    API_ENDPOINTS.PERISKOPE.TEST,
    {},
    { params: tenantParams(tenantId) },
  );
  return response.data as { success: boolean; message: string };
}

export async function getPeriskopeNotifications(tenantId: string) {
  const response = await apiClient.get(API_ENDPOINTS.PERISKOPE.NOTIFICATIONS, {
    params: tenantParams(tenantId),
  });
  return response.data.data as PeriskopeNotificationLog[];
}

export async function retryPeriskopeNotification(
  tenantId: string,
  notificationId: string,
) {
  const response = await apiClient.post(
    API_ENDPOINTS.PERISKOPE.retry(notificationId),
    {},
    { params: tenantParams(tenantId) },
  );
  return response.data as { success: boolean; message: string };
}
