# WhatsApp (Periskope) workflow

Retail Cosmos sends WhatsApp messages through **Periskope**. The storefront never talks to Periskope.

**Customer / Admin UI → FastAPI → WhatsApp notification service → Periskope API → WhatsApp**

Shared Periskope credentials (`PERISKOPE_API_KEY`, `PERISKOPE_PHONE`) live only on the **backend**. Each store turns notifications on in **Admin → WhatsApp**.

For implementation detail (env vars, webhooks, indexes), see [periskope-integration.md](./periskope-integration.md).

## Setup (per store)

1. Platform: Periskope is connected on the server (API key + sender WhatsApp).
2. Store admin opens **Admin → WhatsApp**, tests the connection, enables notifications, and chooses event types.
3. Store WhatsApp number for **owner alerts** is the **tenant phone** on **Edit Tenant** (`9198XXXXXXXX`). Optional override: **Store WhatsApp number** on the WhatsApp settings page. If both are empty, Delhivery pickup phone is used as a fallback.

## When a customer places an order

1. Checkout / payment creates the order as usual.
2. FastAPI writes a **notification log** (idempotent) and sends the message in the **background**. Order create/payment is **not rolled back** if WhatsApp fails.
3. **Customer** gets the event on the phone from their delivery address.
4. **Store** gets a matching alert on the tenant WhatsApp number (customer name, phone, items, amount).

The same pattern is used for later events (if those toggles are on): payment success, processing, shipped / Delhivery AWB, delivered, cancelled.

## Message content

- Formatted WhatsApp text (and product image when a public URL exists).
- Caption layout: personalized first line, short body, optional price, **CHECKOUT NOW!** / **VIEW ORDER** / **TRACK ORDER** plus the storefront URL, then `HEAD BACK TO {STORE}`.
- Customer order links use the live storefront (never localhost). WhatsApp native CTA buttons cannot be sent from the browser or from Periskope’s documented send API.
- Logs store only **safe metadata** (event, masked phone, status). Message body is not stored.

## Status and retry

Each send is logged as pending → sending → **sent**, **failed**, or **skipped** (integration or event turned off).

Admins can retry failed/skipped items on **Admin → WhatsApp**.

## Inbound (webhooks)

Periskope can POST to **`/webhooks/periskope`**. The backend checks `x-periskope-signature` and stores event metadata only. Duplicates are ignored.

## What is not sent

- Payment **failure** (not persisted as a verified event).
- Out-for-delivery (not a Retail Cosmos order status).

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Not configured | Backend env: API key + sender phone; restart API |
| Skipped | Enable WhatsApp + the event toggle |
| Failed (customer) | Valid customer phone + country (India → `91`) |
| Store didn’t get NEW ORDER | Tenant WhatsApp number on **Edit Tenant** |
| Webhook 401 | Signing key + raw body forwarded by Nginx |

---

## Workflow diagrams

### End-to-end

```mermaid
flowchart LR
  A[Customer / Admin UI] --> B[FastAPI]
  B --> C[WhatsApp notification service]
  C --> D[Notification log]
  C --> E[Periskope API]
  E --> F[WhatsApp]
  F --> G[Customer phone]
  F --> H[Store / tenant phone]
```

### New order (customer + store)

```mermaid
sequenceDiagram
  participant C as Customer
  participant App as Storefront
  participant API as FastAPI
  participant Log as Notification logs
  participant P as Periskope
  participant WA as WhatsApp

  C->>App: Place order (COD / paid)
  App->>API: Create order
  API->>API: Save order (commerce stays successful)
  API->>Log: Insert customer send (order.confirmed)
  API->>Log: Insert store send (NEW ORDER)
  API-->>App: Order created

  Note over API,P: Background task (does not block checkout)

  API->>P: Send customer confirmation
  P->>WA: Message to customer number
  API->>Log: sent / failed / skipped

  API->>P: Send store NEW ORDER
  P->>WA: Message to tenant WhatsApp
  API->>Log: sent / failed / skipped
```

### Who gets which number

```mermaid
flowchart TD
  Start[Order event: order.confirmed] --> Pref{WhatsApp enabled + order confirmation on?}
  Pref -->|No| Skip[Log: skipped]
  Pref -->|Yes| Split[Two messages]

  Split --> Cust[Customer message]
  Cust --> CPhone[Phone from order address / profile]
  CPhone --> SendC[Periskope → customer WhatsApp]

  Split --> Store[Store NEW ORDER]
  Store --> T1{Tenant phone on Edit Tenant?}
  T1 -->|Yes| SendS[Periskope → store WhatsApp]
  T1 -->|No| T2{WhatsApp settings override?}
  T2 -->|Yes| SendS
  T2 -->|No| T3{Delhivery pickup phone?}
  T3 -->|Yes| SendS
  T3 -->|No| SkipS[Log: skipped — store number missing]
```

### Later order events (same path)

```mermaid
flowchart LR
  E1[Payment success] --> N[Notification service]
  E2[Processing / shipped / AWB] --> N
  E3[Delivered] --> N
  E4[Cancelled] --> N
  N --> P[Periskope]
  P --> C[Customer WhatsApp]
  P --> S[Store WhatsApp]
```

Customer and store both get WhatsApp for order events when that toggle is on. Product share still goes to the customer only.
