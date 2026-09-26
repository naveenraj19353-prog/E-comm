# GST Tax & Invoicing

Phase-1 GST module: store tax profile, product classification, server-side
calculation, and tax invoices with credit notes.

## Deliberate scope limits

- No IRP/e-invoice submission, IRN or signed QR.
- No e-way bills.
- No GST return filing or GSTR reconciliation.
- **No hard-coded HSN-to-rate master data.** The merchant and their CA own
  classification, so stale tax law can never silently change an invoice.

## Configuration

Rates are configured, never inferred. Three levels, most specific first:

1. the product's own `tax.taxRate`
2. the store's `defaultTaxRate` (profile fallback)
3. nothing — the line is untaxed

`taxStatus` on a product is `taxable`, `exempt`, `nil_rated` or `non_gst`. The
non-taxable statuses force a zero rate and zero cess. They are kept as separate
values rather than a zero rate because they occupy different lines on a GST
return.

## Where tax comes from

Calculation always runs **server-side against the authoritative cart snapshot**,
never from client-supplied amounts. At checkout:

```
calculate_order_tax(tenant_id, items, discount, shipping, destination_state)
  -> snapshot
total_from_tax_snapshot(subtotal, discount, shipping, snapshot)
  -> the customer-facing payable
```

A store with GST switched off gets `{"enabled": false, "taxTotal": 0.0}` and an
unchanged total, so enabling this feature cannot move an existing store's prices.

Inclusive stores divide the price by `1 + (GST + cess)` so GST is *extracted*
from the listed price and the payable does not change. Exclusive stores have GST
added on top.

The discount is allocated across lines in proportion to line value before tax is
computed, with the final line absorbing the rounding remainder.

## Place of supply fails loudly

If GST is enabled, both the supplier state and the delivery state must resolve to
valid GST state codes. If either cannot be resolved the engine raises, and
checkout returns a 400.

This is intentional: an invoice split against the wrong state collects the wrong
tax, which is worse than a blocked checkout. The resolver accepts full state
names, the standard two-letter abbreviations (`KA`, `MH`) and two-digit codes.

**Operational consequence:** a GST-enabled store cannot produce a checkout
preview until the customer has an address, because the delivery state is
unknown.

## Order and invoice immutability

- The tax snapshot is copied onto the order at placement. Later rate changes must
  never rewrite a historical order.
- Invoice issuance is **explicit** (`POST /tax/invoices/{order_id}`), not
  automatic — only the merchant knows when an order has reached the legal point
  at which they want to raise the invoice.
- Issuing twice for the same order returns the original invoice. The uniqueness
  is enforced by a `(tenantId, orderId)` index, not by application logic alone.
- Invoice and credit-note numbers are allocated from an atomic Mongo counter,
  scoped per store, per document kind and per financial year, giving
  `INV/2026-27/000001`. The financial year rolls over on 1 April.
- **Never renumber an issued document.** The counters and the unique number
  indexes both assume numbers are write-once.

## API

| Endpoint | Permission | Purpose |
|---|---|---|
| `GET /tax/profile` | `products_update` | Read the store GST profile |
| `PUT /tax/profile` | `products_update` | Create/update it |
| `POST /tax/invoices/{order_id}` | `orders` | Issue (idempotent) |
| `GET /tax/invoices/{order_id}/admin` | `orders` | Admin fetch |
| `GET /tax/invoices/{order_id}` | customer | The customer's own invoice |
| `POST /tax/invoices/{order_id}/credit-notes` | `orders` | Issue a credit note |
| `GET /tax/credit-notes/{order_id}` | `orders` | List credit notes |

Enabling GST requires a legal name, a valid GSTIN and a supplier state — a
registration the invoice cannot legally carry is worse than none. Issuing an
invoice additionally requires a GSTIN on the profile.

## Admin UI

- **Tax & GST** at `/admin/tenants/:tenantId/tax` — GST registration toggle, legal
  name, GSTIN, registered address, state, invoice prefix, default and shipping
  rates, inclusive/exclusive, reverse charge. Includes a client-side check that
  the GSTIN's first two digits match the selected state.
- **Create / Edit Product** — tax status, HSN/SAC, GST rate and cess. The rate and
  cess inputs only appear for a taxable classification, and a blank rate means
  "use the store default".

## Before going live

1. Have the merchant's CA validate the GST profile, every HSN/SAC code and every
   rate. Do not configure these from assumption.
2. Keep historical order and invoice tax snapshots immutable.
3. Add IRP/GSP and e-way-bill integrations behind provider adapters later.
4. Exports, services, reverse charge and unusual place-of-supply cases need
   dedicated rule paths validated with a CA before they are enabled.

## Tests

`tests/test_tax_invoicing.py` covers the CGST/SGST vs IGST split, inclusive and
exclusive pricing, cess inside the inclusive divisor, discount allocation,
shipping tax, the taxable/exempt statuses, invoice numbering and idempotency, and
credit-note limits. It runs without a database using in-memory collection
stand-ins.
