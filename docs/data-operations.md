# Data operations: migrations, backups, per-store export/restore, store deletion

Everything in this document is a **deliberate, manual operator step**. Nothing
here runs at app startup. `MONGO_URI` / `DATABASE_NAME` in `.env` point at the
**production** database, and every tool below uses them unless you pass
`--mongo-uri` / `--db` (`--target-db` for import). Practise on a restored copy
first.

Commands are shown for Windows PowerShell from the repo root
(`venv\Scripts\python.exe`). On Linux/EC2, use `venv/bin/python` instead.

---

## 0. Golden rule: back up first

Before any migration, `store_import`, or deletion, take a backup you have
checked you can restore:

* **Atlas Cloud Backup** (M10+): cluster → *Backup* → *Take Snapshot Now*.
  Name it after the change (e.g. `before-0001-backfill`).
* **Any tier** (including M0/Flex): `mongodump`, see [section 3](#3-full-backups-with-mongodump--mongorestore).

---

## 1. Migrations (`app/migrations/`)

### Layout

* `app/migrations/NNNN_short_name.py`: one module per migration. It has a
  docstring (the first line shows in `status`) and
  `up(db, *, dry_run=False, log=print, heartbeat=None)`. Only `db` is
  required. The runner passes whichever optional arguments the function
  accepts.
* `schema_migrations` collection: one doc per applied migration,
  `{_id: "0001", name, appliedAt, lastRunAt, durationMs, runCount, summary}`.
* `schema_migrations_lock` collection: a single lock doc
  `{_id: "migrations", owner: "host:pid:rand", acquiredAt, expiresAt}`. A
  second runner refuses to start while it exists. The lock expires 30 minutes
  after its last heartbeat, so a crashed runner does not block forever.
  Heartbeats happen between migrations and, for 0001, once per store.
* Migrations must be **idempotent**: re-running one after a crash, or through
  `rerun`, must be safe. A migration is recorded only after it finishes
  successfully. If one fails, the runner stops, releases the lock, and
  records nothing for the failed migration.

### Commands

```powershell
# What is applied / pending (read-only)
venv\Scripts\python.exe -m app.migrations status

# Report what would change. Takes no lock and writes nothing.
venv\Scripts\python.exe -m app.migrations up --dry-run

# Apply all pending, or up to and including one id.
# You are asked to type the database name; --yes skips the prompt.
venv\Scripts\python.exe -m app.migrations up
venv\Scripts\python.exe -m app.migrations up --to 0001

# Run an applied (idempotent) migration again, e.g. after importing an old store export
venv\Scripts\python.exe -m app.migrations rerun 0001 --dry-run
venv\Scripts\python.exe -m app.migrations rerun 0001

# Remove a lock left by a crashed runner. Only do this after checking that no runner is still going.
venv\Scripts\python.exe -m app.migrations unlock

# Any command against another database (staging / restored snapshot)
venv\Scripts\python.exe -m app.migrations status --mongo-uri "mongodb+srv://..." --db retail_restore
```

In a dry run with several pending migrations, each one sees the data as it is
now, before the earlier ones have run.

### Recommended rollout for a migration

1. Restore last night's snapshot (or a `mongodump`) into a scratch
   database or cluster. Run `status`, `up --dry-run` and `up` there, then
   check the results.
2. Take a fresh snapshot of production (section 0).
3. Run `up --dry-run` against production and check that the per-store counts
   look right.
4. Run `up` against production. Keep the output.
5. Run `status` and the migration's verification queries (below).

### Writing a new migration

Copy the shape of `0001_backfill_order_numbers.py`. Use the next free number.
Write the docstring as *what* and *why*. Make every write conditional, so it
only touches documents still in the old shape. Support `dry_run`, and call
`heartbeat()` every so often in long loops. Add a test next to
`tests/test_backfill_order_numbers.py` using `tests/mongo_fakes.py`.

### 0001_backfill_order_numbers: design and verification

New orders get `orderNumber` from
`counters: {_id: "orders:<tenantId>", seq}` through one atomic `$inc`
(`order_fulfillment.next_order_number`). Older orders have no number.

**Choice made:** numbers that already exist are **never changed**, because
customers have already seen them in WhatsApp messages, order pages, packing
slips and the ledger. For each store, the migration:

1. Reads the store's orders that have no number, and sorts them by
   `createdAt`, then `_id`. An order without a usable `createdAt` uses its
   ObjectId timestamp.
2. Raises the counter with `$max` to at least the highest `orderNumber`
   already stored. This is defensive, and `$max` can never lower the counter.
3. Reserves a block of N numbers with **one atomic `$inc: {seq: N}`** on the
   same counter document that the app uses. The block is
   `[seq-N+1 .. seq]`. The server applies `$inc`s on one document one at a
   time, so an order created while the migration runs gets a number either
   before or after the block, never inside it. No transaction is needed.
4. Writes each number with a conditional update (`orderNumber` still null),
   plus `orderNumberBackfilledAt`. `updatedAt` is left alone.
5. Copies the number onto `ledger_entries` that are missing it.

Numbering the old orders *below* the new ones is not possible: new orders
already started at 1. The trade-off is that a store which took new orders
before the migration ran ends up with its old orders numbered after them.
For example, new orders 1–3 exist and 10 old orders become 4–13. A store
with no numbered orders simply gets 1..N in date order. Running the
migration soon after deploying keeps this inversion small.

If the migration crashes after reserving a block, re-running it reserves a
new block for the orders still unnumbered. The unused numbers become a gap.
Gaps are harmless (failed inserts in `next_order_number` already cause them),
and they cannot produce duplicates.

The migration leaves orders with no `tenantId` unnumbered and prints a
warning. If orders for one store were stored with different casings of its
`tenantId`, each casing has its own counter, exactly as
`next_order_number` behaves.

Verification in `mongosh`:

```js
db.orders.countDocuments({ orderNumber: null, tenantId: { $nin: [null, ""] } })   // expect 0
db.orders.aggregate([                                                             // expect no rows
  { $match: { orderNumber: { $ne: null } } },
  { $group: { _id: { t: "$tenantId", n: "$orderNumber" }, c: { $sum: 1 } } },
  { $match: { c: { $gt: 1 } } } ])
db.orders.countDocuments({ orderNumberBackfilledAt: { $exists: true } })          // how many were backfilled
db.ledger_entries.countDocuments({ orderNumber: null })                           // expect 0 (except entries whose order is gone)
```

Once there are no duplicates, consider adding a unique partial index on
`orders (tenantId, orderNumber)` in `app/database/indexes.py`. It makes
collisions impossible from then on.

---

## 2. MongoDB Atlas backups (recommended setup)

Cloud Backup with scheduled snapshots and point-in-time restore needs a
**dedicated cluster (M10 or larger)**. The free M0 tier has no Cloud Backup,
and Flex has only limited automatic snapshots (check the cluster's *Backup*
tab). On those tiers, use `mongodump` on a schedule (section 3) until you
move to M10+.

On M10+:

1. **Enable Cloud Backup**: cluster → *Edit Configuration* → *Additional
   Settings* → *Turn on Cloud Backup*.
2. **Enable Continuous Cloud Backup** (point-in-time restore, PITR). Set the
   restore window to at least **3–7 days**. PITR can restore to any second
   in the window, e.g. just before a bad migration or a mistaken delete.
3. **Snapshot policy** (*Backup* → *Backup Policy*). A reasonable start,
   close to Atlas's defaults:

   | Frequency | Retention |
   |---|---|
   | Every 6 hours | 2 days |
   | Daily | 7 days |
   | Weekly | 4 weeks |
   | Monthly | 12 months |

   Keep the monthly retention in line with your data-deletion promises.
   Deleted stores stay in snapshots until those snapshots expire (section 5).
4. Optional: add a **snapshot copy to a second region**. Consider a
   **Backup Compliance Policy** to stop anyone (including a compromised admin
   account) from deleting backups or shortening retention.
5. **Alerts**: turn on Atlas alerts for backup failures and for a missed
   snapshot schedule.

### Restore drills (do these, don't just configure backups)

Once a quarter, and after any big schema change:

1. Atlas → *Backup* → pick a snapshot (or a PIT timestamp) → *Restore* →
   **restore to a different, temporary cluster**. Never restore over
   production during a drill.
2. Point the tools at it:
   `venv\Scripts\python.exe -m app.migrations status --mongo-uri "<restore-uri>" --db <DATABASE_NAME>`.
   Spot-check counts, e.g. `db.orders.countDocuments()` compared with
   production at that time.
3. Optionally run the API locally against it (`MONGO_URI=<restore-uri>`) and
   load one storefront.
4. Record how long the restore took. That is your realistic recovery time.
   Then delete the temporary cluster.

To recover production from a snapshot, restore into a new cluster, check it,
then switch `MONGO_URI`. Or, for a single store, export that store from the
restored cluster and import it into production (section 4).

---

## 3. Full backups with `mongodump` / `mongorestore`

Install the [MongoDB Database Tools](https://www.mongodb.com/try/download/database-tools).
Use a database user with read-only access for dumps.

```powershell
# Full logical backup of the app database (gzip archive, one file)
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
mongodump --uri "mongodb+srv://USER:PASS@cluster.xxxxx.mongodb.net" `
  --db "<DATABASE_NAME>" --readPreference secondaryPreferred `
  --gzip --archive="backups\full-$stamp.archive.gz"

# Inspect an archive without writing anything
mongorestore --gzip --archive="backups\full-$stamp.archive.gz" --dryRun -v

# Restore into a DIFFERENT database name (safe: production is untouched)
mongorestore --uri "mongodb+srv://USER:PASS@cluster.xxxxx.mongodb.net" `
  --gzip --archive="backups\full-$stamp.archive.gz" `
  --nsFrom "<DATABASE_NAME>.*" --nsTo "<DATABASE_NAME>_restore.*"
```

* Leave the database path out of the `--uri` (or make it match `--db`).
  Passing both with different names is an error.
* Do **not** add `--drop` against production unless you are deliberately
  replacing the whole database. It drops each collection before restoring it.
* Dumps contain password hashes, reset tokens and encrypted Delhivery
  tokens. Store them encrypted, with limited access, and delete old ones on a
  schedule.
* Indexes are included in the dump. For a new empty database, starting the
  app once also creates them (`ensure_indexes`).

---

## 4. Per-store export and restore (`app/tools/`)

### Export (read-only)

```powershell
venv\Scripts\python.exe -m app.tools.store_export --tenant demo-store --out backups\stores\demo-store-20260924
```

What gets exported: every document whose `tenantId` matches (case-insensitive,
the same way the app matches it), in **every collection** of the database,
found dynamically so new collections are included. That covers the tenant
document itself, the store's users (customers and managers; super admins have
`tenantId: null` and are never included), and the store's `counters` docs
(`orders:<tenantId>`). It leaves out: `schema_migrations` and its lock, and
short-lived `rate_limits`, `store_signup_otps` and `customer_otps`.

Output: `<collection>.jsonl`, one document per line in **canonical MongoDB
Extended JSON** (`bson.json_util`, `relaxed=False`). ObjectIds, dates,
int vs double and Decimal128 all round-trip exactly. Alongside it is
`manifest.json` with:
format/version, tenantId and a tenant summary, `exportedAt`, source, per-file
document count and SHA-256, the source's `schema_migrations` state, and a
`sensitive` section. The manifest is written last, so a directory without one
is an incomplete export.

**Sensitive contents** (also listed in the manifest):

| Collection | Field | Why |
|---|---|---|
| tenants | `password`, `resetToken`, `resetTokenExpiry` | store-owner bcrypt hash / live reset token |
| tenants | `billing.razorpaySubscriptionId` | platform Razorpay subscription |
| users | `password`, `resetToken`, `resetTokenExpiry` | customer / manager bcrypt hashes, reset tokens |
| shipping_integrations | `apiTokenEncrypted` | store's Delhivery token. It is Fernet-encrypted, but anyone who has `TOKEN_ENCRYPTION_KEY`/`SECRET_KEY` can decrypt it |
| users, addresses, orders, payment_intents, contact_messages, reviews, notification_logs, shipments | whole docs | customer personal data |

Treat a full export like a database backup.

S3 files (product images, banners, logo) are **not** in MongoDB. They live
under `s3://<S3_BUCKET>/tenants/<tenantId>/`. Copy them separately if needed:
`aws s3 sync s3://<S3_BUCKET>/tenants/<tenantId>/ backups\stores\<tenantId>-s3\`.

### Validate / import

```powershell
# Check manifest, checksums, counts and that every doc belongs to the store. Writes nothing.
venv\Scripts\python.exe -m app.tools.store_import --dir backups\stores\demo-store-20260924 --validate-only

# Restore into a scratch database (refuses if the store already exists there)
venv\Scripts\python.exe -m app.tools.store_import --dir backups\stores\demo-store-20260924 `
  --target-db retail_restore --i-understand-this-writes

# Replace the store's data in production with the export
venv\Scripts\python.exe -m app.tools.store_import --dir backups\stores\demo-store-20260924 `
  --replace --i-understand-this-writes
```

Before writing anything, the import checks and **refuses** if:

* the manifest or files are invalid (checksum, count, a document belonging to
  another store, a handover export, an unsafe collection name);
* the store already has any data in the target and `--replace` was not given;
* another store in the target already uses the same slug or email, or already
  owns one of the exported `_id`s;
* the `schema_migrations` state differs between the export and the target.
  If the target has *extra* migrations, import with
  `--allow-schema-mismatch` and then run
  `python -m app.migrations rerun <id>` for each (they are idempotent). If
  the export has extra migrations, migrate the target first.

With `--replace`:

1. The store's current data in the target is exported to `--backup-dir`
   (default `<dir>.pre-replace-<timestamp>`).
2. Only documents matching this `tenantId` are deleted, from every
   collection, plus its counters.
3. The export is inserted with the tenant document **last**, so the
   storefront and owner login only start working once everything else is in.
4. Counts are checked afterwards.

The store is unavailable during a replace, so do it in a quiet window. If the
import fails part-way, fix the cause and run it again with `--replace`. The
backup directory holds the previous data.

`--target-db` defaults to `DATABASE_NAME`, and `--mongo-uri` to `MONGO_URI`.
The tool prints the target and warns when it is the configured (production)
database. It never writes without `--i-understand-this-writes`.

---

## 5. A store that leaves: hand-over and data deletion

### 5.1 Hand-over export for the store owner

```powershell
venv\Scripts\python.exe -m app.tools.store_export --tenant demo-store --out handover\demo-store --handover
```

`--handover` writes relaxed (easier to read) Extended JSON, and cannot be
imported. It includes only an allowlist of collections: `tenants`, `users`,
`products`, `categories`, `orders`, `addresses`, `coupons`, `banners`,
`reviews`, `contact_messages`, `wishlists`, `shipments`, `shipping_locations`,
`ledger_entries`, `payouts`. The fields in the table above are **stripped**.

**Hand over:** the whole `handover\demo-store` directory, and the S3 images
(`aws s3 sync s3://<S3_BUCKET>/tenants/demo-store/ handover\demo-store\images\`).

**Never hand over:** a *full* export. If you only have a full export, strip
the fields above and leave out these platform-internal files:
`payment_intents`, `notification_logs`, `periskope_webhook_events`,
`counters`, `shipping_integrations`, `messaging_integrations`, `carts`. The
owner already has their own Delhivery token, so the encrypted copy is of no
use to them and is a platform secret.

Before handing over customer personal data, check that it matches your terms
and privacy policy (the store is normally the controller of its customers'
data).

### 5.2 Deletion procedure

**How it relates to soft delete.** `DELETE /tenants/{id}` (super admin) calls
`tenant_service.soft_delete_tenant`. That call:

* sets `isActive:false` and `deletedAt`;
* moves `slug`/`email` to `deletedSlug`/`deletedEmail`, so they can be reused;
* removes the owner's `password`/`resetToken`;
* disables every user of the store.

It deletes **no** data, and it deliberately keeps the tenant document.
`tenant_id_in_use()` checks `tenants`, `users`, `orders` and `products`, so a
new store can never claim the same `tenantId` and inherit old customers or
orders. The purge below keeps that guarantee: **the tenant document is never
deleted, only reduced to a tombstone.**

Order of operations:

1. **Settle and close.** No open orders (`confirmed`/`processing`/`shipped`)
   and no open returns. Ledger balance due is 0 and the final payout is
   recorded (super-admin ledger). Cancel the Razorpay subscription if
   `tenants.billing.razorpaySubscriptionId` is set.
2. **Back up.** Take a full export (keep it encrypted, as the platform's
   record) and the hand-over export (section 5.1). Deliver the hand-over.
3. **Soft-delete** through the app (`DELETE /tenants/{id}`). Logins and the
   storefront stop immediately.
4. **Grace period** (e.g. 30 days, as your terms say). While the data exists,
   an accidental deletion can be undone by re-activating the store.
5. **Purge**, in this order. Stop writes first (done in step 3). Remove
   secrets and customer personal data before bulk catalog data. Handle
   records that may have a legal retention period last. Keep the tenant
   tombstone. Count first, then delete:

   ```js
   // mongosh, connected to the production database. Take a snapshot first.
   const T = "demo-store";
   const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
   const q = { tenantId: { $regex: "^" + esc(T) + "$", $options: "i" } };
   const purgeOrder = [
     // a. live sessions / checkout state
     "carts", "wishlists", "payment_intents", "customer_otps",
     // b. integrations and secrets (Delhivery token)
     "shipping_integrations", "messaging_integrations", "shipping_locations",
     // c. customer personal data and message logs
     "addresses", "contact_messages", "reviews", "notification_logs", "periskope_webhook_events",
     // d. catalog / marketing
     "banners", "coupons", "categories", "products",
     // e. fulfilment records
     "shipments",
   ];
   purgeOrder.forEach(c => print(c, db[c].countDocuments(q)));          // 1) review
   // purgeOrder.forEach(c => print(c, db[c].deleteMany(q).deletedCount)); // 2) delete

   // Anything else still tagged with this tenant (new collections)?
   db.getCollectionNames().filter(c => !c.startsWith("system.") &&
     !["tenants", "orders", "ledger_entries", "payouts", "users"].includes(c) &&
     !purgeOrder.includes(c))
     .forEach(c => { const n = db[c].countDocuments(q); if (n) print("LEFTOVER", c, n); });
   ```

   f. **Financial records** (`orders`, `ledger_entries`, `payouts`) may have
   to be kept for the legal retention period for tax and accounting records.
   Confirm the period with your accountant; in India it is typically several
   years. Until then, **anonymise** the orders instead of deleting them:

   ```js
   db.orders.updateMany(q, { $unset: { address: "", phone: "", counterNumber: "" },
                             $set: { anonymisedAt: new Date() } });
   ```

   When the retention period ends: `["orders","ledger_entries","payouts"].forEach(c => db[c].deleteMany(q))`.

   g. **Users** (customers and managers):
   `db.users.deleteMany(q)`. Do this after the orders are anonymised. Orders
   keep a dangling `userId`, which is harmless because the store is inactive.
   Keep them only if you need to prove who placed which order during
   retention, and in that case strip `name`/`email`/`phone`/`password`.

   h. **Counters**: `db.counters.deleteMany({ _id: { $regex: ":" + esc(T) + "$", $options: "i" } })`.

   i. **Tenant tombstone.** Reduce the document to its identity. Do not
   delete it:

   ```js
   const t = db.tenants.findOne(q);
   db.tenants.replaceOne({ _id: t._id }, { tenantId: t.tenantId, isActive: false,
     deletedAt: t.deletedAt || new Date(), createdAt: t.createdAt, purgedAt: new Date() });
   ```
6. **S3**: `aws s3 rm s3://<S3_BUCKET>/tenants/<tenantId>/ --recursive`.
7. **Log the purge** (tenantId, date, who did it) in a place outside the
   database.

### 5.3 Deleted data in backups

Purged data still exists in Atlas snapshots, PIT history and old `mongodump`
archives until they expire. With the policy above, that is up to 12 months
(monthly snapshots). State this retention in your privacy policy. **If you
ever restore a full backup into production, re-apply every purge in the
purge log afterwards**, or the deleted stores will come back. Restoring a
single store with `store_import` does not bring back other stores.
