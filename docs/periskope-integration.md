# Periskope WhatsApp integration

## Architecture

Storefront/admin events remain owned by Retail Cosmos:

`React → FastAPI commerce flow → WhatsApp notification service → Periskope service → WhatsApp`

React never calls Periskope. A tenant enables notifications and chooses event
types, while the initial shared Retail Cosmos Periskope credentials remain only
in the EC2 backend environment.

FastAPI records an idempotent notification log before adding a send operation to
`BackgroundTasks`. Periskope failures are recorded independently and never roll
back an order, payment, or shipment.

## Backend environment variables

Configure these only in the EC2 process environment:

```env
FRONTEND_URL=https://app.retailcosmos.com
TENANT_BASE_DOMAIN=retailcosmos.com
TENANT_SUBDOMAIN_ROUTING=auto
PERISKOPE_API_KEY=
PERISKOPE_PHONE=919876543210
PERISKOPE_BASE_URL=https://api.periskope.app/v1
PERISKOPE_WEBHOOK_SIGNING_KEY=
PERISKOPE_TIMEOUT_SECONDS=10
```

With this deployment, tenant customer links use:

```text
https://{tenant-slug}.retailcosmos.com/...
```

The platform fallback remains `https://app.retailcosmos.com/{tenant-slug}`.
Customer messages never use localhost.

Do not add these values to `client/.env`, Vite, Netlify, source control, API
responses, or logs.

Restart the FastAPI service after changing environment values. The exact command
depends on the EC2 process manager, for example:

```bash
sudo systemctl restart retail-cosmos-api
```

## Periskope API setup

1. Connect the WhatsApp phone in Periskope.
2. Generate an API key in the Periskope API settings.
3. Set the API key and connected phone in the EC2 environment.
4. Open a tenant's Admin → WhatsApp page.
5. Test the connection, select notifications, enable the integration, and save.

The backend uses the documented:

- `Authorization: Bearer <API key>`
- `x-phone: <country code and number, digits only>`
- `POST https://api.periskope.app/v1/message/send`
- `GET https://api.periskope.app/v1/phones`

## Webhook setup

Generate a signing key in Periskope's webhook settings and save it as
`PERISKOPE_WEBHOOK_SIGNING_KEY`.

Register this FastAPI route through the production Nginx mapping:

```text
POST /webhooks/periskope
```

If Nginx exposes FastAPI routes under `/api`, the public URL is:

```text
https://api.retailcosmos.com/api/webhooks/periskope
```

If Nginx forwards paths without `/api`, use:

```text
https://api.retailcosmos.com/webhooks/periskope
```

Confirm the active Nginx `location` rule before registering the URL. Subscribe
initially to the documented `message.created` event.

The endpoint verifies `x-periskope-signature` with HMAC SHA-256 over the raw
request body. It stores only safe event metadata and a SHA-256 event hash.
Duplicate payloads return success without reprocessing.

## Notification events

Supported Retail Cosmos events:

- Order confirmed after successful COD or prepaid order creation
- Razorpay payment succeeded after captured-payment fulfillment
- Order processing
- Order shipped
- Delhivery shipment created, using the existing tracking URL
- Order delivered
- Order cancelled

When an order or tenant has a publicly reachable image, notifications use
Periskope's documented image-media payload with a formatted WhatsApp caption and
production tenant link. Captions use a personalized hook, `HEAD BACK TO {STORE}`,
and a bold CTA plus the public URL (`VIEW ORDER`, `TRACK ORDER`, or `CHECKOUT NOW!`).
Periskope’s public send API does not document native template CTA buttons, and the
storefront cannot attach those buttons from the browser.

Payment failure is not sent because the current backend does not persist a
verified Razorpay failure event. Out-for-delivery is not sent because it is not
a Retail Cosmos order status and Delhivery tracking labels are not normalized.

## Phone handling

The sender header and recipient chat ID use digits only. Existing international
numbers are preserved. A 10-digit number is converted to country code `91` only
when the order address identifies India. If country context is unavailable, the
attempt is marked failed instead of guessing.

Customer records are not modified. Notification logs store only a masked phone.

## Backend endpoints

Tenant-admin authentication and tenant isolation apply to:

- `GET /integrations/periskope/settings`
- `PUT /integrations/periskope/settings`
- `POST /integrations/periskope/test`
- `GET /integrations/periskope/notifications`
- `POST /integrations/periskope/notifications/{id}/retry`

Public, signature-protected endpoint:

- `POST /webhooks/periskope`

## MongoDB collections

- `messaging_integrations` — tenant enablement and notification preferences
- `notification_logs` — safe delivery metadata and retry state
- `periskope_webhook_events` — webhook idempotency and audit metadata

Indexes are created during FastAPI startup. There are no destructive migrations.

## Local tests

```bash
python -m unittest discover -s tests -p "test_*.py"
cd client
npx tsc --noEmit
npm run lint
npm run build
```

Provider HTTP calls are mocked; tests never send real WhatsApp messages.

## Troubleshooting

- **Not configured:** verify both `PERISKOPE_API_KEY` and `PERISKOPE_PHONE` are
  present in the backend process environment, then restart FastAPI.
- **Connection test fails:** confirm the API key, connected phone, outbound HTTPS
  access to `api.periskope.app`, and that the phone uses country code plus digits.
- **Webhook returns 401:** confirm the Periskope signing key and ensure Nginx
  forwards the request body unchanged.
- **Notification is skipped:** enable the tenant integration and the specific
  event toggle.
- **Notification is failed:** review the safe error on Admin → WhatsApp and retry
  after correcting credentials or customer phone data.

`BackgroundTasks` is intentionally simple and non-durable if the API process
terminates after accepting a request. The persistent log preserves send state,
and failed/skipped sends can be retried from the admin page. A durable worker can
later consume the same collection without changing commerce services.
