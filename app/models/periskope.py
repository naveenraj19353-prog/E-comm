from pydantic import BaseModel, Field


class PeriskopeNotificationPreferences(BaseModel):
    orderConfirmation: bool = True
    paymentSuccess: bool = True
    shipmentUpdates: bool = True
    deliveryUpdates: bool = True
    cancellation: bool = True


class PeriskopeSettingsUpdate(BaseModel):
    enabled: bool = False
    webhookEnabled: bool = True
    notifications: PeriskopeNotificationPreferences = Field(
        default_factory=PeriskopeNotificationPreferences
    )
