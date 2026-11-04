# Architecture Review — SneakIn E-Commerce Platform

**Purpose:** Adversarial review of `ARCHITECTURE_ANALYSIS.md`. This document resolves the
Inventory-ownership contradiction in that analysis, makes a decision for each of the 13 open
questions, and supersedes the analysis wherever the two disagree.

**Status:** Design review only. **No application code was modified. No services were created. No
databases were migrated.**

**Supersedes:** `ARCHITECTURE_ANALYSIS.md` §4.3, §5.2, §6.2, §10 (Phase 4), §11 (Phase 4–6) — see §0.

---

## 0. The Inconsistency, Stated Plainly

`ARCHITECTURE_ANALYSIS.md` contains a direct self-contradiction about Inventory ownership.

**Position A — Inventory is a separate service with its own database and its own synchronous API:**

| Location | Text |
|---|---|
| §3, line 564 | Inventory is its own bounded context, "owns `inventory`" data, with Ordering holding a *synchronous* dependency on it |
| §5.1, line 694 | `stocklevel`, `reservation`, `stockmovement` → **Inventory** (own service) |
| §5.2, line 711 | "**Inventory owns** a new `inventory_stocklevel` table" (Option B recommended) |
| §6.2 Rule 3, line 802 | "The **only synchronous cross-service write** in the whole target system is `inventory.reserve` / `inventory.release`" — which presupposes they are in different services |
| §10, Phase 4 | "**Extract Inventory**" as a standalone phase |
| §11, Phase 4 | A standalone Inventory deployable with its own service, DB, and reservation model |

**Position B — Inventory is owned by the Ordering service:**

| Location | Text |
|---|---|
| §4.3, lines 645–646 | The topology diagram labels `ordering-svc` as "owns `ordering`" **and** "owns `inventory` (from Phase 5)" |

**These cannot both be true.** §4.3 has `ordering-svc` owning the `inventory` database while §5.1
assigns that same database to a separate Inventory service. §10 and §11 then schedule Inventory
extraction *before* Ordering, which contradicts §4.3's "from Phase 5."

### Resolution

**Position B is correct: Ordering owns Inventory.** They are one service and one database.
Section 1 below justifies this in full. Concretely, this deletes from the plan:

- the standalone Inventory service and its Phase 4
- the cross-service `inventory.reserve` / `inventory.release` API
- the `Reservation` entity and the reservation-expiry timeout machinery
- **the distributed transaction between Order and Inventory** — the single hardest item in the
  previous analysis

and promotes the `commerce` service to own `cart`, `wishlist`, `orders`, and `inventory` together.

**Net effect on the plan:** the checkout problem goes from "a 4-aggregate saga across three
services with compensating actions" to **"one local ACID transaction with asynchronous
notifications."** Sections 3 and 5 show why this is not a compromise but a strict improvement in
correctness, latency, and failure-mode count.

---

## 1. Inventory Ownership: Ordering Owns It

### The decision

**Inventory is a module inside the Commerce (Ordering) service. One deployable, one database.**

This does **not** mean Inventory is not a real bounded context. It is a genuinely distinct domain
with its own language (`available`, `reserved`, `stock movement`, `low stock`) and its own change
drivers (supply chain). The analysis was right about that. It was wrong to conclude that every real
bounded context must become a deployable.

**Keep the module boundary enforced in code** — separate package, its own tables, no ORM model
imports from the order package, an explicit interface between them. The boundary is a *design*
boundary today and becomes an *extractable* boundary tomorrow if a trigger fires (§1.5).

### 1.1 Why co-location wins

**Reason 1 — The consistency requirement demands ACID, and ACID across a network hop is not
available without 2PC.**

The invariant is: *available stock must never go negative, and an order must never exist for stock
that was not decremented.* Today this is enforced by one PostgreSQL transaction. If Inventory is a
separate service, "stock decremented" and "order created" become two commits in two databases, and
the only ways to keep them consistent are:

| Option | Verdict |
|---|---|
| Two-phase commit (XA) | Unavailable in PostgreSQL in any practical form; a single-node coordinator is an SPOF; operationally unacceptable at this scale |
| Saga with compensation | Introduces a window where the order exists but stock is unreleased (or vice versa), requiring reconciliation jobs, compensating transactions, and idempotency everywhere. **Strictly worse than the transaction that already exists** |
| Keep them co-located | One transaction. The invariant holds unconditionally. |

Choosing a separate Inventory service means *choosing* to give up the transaction that already
works, in exchange for nothing. That is a bad trade.

**Reason 2 — There is no independent scaling axis.**

Stock write volume is exactly proportional to checkout volume. They rise and fall together. If
checkout is slow, Inventory is slow. Scaling them separately buys nothing: you cannot relieve
checkout load by adding Inventory replicas when both are driven by the same event.

**Reason 3 — There is no independent lifecycle.**

Inventory has no external dependency. No WMS, no supplier feed, no warehouse API, no third-party
OMS. It has one writer (checkout) and one corrector (cancellation). Its release cadence is
identical to Ordering's because the same team and the same business process change both. The
classic independent-lifecycle justification for a service boundary does not apply.

**Reason 4 — No autonomous business capability.**

Services are expensive because someone operates them. Inventory has no SLA of its own. There is no
"inventory team" and no "inventory on-call." Extracting it creates an operational unit with no
business owner.

**Reason 5 — It makes the checkout path slower and less available for no gain.**

One extra network hop, one extra process to deploy, one extra thing to be down, one extra timeout
budget, one extra circuit breaker. All cost, no benefit.

### 1.2 What co-location must not become

Co-location is only safe if the *module* boundary is real. Otherwise this is just the monolith with
extra steps.

| Must be true | How to enforce |
|---|---|
| `inventory` package does not import `order` models, and vice versa | Go's compiler enforces this if they are separate packages with an explicit interface |
| Stock is mutated **only** through the inventory package's exported functions | Unexported fields + an explicit `Adjust()`, `Reserve()`, `Release()` API. No `UPDATE products SET stock = ...` anywhere else |
| Stock has a ledger | Every mutation appends a `stock_movement` row in the same transaction. This is what makes the four divergent writers of the current code (§9.4 W4) impossible |
| The stock table is not shared with catalog | `stock_level` is a Commerce table with `(product_id, size_value)` as plain integers. No FK to any catalog table. Catalog IDs are opaque to Commerce |

The last row matters: **there must be no FK from `stock_level` to a catalog table.** The moment
there is, Commerce has a hard dependency on Catalog's schema and the boundary is fiction.

### 1.3 What the boundary buys us later

Even co-located, model Inventory properly and the future extraction is cheap:

- `stock_level(product_id, size_value, available, version, updated_at)` — no catalog FK
- `stock_movement(id, product_id, size_value, delta, reason, order_id, correlation_id, created_at)`
  — the ledger that does not exist today
- `AdjustStock`, `ReserveForOrder`, `ReleaseForOrder` as the only mutation API
- Reserve/release are idempotent by construction, so they map 1:1 onto a future RPC if extracted

Designing as if it might be extracted, while deploying it as a module, is the standard way to keep
that option open at near-zero cost.

### 1.4 The counter-argument, and why it loses

The strongest case for a separate Inventory service: it is the highest-churn domain with the
weakest current structure, and one could argue it deserves explicit isolation and investment.

**It loses because the churn is currently in the wrong place.** The reason Inventory looks chaotic
is not that it needs its own service — it is that it has **no model at all**. Four ad-hoc writers
mutating a column on a catalog table (`ARCHITECTURE_ANALYSIS.md` §1.6 W4) is a *modelling* defect.
You fix it by building `StockLevel` + `StockMovement`, not by putting it in its own container.
Once those tables exist with a real ledger, the chaos is gone and the extraction question becomes
genuinely open — on the merits, at that point, not before.

**Second counter-argument: "separate services are more resilient."** False here. Separate Inventory
is a *strictly less* available checkout path, because it converts a local transaction into a network
dependency. Independence is a benefit you get from deployment and scaling, which co-location
preserves. It is not a benefit you get from isolation.

### 1.5 Triggers that would flip this decision

Write these down now so the decision is revisited on evidence, not on opinion:

| Trigger | Why it would matter |
|---|---|
| A warehouse/WMS/ERP integration is introduced | External dependency = genuine autonomous lifecycle = real boundary |
| Multi-warehouse or multi-region stock is introduced | Cross-region stock coordination cannot live in one local transaction |
| Stock write volume exceeds order volume by >10x (e.g. high-frequency reservations, live drop events) | Creates an independent scaling axis |
| Inventory gets its own team, on-call rotation, or SLA | Operational ownership justifies the operational cost |
| A non-commerce consumer needs inventory (a partner API, an in-store POS) | Two callers with different needs = a real contract |

Until one of these fires, **Inventory stays a module.**

---

## 2. Event Backbone: Postgres Outbox → Redis Streams

### 2.1 What the actual scale is

Decisions must match the workload. Measured from the codebase and deployment:

| Metric | Value | Source |
|---|---|---|
| Backend code | 2,732 LOC, 6 apps | `ARCHITECTURE_ANALYSIS.md` §1.2 |
| Customer endpoints | 27 | `config/urls.py` |
| Admin endpoints | 18 | `config/urls.py` |
| Celery tasks in the entire system | 2 | `accounts/tasks.py`, `orders/tasks.py` |
| Infrastructure | 1 EC2 `t3.micro`, 1 Postgres, 1 Redis | `docker-compose.yml` |
| Worker concurrency | 2 | `docker-compose.prod.yml` |

**Derived event volume.** This is a single-brand DTC sneaker store, not a marketplace. Assume a
generous upper bound of **500 orders/day** and 50,000 sessions/day.

| Event | Volume/day | Rate (avg) |
|---|---|---|
| `OrderPlaced` | 500 | 0.006/s |
| `OrderStatusChanged` | ~1,500 (3 transitions per order) | 0.017/s |
| `OrderCancelled` | ~50 | <0.001/s |
| `ProductUpdated` | ~10 (admin edits) | <0.001/s |
| **Total domain events** | **~2,050** | **~0.025/s** |
| Peak (assume 10x daily average) | — | **~0.25/s** |

**Sustained throughput requirement: ~0.25 events/second at peak.** Total event data per day is
roughly 2 MB.

### 2.2 Comparison

| Option | Throughput headroom | Ops burden | New stateful infra | Durable history | Consumer groups | DLQ | Verdict |
|---|---|---|---|---|---|---|---|
| **Kafka** | 1M+/s (**~4,000,000x** headroom) | **High** — JVM, KRaft/ZooKeeper, tuning, partition rebalancing | **Yes** (JVM broker, ~512MB–1GB heap minimum) | Excellent (retention + compaction) | Excellent | Native | **Reject — absurd overkill** |
| **RabbitMQ** | 50k+/s | Medium — Erlang VM, memory alarms, plugin management | **Yes** | Yes (via quorum queues) | Good (exchange-bound) | **Native, excellent** | **Reject — best broker, unjustifiable new service** |
| **NATS + JetStream** | 1M+/s | **Low** — single ~20MB binary, no JVM | **Yes** (small) | Good (file streams, max-age) | Subjects (better model than queues) | Good (`max-deliver` + advisories) | **Runner-up — genuinely viable** |
| **Redis Streams** | 100k+/s | **Low** — **already deployed, monitored, password-protected** | **No** | Yes **if AOF enabled**; otherwise recoverable from outbox | Good (`XREADGROUP`/`XACK`) | **No native DLQ** — implement in app | **Choose** |
| Postgres outbox table **as** the queue | ~1k/s (contention-bound) | Very low | **No** | Excellent (it is the DB) | Manual (one queue table per consumer) | Manual | **Rejected — see 2.4** |

### 2.3 Why not Kafka

Kafka's design point is sustained high throughput with replay and partitioning. The requirement
here is **0.25 events/second** — roughly one event every four seconds. Running Kafka would mean
operating a JVM-based distributed log to move two megabytes per day.

Worse, Kafka's real costs are the ones least affordable here: a JVM broker with a memory floor that
does not fit comfortably alongside Postgres, Django, and Redis on a small instance; partition
rebalancing, consumer-group rebalancing, and retention tuning; and a second distributed system's
failure modes — including the scenario where Kafka is down and orders silently stop being
published. **Kafka would reduce availability, not increase it.**

Using Kafka because the project is "a microservices migration" is cargo-culting. The correct test is
"does the problem require it," and the answer is four orders of magnitude of no.

### 2.4 Why the outbox is a *pattern*, not a *broker*

An important correction to how this is often framed: **"PostgreSQL transactional outbox" and a broker
are not alternatives — they are two halves of one design, and the outbox is mandatory regardless of
transport.**

The problem: an event must be published atomically with the state change that caused it. Publishing
to a broker inside a database transaction is **not atomic**:

```
BEGIN;
  UPDATE stock_level SET available = available - 1 WHERE ...;   -- commits
  XADD sneakin:<env>:events * ...                                  -- broker unreachable
COMMIT;   -- stock decremented, customer never told, no record that this happened
```

Any dual write has a failure window. The only fix is to write the event to the **same database** as
the state change, inside the same transaction, then relay it:

```
BEGIN;
  UPDATE stock_level SET available = available - 1 WHERE ...;
  INSERT INTO outbox (event_id, type, payload, correlation_id, created_at)
    VALUES (uuid, 'OrderPlaced.v1', ..., ...);
COMMIT;   -- both durable, atomically
```

So: **outbox table = durability + atomicity (in Postgres). Streams = transport + fan-out.**
Choosing Redis Streams is choosing the transport, not skipping the outbox.

**Rejected: using the outbox table itself as the queue.** It has one real advantage (zero new
infrastructure, perfect durability). But it forces **one queue table per consumer group**, and
`OrderPlaced` has three consumers (cart-clear, engagement, reporting). Three queue tables, three
independent poll loops, three sets of retry state, and a schema migration every time a fourth
consumer appears — to avoid a broker that is already running. The operational tax of N consumer
tables grows linearly; the benefit is small. **Reject.**

**Rejected: using Celery for domain events.** Celery tasks are *commands* — "send this email."
Domain events are *facts* — "this order was placed." The differences that matter: Celery has one
target per task (no fan-out), no durable queryable history (so you cannot rebuild a read model by
replaying), and retention tied to the result backend. Using Celery as an event bus means
reconstructing the event-sourcing primitives on top of a task queue. Keep them separate.

### 2.5 The decision

> **PostgreSQL transactional outbox (durability + atomicity) → Redis Streams 7 (transport +
> fan-out), with consumer groups and `XAUTOCLAIM`.**

| Layer | Choice | Rationale |
|---|---|---|
| Outbox | Postgres table in the **producing** service's own database | Guarantees atomicity with the state change. No cross-DB coordination |
| Relay | Per-service process, `SELECT … FOR UPDATE SKIP LOCKED`, batch publish, mark published | Simple, horizontally safe, no extra infra |
| Transport | Redis Streams, **one stream per environment** (`sneakin:<env>:events`, where `<env>` is `floci`, `staging`, or `production`), one of four fixed consumer groups (I §8.2) | Already deployed and operated; consumer groups give at-least-once fan-out; `XAUTOCLAIM` reclaims orphaned pending entries |
| Retention | `MAXLEN ~ 50000` approximate trim | ~7 days of headroom at current volume |
| Dead letters | **Application-level `dead_letters` table + alert**, not a broker DLQ | Redis Streams has no native DLX. Since the consumer needs Postgres anyway, an app-level DLQ is more reliable — it survives Redis restarts and is queryable |
| Consumer dedup | `(event_id, consumer_name)` primary key in `processed_events` | Makes at-least-once delivery safe |

### 2.6 Redis persistence — a real gap this exposes

Current prod config is `redis-server --requirepass …` (`docker-compose.prod.yml:49`).

**There is no `appendonly` and no `save` directive.** Redis in production persists nothing to disk.
If Redis restarts, all in-flight Streams entries are gone.

This does **not** make the design unsafe, because of a property worth stating explicitly:

> **Redis is a transport buffer, not the source of truth. The outbox table is the source of truth.**

Recovery procedure: on detecting a Redis flush or cold start, consumers reset their offsets and the
relay republishes every unacknowledged outbox row. Events are re-derived from Postgres. Nothing is
lost, because nothing was ever only-in-Redis.

**Required change (Phase 0):** enable `appendonly yes` with `appendfsync everysec`, and set
`maxmemory-policy noeviction`. `noeviction` is important — if Redis evicts stream entries under
memory pressure, delivery breaks. Set it explicitly rather than inheriting the default.

### 2.7 When to revisit

| Trigger | Move to |
|---|---|
| Sustained >100 events/s, or >50k events/day | **NATS JetStream** — smallest footprint, subject model, built-in redelivery |
| Need >3 consumer groups with independent retention/ordering guarantees | **RabbitMQ** (commands) or Kafka (if replay dominates) |
| Redis operational burden becomes a real burden (a dedicated ops owner exists) | Re-evaluate freely; the outbox is unaffected |

The outbox pattern is transport-agnostic, so switching brokers later is a relay-only change. That
is the point of doing it this way.

---

## 3. Checkout: Exact Design

### 3.1 The core insight

Because **Inventory lives inside Commerce** (§1), checkout does **not** need a distributed
transaction. It needs one local ACID transaction and a relay.

Compare the two candidate designs:

| | Previous proposal (separate Inventory) | This design (co-located) |
|---|---|---|
| Stock decrement | Remote call to Inventory | `UPDATE` in the local transaction |
| Order create | Second remote call / second commit | Same transaction as the decrement |
| Atomicity | Saga + compensations + reconciliation | **Guaranteed by Postgres** |
| Failure window | Order exists, stock not released | **Does not exist** |
| Network calls on critical path | 2+ (Catalog read, Inventory reserve) | **0** |
| Compensation complexity | 3 compensating actions, idempotency everywhere | **1 forward operation** (cancellation) |
| Reconciliation job | Required | Not required |

**The previous design introduced a distributed transaction and then spent three sections managing
it. Co-location eliminates it.** Everything below follows from that.

### 3.2 Scope of the checkout transaction

Inside **one** transaction, in **one** database:

1. Idempotency claim
2. Lock cart rows
3. Lock + conditionally decrement stock
4. Write `order` + `order_item`
5. Append outbox events
6. Complete the idempotency record

Outside the transaction, asynchronous: clear cart, notify, update read models.

### 3.3 Commands

Commands are **synchronous, intra-service function calls**. No RPC. They may only be exposed as an
HTTP endpoint if they represent an inbound request.

| Command | Direction | Idempotent? | Notes |
|---|---|---|---|
| `PlaceOrder(userID, cartID, paymentMethod, address, idempotencyKey)` | Client → Commerce | **Yes**, via `Idempotency-Key` | The only write on the checkout critical path |
| `ReserveForOrder(orderID, lines)` | Internal (checkout only) | Yes | **Not** a remote endpoint. Never an RPC |
| `ReleaseForOrder(orderID, lines)` | Internal (cancellation only) | Yes, via `(order_id)` unique key | Forward business operation, not a compensation |
| `CancelOrder(orderID, actor, reason)` | Client → Commerce | Yes | Customer or admin |
| `TransitionOrderStatus(orderID, target)` | Admin → Commerce | Yes | Guards the state machine |
| `AdjustStock(productID, size, delta, reason)` | Admin → Commerce | **No** — inherently a new adjustment | Appends a `stock_movement`; never an absolute set |
| `ClearCartForOrder(orderID, correlationID)` | `CheckoutCompleted` consumer → self | Yes — `DELETE` is naturally idempotent | |

### 3.4 The transaction, precisely

```
POST /api/v1/orders        Idempotency-Key: <client UUID>
Authorization: Bearer <JWT>

── T0. Idempotency claim ───────────────────────────────────────────────
INSERT INTO idempotency_keys (key, user_id, request_hash, state, created_at)
     VALUES ($1, $2, $3, 'IN_PROGRESS', now())
ON CONFLICT (key) DO NOTHING;

  0 rows inserted AND state = 'COMPLETED'
      → RETURN the stored response verbatim, HTTP 200. No side effects.
  0 rows inserted AND state = 'IN_PROGRESS'
      → a concurrent identical request is mid-flight.
        Return HTTP 409 + Retry-After: 1. (Do NOT block; see §3.8 F1.)
  0 rows inserted AND request_hash != $3
      → HTTP 422: idempotency key reused with a different body.
  1 row inserted
      → proceed.

── T1. Lock the cart, in a deterministic order ────────────────────────
SELECT ci.product_id, ci.size_value, ci.quantity,
       ci.unit_price_snapshot, ci.product_name_snapshot
  FROM cart_item ci
 WHERE ci.cart_id = $1
 ORDER BY ci.product_id, ci.size_value          -- deterministic: no deadlocks
   FOR UPDATE;

  0 rows → HTTP 409 "cart is empty". ROLLBACK.

── T2. Lock the stock rows, in the SAME deterministic order ────────────
SELECT product_id, size_value, available
  FROM stock_level
 WHERE (product_id, size_value) IN (…)         -- all lines, one statement
 ORDER BY product_id, size_value
   FOR UPDATE;

  Locking order must MATCH T1's ORDER BY. Two differently-ordered
  SELECT ... FOR UPDATE over overlapping key sets is a textbook deadlock.

── T3. Conditional decrement — THE ONLY place available changes ───────
UPDATE stock_level
   SET available = available - $q,
       version    = version + 1,
       updated_at = now()
 WHERE product_id = $p
   AND size_value = $s
   AND available  >= $q;                        -- guard is IN the predicate

  rows_affected = 0 for any line → ROLLBACK, HTTP 409
  { "error": "insufficient_stock",
    "lines": [ { "product_id": …, "size": …, "requested": 3,
                 "available": 1 } ] }

  This single statement is the concurrency control. NOT a read-then-write.
  It fixes the live D1 bug: today orders/views.py:65-70 reads, then :97-100
  writes, with no lock — two concurrent checkouts oversell, and because
  `stock` is PositiveIntegerField the negative value raises IntegrityError
  at COMMIT, so the customer gets a 500 instead of a clean 409.

── T4. Append to the ledger (same transaction, before the order) ───────
INSERT INTO stock_movement (product_id, size_value, delta, reason,
                            order_id, correlation_id, created_at)
SELECT …, -quantity, 'order_placed', $order_id, $correlation_id, now() …;

── T5. Write the order ────────────────────────────────────────────────
INSERT INTO orders (id, user_id, status, payment_method,
                    total_amount, shipping_address, correlation_id, created_at)
VALUES ('pending', …);
INSERT INTO order_item (order_id, product_id, size_value, quantity,
                        unit_price, product_name, product_image)
SELECT …;                      -- from T1's SNAPSHOT columns

  Prices come from cart_item snapshots, NEVER from catalog.
  There is no call to Catalog anywhere in this transaction.

── T6. Append outbox events (same transaction) ─────────────────────────
INSERT INTO outbox (event_id, type, version, aggregate_type, aggregate_id,
                    correlation_id, payload, created_at) VALUES
  ($uuid1, 'OrderPlaced.v1',    1, 'order', $order_id, $cid, {…}),
  ($uuid2, 'CheckoutCompleted.v1', 1, 'order', $order_id, $cid, {…});

── T7. Complete the idempotency record ────────────────────────────────
UPDATE idempotency_keys
   SET state = 'COMPLETED', response_body = $json, completed_at = now()
 WHERE key = $1;

COMMIT;
```

**HTTP 201** with the order body. Nothing else is on this path.

### 3.5 Cart price snapshots — a required prerequisite

`ARCHITECTURE_ANALYSIS.md` §3.1 flagged this; it deserves to be stated as a hard requirement,
because it is what removes Catalog from the critical path entirely.

**Today:** `cart/serializers.py:16` computes `obj.product.price * obj.quantity` and line 29 sums
over `obj.items` — both read the **live** product row on every cart render. Cart has no price of its
own.

**Required change (Phase 0):** `cart_item` gains `unit_price_snapshot`, `product_name_snapshot`,
`product_image_snapshot`, captured at add-to-cart time.

**Consequence:** checkout needs **zero** synchronous calls to Catalog. A Catalog outage during
checkout is impossible to observe by the checkout path. This is the highest-leverage single change
in the entire migration, and it is a pure refactor — no new service, no new contract.

**The staleness question, answered.** If Catalog's price changes while an item sits in the cart,
the cart shows the old price. Handle it by event, not by call: `PriceChanged.v1` → Shopping
consumer updates `unit_price_snapshot` for matching open carts and marks the cart `price_dirty=true`.
The frontend already re-renders cart totals from the server response
(`ShopContext.jsx:99-106`), so a repriced cart displays correctly on next load with no frontend
change. For a store with ~2,050 events/day this is trivially cheap.

**Alternative rejected:** re-read the catalog price at checkout. It makes the displayed total and
the charged total potentially different, forces a trust decision the frontend cannot make, and adds
a network hop to the critical path to solve a problem that event-driven repricing solves better.

### 3.6 Events

All events use the envelope from `ARCHITECTURE_ANALYSIS.md` §7.2.

| Event | Emitted at | Payload | Consumers |
|---|---|---|---|
| `OrderPlaced.v1` | T6 | `order_id, user_id, status, payment_method, total_amount, currency, lines[{product_id, size, qty, unit_price, name}], placed_at, correlation_id` | Engagement, Reporting, (future Analytics) |
| `CheckoutCompleted.v1` | T6 | `order_id, user_id, cart_id, item_count, correlation_id` | Cart-clear consumer (**self**) |
| `OrderCancelled.v1` | CancelOrder, post-commit | `order_id, cancelled_by, reason, lines[{product_id, size, qty}], correlation_id` | Engagement, Reporting |
| `OrderStatusChanged.v1` | TransitionOrderStatus, post-commit | `order_id, from_status, to_status, actor, correlation_id` | Engagement, Reporting |
| `StockAdjusted.v1` | AdjustStock, post-commit | `product_id, size, delta, remaining, reason, actor` | Reporting, (future reorder) |
| `LowStockDetected.v1` | Inside T3, when `available` crosses threshold | `product_id, size, available, threshold` | Engagement — **activates the currently-dead `low_stock` notification type** |
| `UserRegistered.v1` | Identity | `user_id, email, name` | Engagement (welcome email + admin alert), Reporting |

**Note what is absent:** there is no `InventoryReserved.v1` and no `InventoryReserveFailed.v1`.
Those existed only because Inventory was a separate service. With co-location, reservation is not an
observable event — it is an internal step of a transaction that either commits or does not.
**Emitting an event for a transaction-internal step is noise.**

`StockAdjusted.v1` is deliberately not a general "stock changed" event: it fires only for
human-initiated adjustments, which is the only case a consumer needs to distinguish.

### 3.7 State transitions

**Order** (matches the existing frontend contract exactly — no SPA changes):

```
                    ┌──────────────────┐
   place order ────▶│      PENDING     │
                    └────────┬─────────┘
                             │ admin: confirm
                    ┌────────▼─────────┐
                    │    CONFIRMED     │
                    └────────┬─────────┘
                             │ admin: ship
                    ┌────────▼─────────┐
                    │     SHIPPED      │
                    └────────┬─────────┘
                             │ admin: deliver
                    ┌────────▼─────────┐
                    │    DELIVERED  ◀──┴─ terminal
                    └──────────────────┘

   PENDING | CONFIRMED ──cancel──▶ ┌──────────────┐
                                   │  CANCELLED   │ terminal
                                   └──────────────┘
```

**Enforced in one place** — a transition table in the order package, not scattered across
`orders/views.py:24-48` and `orders/admin_views.py:76-102`. The current duplication (defect D3) is
two implementations with different guard sets and different notification behaviour; consolidating
them into one table is what makes the state machine testable.

| From | Allowed targets |
|---|---|
| `PENDING` | `CONFIRMED`, `CANCELLED` |
| `CONFIRMED` | `SHIPPED`, `CANCELLED` |
| `SHIPPED` | `DELIVERED` |
| `DELIVERED` | — (terminal) |
| `CANCELLED` | — (terminal) |

**Stock model — a deliberate simplification.**

| Option | Semantics | Verdict |
|---|---|---|
| **On-hand decrement (chosen)** | `available` drops at order placement; cancellation adds it back | **Choose.** Matches current behaviour exactly. Zero migration risk. One column, one invariant. |
| Reservation model | `on_hand` static, `reserved` rises, `available = on_hand - reserved`; reservations expire | Deferred. Correct for high-abandonment flows, but requires a reaper, an expiry timer, and a new table for a problem this store does not yet have |

The reservation model is the textbook answer and it *is* more correct in the abstract. It is
rejected here because it adds a time-based component — the failure mode of an expiring reservation
that fails to release is **permanently lost stock**, which is worse than the problem it solves.
Choose it when measurement shows abandoned-order-driven stock loss is real, and record that as a
trigger.

`reserved` is kept as a nullable future column so the migration does not need it later.

**Stock states** (co-located with the order state, inside one transaction):

| Transition | Stock effect | Where |
|---|---|---|
| `PENDING` created | `available -= qty`, `stock_movement(delta=-qty, reason='order_placed')` | T3/T4 |
| → `CONFIRMED` | none | — |
| → `SHIPPED` | none | — |
| → `DELIVERED` | none (stock already out) | — |
| → `CANCELLED` | `available += qty`, `stock_movement(delta=+qty, reason='order_cancelled')` | CancelOrder |
| Admin adjust | `available += delta` | AdjustStock |

### 3.8 Idempotency

Three distinct mechanisms, for three distinct concerns:

| Concern | Mechanism | Storage |
|---|---|---|
| Client double-submit / retry | `Idempotency-Key` HTTP header, client-generated UUID | `idempotency_keys(key PK, user_id, request_hash, state, response_body, created_at)` |
| Duplicate event delivery | `event_id` from the envelope | `processed_events(event_id, consumer_name, processed_at, PK(event_id, consumer_name))` |
| Duplicate stock release | Natural key on the business object | `stock_released(order_id UNIQUE)` — `INSERT … ON CONFLICT DO NOTHING` guards the whole release |

**Idempotency key generation is a frontend change** (Phase 0 or 1): generate a UUID once per
checkout attempt in `PlaceOrder.jsx` and hold it in `sessionStorage`, keyed by cart fingerprint.
Retry the **same** key after a network error; generate a new one after a successful order or a
changed cart. Today `PlaceOrder.jsx:49` retries blindly, which means a double-click or a client
timeout can already produce two orders in the monolith. **This is a pre-existing bug that the
idempotency mechanism fixes.**

**Retention:** `idempotency_keys` pruned after 7 days; `processed_events` after 30 days.
`idempotency_keys` in particular grows without bound otherwise — worth a `DELETE … WHERE created_at
< now() - 7 days` on the relay's existing schedule.

### 3.9 Retries

| Hop | Retry? | Policy |
|---|---|---|
| Client → Commerce | **Yes, unlimited** | Idempotency key makes this safe. Recommend exponential backoff to 30s in the SPA |
| Commerce → (nothing) | N/A | **Zero outbound service calls on the checkout path** |
| Outbox relay → Redis | **Yes, forever** | The row is not marked published until `XADD` succeeds. Backoff 1s→60s. No data loss is possible |
| Consumer → Postgres | Yes, bounded | 5 attempts, exponential backoff, then `dead_letters` + alert |
| Consumer → Redis | Yes | `XACK` only after the database commit succeeds. On failure, do not ack — `XAUTOCLAIM` redelivers |

**The ordering rule that matters:** *acknowledge only after the database commits.* Acking first and
then failing loses the event permanently. This is the single most common mistake in
stream-consuming systems and it is why the outbox + idempotent consumer combination is required
rather than merely nice.

### 3.10 Timeouts

| Timeout | Value | Rationale |
|---|---|---|
| Edge → Commerce (checkout) | 10s | One transaction; p99 should be <200ms. 10s is a safety ceiling, not a target |
| Edge → Commerce (reads) | 5s | — |
| Outbox relay cycle | 1s poll, **200ms** max batch latency | Events are consumed by humans, not by code on a hot path |
| Consumer processing deadline | 30s per event | Longer than the relay, shorter than a human's patience |
| Redis `XAUTOCLAIM` visibility | 60s | A crashed consumer's events are reclaimed in 60s. Comfortably longer than normal processing |
| Idempotency `IN_PROGRESS` lock | 30s | If a request dies mid-transaction, the row rolls back and disappears. A stuck `IN_PROGRESS` means the process died *after* commit of the claim — so the TTL must exceed the transaction timeout |

**There are no cascading service timeouts to reason about, because there are no service-to-service
calls in this path.** That is the operational payoff of co-location: the classic cascading-timeout
failure mode of microservice checkout is structurally absent.

### 3.11 Compensating actions

**There is none in the checkout path, and that is the design, not an omission.**

| Situation | Why no compensation is needed |
|---|---|
| Stock decrement succeeds, order insert fails | Same transaction. Both roll back |
| Stock decrement fails for one line | `rowcount == 0` → ROLLBACK. No partial decrement is possible |
| Outbox insert fails | ROLLBACK. The event and the state change are atomic |
| Client disconnects mid-request | Transaction completes or rolls back independent of the socket. The idempotency key makes the retry safe |
| Order created, then the relay is down | Outbox row persists. Delivered when the relay recovers |

The only "compensating" action in the system is **cancellation**, and it is not a compensation — it
is a **forward business operation** requested by a human. It happens hours or days later, produces
its own event, and is guarded by `stock_released(order_id UNIQUE)`.

| Operation | Idempotency guard |
|---|---|
| `ReleaseForOrder(orderID)` | `INSERT INTO stock_released(order_id) VALUES ($1) ON CONFLICT DO NOTHING`; if 0 rows, return early. Then `stock_movement` + `UPDATE stock_level` + outbox, all in one transaction |

**Compare with the previous proposal,** which required an `inventory.release` compensation on
"order write failed after successful reserve." That branch **does not exist here**, because the two
writes share a transaction. The entire class of "reconciliation job that runs at 3am to find orders
whose stock was never released" is eliminated.

### 3.12 Failure scenarios

| # | Scenario | Detection | Behaviour | Client sees |
|---|---|---|---|---|
| F1 | Duplicate submit (double-click) | `ON CONFLICT` on idempotency key | Second request replays stored response | 201, **same order** |
| F2 | Client timeout, server committed | Same key on retry | Replays stored response | 200 with the real order. **No duplicate** |
| F3 | Stock insufficient on one line | `rowcount == 0` | ROLLBACK; no order, no stock change, cart intact | 409 with per-line detail |
| F4 | **Concurrent checkout of the last unit** | Row lock serializes at T2; conditional update at T3 | Exactly one commits; the other gets `rowcount == 0` | 201 / 409. **Never a 500, never oversold** |
| F5 | Cart empty at checkout | 0 rows at T1 | ROLLBACK | 409 |
| F6 | Cart belongs to another user | FK check at T0/T1 | ROLLBACK | 404 (not 403 — do not confirm the cart exists) |
| F7 | Commerce process dies mid-transaction | Postgres aborts the transaction | Clean rollback; no idempotency row survives | 502/504; retry with same key is safe |
| F8 | Redis down at T6 | `XADD` fails in the **relay**, not at T6 | Outbox row persists; relay retries forever. **Checkout is unaffected** | 201 normally. **Checkout does not depend on Redis** |
| F9 | Engagement consumer down | Consumer lag metric | Orders unaffected; notifications appear when it recovers | No impact |
| F10 | Cart-clear consumer down / event lost | Consumer lag metric | Order exists; cart still shows items | User may see a stale cart. **Low harm** — the order is real, and `OrderPlaced` reaching Engagement proves the order |
| F11 | Dead letter after 5 failed consumer attempts | `dead_letters` table + alert | Event parked; dashboard shows stale data | Admin sees "data may be stale" |
| F12 | Postgres unavailable | `/readyz` fails | Traffic shed by edge. Gunicorn-equivalent restarts **nothing** — readiness only | 503. **No connection storm** |
| F13 | Price changed after add-to-cart | `PriceChanged.v1` | Cart snapshot updated async; checkout charges the new price | Total updates on next load |

**F4 is the important one.** It is the scenario the current monolith gets wrong
(ARCHITECTURE_ANALYSIS.md §1.6 D1) and it is covered by a required test in §12.5.

**F8 deserves emphasis:** because the outbox write is a Postgres insert inside the transaction and
Redis is touched only by the separate relay, **Redis failure cannot affect checkout at all.** In the
previous proposal Redis was on the critical path via Celery. That dependency is gone.

---

## 4. Data Ownership: Table by Table

### 4.1 The rule

> **Every table has exactly one owning service. That service is the only writer. No service reads
> another service's tables. No cross-service foreign keys exist, ever.**

This is the rule that makes the rest work. A cross-service FK is a permanent synchronous
dependency disguised as a column: `OrderItem.product → products_product` means Commerce cannot
change its schema without coordinating with Catalog, and deleting a product cascades into order
history. These must all be broken (§4.4).

### 4.2 Ownership map

Four databases. Note that `commerce` holds four tables that the previous analysis spread across
three services — that consolidation *is* the co-location decision.

**Database 1 — `identity` (Django, the residual monolith)**

| Table | Owner | Notes |
|---|---|---|
| `accounts_customuser` | Identity | Email login (`USERNAME_FIELD`), `role`, `is_staff`, `is_active`. **JWT issuer** |
| `token_blacklist_outstandingtoken` | Identity | SimpleJWT refresh tracking. Accesses Identity only |
| `token_blacklist_blacklistedtoken` | Identity | Logout/revocation. **Revocation currently works only because every request hits Django** (§6.4) |
| `auth_permission`, `auth_group`, `django_admin_log`, `django_content_type`, `django_migrations`, `auth_user_groups` | Identity | Django internals |
| `django_celery_beat_*` (7 tables) | Identity | Beat schedule for the daily sales report. Migrates to the worker in Phase 2 |

**Database 2 — `catalog` (Go)**

| Table | Owner | Notes |
|---|---|---|
| `products_brand` | Catalog | |
| `products_category` | Catalog | |
| `products_subcategory` | Catalog | |
| `products_product` | Catalog | **But `stock`, `in_stock` are dropped** — see §4.3 |
| `products_productimage` | Catalog | |
| `products_productsize` | Catalog | **Becomes the size catalog only** (`size_value`). Its `stock` column is dead today (D6) and is not migrated |

**Database 3 — `commerce` (Go) — the transactional core**

| Table | Owner | Notes |
|---|---|---|
| `cart_cart` | Commerce | `user` FK becomes opaque `user_id bigint` |
| `cart_cartitem` | Commerce | **+3 snapshot columns** (§3.5). `product` FK becomes `product_id bigint` |
| `wishlist_wishlist` | Commerce | `user`/`product` FKs become opaque ids. **Note:** Wishlist is Commerce-adjacent (it is a pre-purchase collection), but it needs none of Checkout's consistency guarantees — it could equally live in Catalog. Kept here to reach the goal in §7 of emptying the monolith |
| `orders_order` | Commerce | `user` FK becomes opaque `user_id bigint`. **+ `correlation_id`** |
| `orders_orderitem` | Commerce | `product` FK becomes `product_id bigint`. Already has `product_name`, `product_image`, `price` snapshots |
| `stock_level` | Commerce | **New.** `(product_id, size_value)` PK, `available`, `reserved` (nullable, unused), `version`, `updated_at` |
| `stock_movement` | Commerce | **New.** Immutable ledger. Fixes D4/W4 |
| `stock_released` | Commerce | **New.** `order_id` PK. Idempotency guard for cancellation |
| `idempotency_keys` | Commerce | **New.** §3.8 |
| `outbox` | Commerce | **New.** §2.5 |

**Database 4 — `engagement` (Go worker)**

| Table | Owner | Notes |
|---|---|---|
| `notifications_notification` | Engagement | `recipient` FK becomes opaque `user_id`. Nullable = broadcast-to-admins; keep, it is used |
| `dead_letters` | Engagement | **New.** App-level DLQ (§2.5). Also used by Catalog and Commerce — one table per service |

**Database 5 — `reporting` (Go worker)**

| Table | Owner | Notes |
|---|---|---|
| `fact_order` | Reporting | Built from `OrderPlaced`/`OrderStatusChanged`/`OrderCancelled` |
| `fact_product_daily` | Reporting | Built from order events |
| `dim_date`, `dim_product` | Reporting | Local projections. `dim_product.product_id` is an opaque id, **not** an FK |

> **Database count is 5, not 4** — `engagement` and `reporting` are separate databases inside one
> `workers` process. They are separate because they have different retention, different backup
> needs, and different growth (notifications grow forever; rollups are small). One process, two
> schemas, no cross-schema reads. Split into two processes when either needs independent scaling.

### 4.3 Stock leaves the Catalog database

**Decision: `products_product.stock` and `products_product.in_stock` do not migrate to the `catalog`
database. `products_productsize.stock` is dropped entirely (it is dead — D6).**

| From | To | Why |
|---|---|---|
| `products_product.stock` | `stock_level` (Commerce) | Stock is inventory data, not catalog data. Keeping a `stock` column in Catalog means two services write product data, or someone must replicate it — reintroducing the split decision made in §1 |
| `products_product.in_stock` | **dropped** | A boolean that must be kept in sync with `available > 0` is a derived value. It has already drifted. Replace with `available > 0`, computed in the Catalog read response from the `reporting`/availability projection (§5.4) |
| `products_productsize.stock` | **dropped** | Nothing reads or writes it (D6). Migrating dead data to a new service is how ghosts appear in new architectures |
| `products_productsize.size_value` | `products_productsize` (Catalog) | Genuine catalog data — which sizes exist for a product |
| `stock_level(product_id, size_value)` | Commerce | **No FK to Catalog.** This is what makes the module boundary real (§1.2) |

`Catalog` still needs to *show* availability to customers. It does not read `stock_level`
directly — §5.4 explains how availability reaches it. This is the one place where a naive
extraction would create a synchronous Catalog → Commerce dependency on the **product list path**,
which is the hottest read path in the system. It must be avoided.

### 4.4 Foreign keys that must be broken

Seven cross-boundary FKs exist today. Each is a hard coupling; each must become an opaque integer.

| # | FK | `on_delete` | Risk today | Becomes |
|---|---|---|---|---|
| 1 | `orders_order.user` → `accounts_customuser` | `CASCADE` | Deleting a user silently deletes order history | `user_id bigint` |
| 2 | `orders_orderitem.product` → `products_product` | `SET_NULL` | Deleting a product erases the product reference on historical orders. **The order total no longer reconciles with its line items** (D4) | `product_id bigint` |
| 3 | `cart_cart.user` → `accounts_customuser` | `CASCADE`, `OneToOne` | | `user_id bigint UNIQUE` |
| 4 | `cart_cartitem.product` → `products_product` | **`CASCADE`** | **Deleting a product silently destroys customers' carts.** A product goes out of stock → admin deletes it → carts are wiped (D4) | `product_id bigint` |
| 5 | `wishlist_wishlist.user` → `accounts_customuser` | `CASCADE` | | `user_id bigint` |
| 6 | `wishlist_wishlist.product` → `products_product` | **`CASCADE`** | Same cart-wipe path for wishlists (D4) | `product_id bigint` |
| 7 | `notifications_notification.recipient` → `accounts_customuser` | `CASCADE` | Deleting a user deletes their notification history | `user_id bigint NULL` |

**Note FK #2 specifically.** `OrderItem.product_name` and `product_image` are already snapshots —
the right instinct was already present. But `unit_price` is stored as `price` while the *product
row* is nullable and deletable, so the order line is half-snapshot and half-reference. Making
`product_id` a plain integer completes the snapshot: an order line becomes fully self-describing
and permanent, which is exactly what a historical order should be.

**Enforcement after migration:** a CI check that no `commerce` migration contains a FK to a
`catalog` or `identity` table. Cheap to write, catches regressions permanently.

### 4.5 Caches

| Cache | Owner | Contents | Invalidation |
|---|---|---|---|
| Catalog read cache | Catalog | Product list/detail responses (1–5 min TTL) | TTL + `ProductUpdated.v1` |
| Availability cache | Catalog | `product_id → available`, 30–60s TTL | `StockChanged.v1` |
| No cached user data in Commerce | — | Commerce needs only `user_id` from the JWT | — |

**Explicitly rejected: Redis as a shared cache across services.** A shared cache with per-service
namespacing is a second, invisible coupling — services read state they do not own, staleness becomes
unpredictable, and invalidation becomes a distributed problem. Caches belong to the service that
owns the data, and only that service reads them.

### 4.6 The rule for data that must be copied

Some data appears in more than one place (order lines in Commerce, order facts in Reporting, product
availability in Catalog). That is fine. The rules:

| Rule | Reason |
|---|---|
| Never write a copy you own | Only the owning service writes its own tables |
| A copy is always replaceable | If it can be rebuilt from events, losing it is recoverable — not a data-loss incident |
| A copy is allowed to be stale; the source is not | Latency in ms–s is acceptable. Inconsistent *sources* are not |
| Every copy records its `event_id` | Enables deduplication and rebuilds |

---

## 5. Communication Matrix

### 5.1 Classification rule

Every inter-component interaction is exactly one of three kinds. The classification is a design
decision with a test attached, not a matter of taste.

| Kind | Test | Consequence of getting it wrong |
|---|---|---|
| **Internal (in-process)** | Must share a transaction with something else? Then internal, always | — |
| **Synchronous (HTTP)** | Is the caller *unable to make progress* without the answer **now**? | A synchronous call on a fan-out path multiplies latency by the fan-out and makes partial failure possible |
| **Asynchronous (event)** | The caller could act correctly with data from a minute ago, or the answer is a notification to a human | Synchronous couples availability; a hot path now depends on an unrelated service's uptime |

### 5.2 The matrix

| From | To | Interaction | Why this kind |
|---|---|---|---|
| SPA | Edge (Nginx) | HTTP | Client entry point |
| Edge | Identity | HTTP | Login, refresh, register |
| Edge | Catalog | HTTP | Product browse. No transaction to join |
| Edge | Commerce | HTTP | Cart, wishlist, order |
| Commerce | Catalog | **None** | Prices come from cart snapshots (§3.5). **Zero calls** |
| Commerce | Identity | **None** | `user_id` comes from the JWT. **Zero calls** |
| Commerce | Redis | **None on the checkout path** | Relay is async. §3.12 F8 |
| Commerce → Postgres | — | **Internal, local** | Checkout transaction (§3.4) |
| Catalog → Postgres | — | Internal | |
| Identity | Postgres | Internal | |
| Commerce outbox relay | Redis | Async | `XADD`, retry forever |
| Engagement | Redis | Async consume | Notifications |
| Reporting | Redis | Async consume | Rollups |
| Reporting | Postgres | Internal | Own database |
| Engagement → Catalog | **None** | Reads a local product projection if needed | |
| Reporting → Commerce | **None** | Reads nothing; rebuilt from events | |
| Any service | Any other service, directly | **None** | Zero service-to-service HTTP calls in the entire target system |

**Total synchronous service-to-service calls: zero.**

This is the headline architectural property of the design. It is not achieved by avoiding features —
it follows from three decisions:

1. Inventory co-located with Ordering (§1) → no reserve/release RPC
2. Cart snapshots (§3.5) → no catalog read on checkout
3. JWT carries identity (§6) → no user lookup on any request

**What remains synchronous is only edge → service.** The reason: these are user-initiated requests
with a user waiting for an answer, so asynchronous is not an option. There is exactly one hop.

### 5.3 What the product page does without cross-service calls

The storefront product page today joins a lot. In the target system:

```
GET /api/v1/products?category=sneakers&page=1&limit=20
      → catalog DB (products, brands, categories, images, sizes)
      → availability overlay from catalog's local cache
      → 200
```

No Commerce call. No Redis call on the request path (the availability cache is read by Catalog
itself). One database query set, one hop.

### 5.4 How availability reaches Catalog without a call

Catalog must show "In stock: 3 (UK 8)". It cannot read `stock_level` (not its data) and must not
call Commerce (hot path).

**Decision:** the Commerce stock transaction writes an internal `StockChanged.v1` event; Catalog
maintains a local `product_availability` projection (a table in its own database, or a Redis hash it
alone owns).

| Concern | Resolution |
|---|---|
| Staleness | Up to 60s. For a storefront that is acceptable; for a checkout, the authoritative `stock_level` check is exact |
| Does a customer ever add to cart an out-of-stock item? | Yes, possibly. Cart add does a **best-effort** check against the cached value, and checkout enforces the truth. Correct behaviour: warn, don't block |
| Out-of-stock product still browsable? | Yes — showing sold-out products is good merchandising (and required for SEO). `available > 0` is a display concern |
| What if the projection is stale-high? | Customer reaches checkout and gets a clean 409 with restock info (§3.12 F3). Acceptable |
| What if the projection is stale-low? | Customer cannot buy something in stock. Self-corrects within 60s. Rare and harmless |

**Rejected: synchronous Catalog → Commerce availability check.** It puts the hottest read path in
the system behind the checkout-critical service's uptime. One slow checkout transaction would then
throttle all product browsing. This is the canonical way a "small" convenience dependency turns into
an outage.

### 5.5 Communication style

**All inter-service communication is HTTP + JSON. No gRPC, no protobuf, no message-oriented RPC.**

| Reason | Detail |
|---|---|
| Zero service-to-service calls (§5.2) | gRPC's main advantage — efficient internal calls — has nothing to apply to |
| 0.25 events/s (§2.1) | gRPC's throughput and latency advantages are irrelevant |
| Go's stdlib is HTTP-first | `net/http` + `encoding/json` need no framework. gRPC would add `protoc` codegen, a build step, and `.proto` files to a system with 27 endpoints |
| The frontend is JavaScript | gunicorn/DRF today, and the SPA talks JSON. JSON everywhere, one contract style |
| Debuggability | `curl` works. With gRPC you need `grpcurl` and reflection enabled to inspect a production system |
| Human review | JSON is reviewable in a pull request. Protobuf diffs are not |

**Revisit gRPC only if:** there are real synchronous inter-service calls, latency is measured as a
problem, and the team is willing to operate protobuf codegen. None of the three hold.

### 5.6 Sync vs async decision, applied

| Scenario | Current | Target | Reason |
|---|---|---|---|
| Checkout reads product price | 3-hop join / live price | **Local snapshot** | Removing a call from the write path |
| Checkout decrements stock | Local write (racy) | Local write (locked) | Already synchronous-safe; make it correct |
| Checkout clears cart | Inline | **Async** (`CheckoutCompleted.v1` → self) | Only cosmetic; F10 harm is near-zero |
| Order confirmation email | Synchronous call to Celery inside the transaction (D5) | **Async** (`OrderPlaced.v1` → Engagement) | Never call a message broker from inside a transaction — the D5 bug |
| Admin dashboard counts | 3 aggregate queries at request time | **Async** rollups in Reporting | Read model, no coupling |
| New-order notification | Synchronous `Notification.objects.create` inside the order transaction (D5) | **Async** | Same |
| Welcome email + admin notification | Synchronous `Notification.create` in the registration transaction (D5) | **Async** (`UserRegistered.v1`) | Same |
| Price change → reprice carts | N/A | **Async** (`PriceChanged.v1`) | §3.5 |
| Stock threshold crossing | Never (dead `low_stock` type) | **Async** (`LowStockDetected.v1`) | Activates dead code |
| Daily sales report | Celery beat + Celery task | Worker schedule + Reporting rollup | Same behaviour, one fewer runtime |

**Every row moved from "synchronous/inline" to "asynchronous" — and not one moved the other way.**
That is the pattern. The previous analysis left the sync `inventory.reserve` call in place; this
design removes it, which is what makes the sync surface empty.

---

## 6. Authentication and Authorization

### 6.1 Current state

| Property | Value | Source |
|---|---|---|
| Library | `djangorestframework-simplejwt` | `INSTALLED_APPS` |
| Signing | **HS256, symmetric shared secret** | `SIMPLE_JWT` settings |
| Access token TTL | 30 minutes | `settings/base.py` |
| Refresh token TTL | 7 days, rotation on | `settings/base.py` |
| Token revocation | Blacklist app, works | `token_blacklist` |
| `role` in claims | **No** | Only `user_id` |
| Claims | `user_id`, `token_type`, `exp`, `jti` | SimpleJWT defaults |
| Password hashing | Django 5.1 default (PBKDF2-SHA256) | — |
| Storage (SPA) | `localStorage` | `AuthContext.jsx` |
| Role checks (SPA) | `user?.role === 'admin'` | `AuthContext.jsx` |

**Three problems that block extraction:**

**Problem 1 — Symmetric signing cannot be verified without the secret.** HS256 requires every
verifier to hold the signing key. A Go service that can verify tokens can therefore also **forge**
them. Handing the Identity signing secret to four services means a compromise of any one service
compounds to a full authentication bypass. This is the single hardest blocker to extraction and it
is not fixable by configuration — it requires a key-type change.

**Problem 2 — Revocation depends on every request hitting Django.** `token_blacklist` works because
each authenticated request reads the blacklist table. A Go service verifying a JWT locally cannot
consult it. It would honour a revoked token for up to 30 minutes.

**Problem 3 — `role` is not in the token.** `role` and `is_staff` are also two parallel concepts:
`IsAdminUser` checks `is_staff`, while the SPA and `CustomUser.is_admin` check `role`. The two can
disagree.

### 6.2 Decision

> **Identity remains the only token issuer. It signs with a private key and publishes the public key.
> Go services verify with the public key only. `role` becomes a claim. Refresh tokens never leave
> Identity.**

| Concern | Decision |
|---|---|
| Algorithm | **Ed25519** (EdDSA). 32-byte keys, fastest signature verification, no key-size ceremony. RS256 as a fallback if any tooling in the path rejects EdDSA |
| Asymmetry | Private key in Identity only. Public key served as a JWKS document |
| Key distribution | `GET /.well-known/jwks.json` from Identity. Cached by services for 1 hour, refreshed on unknown `kid` |
| Key rotation | 90-day rotation. Publish old + new during overlap; keep the retired public key for 24h (> the 30-min access TTL) |
| Access token claims | `iss`, `aud`, `sub` (user id), `role`, `email`, `name`, `iat`, `exp`, `jti`, `typ`, `kid` |
| `typ` claim | **Required.** `access` vs `refresh` verified explicitly, so an access token cannot be presented as a refresh token and vice versa. SimpleJWT ships this but Go verifiers must not ignore it |
| Refresh token | Opaque random 256-bit value, hashed (SHA-256) at rest in Identity. Rotation on every use; reuse of a rotated token revokes the whole family |
| Revocation | Two mechanisms, both in Identity: blacklist (existing) + short 30-min access TTL as the bound on how long a Go service can honour a revoked token |
| Service-to-service auth | **None needed.** There are zero service-to-service calls (§5.2) |
| Admin authorization | `role` from the JWT claim, verified in each service. **One** concept, not two |
| Password hashing | Identity only. Migrate to Argon2id when convenient (Django 5.1 supports it); PBKDF2 is not a security problem at this scale |
| SPA storage | Target: refresh token in `httpOnly; Secure; SameSite=Strict` cookie, access token in memory only. Phased in §7 Phase 3 — it changes the frontend, so it does not block service extraction |

### 6.3 Authorization matrix

`role` comes from the JWT; **ownership is always checked against the service's own data.** A role
claim never grants access to another user's row.

| Resource | Customer | Admin |
|---|---|---|
| Product list / detail | Read | Read, write |
| Cart | Own only | Read any (support) |
| Wishlist | Own only | — |
| Order | Own, read | Read any, transition status, cancel |
| Notification | Own, mark read | Read all, broadcast |
| Dashboard metrics | — | Read |

**Enforcement rules, in every service:**

| Rule | Detail |
|---|---|
| Deny by default | No route without an explicit authorization decision. Unlisted ⇒ 404, not 403 |
| Ownership is a query filter, not a check | `WHERE order_id = $1 AND user_id = $sub` — never fetch-then-compare. A fetch-then-compare leaks existence through the response code |
| Role from the verified token | Never from a request body, query parameter, or client header |
| 404 over 403 for other users' resources | Do not confirm that someone else's order exists |
| Internal endpoints unreachable | `stock_level` has no HTTP surface. Adjacent services have no network route (§8.3) |

### 6.4 How the two problems are actually solved

**Problem 1 (symmetric signing).** Identity loads a private key from an env var / mounted secret and
publishes the public key at `/.well-known/jwks.json`. Go services fetch it at boot, cache it, and
verify. Each service can verify; **none can forge.** Compromise of one service no longer escalates
to authentication bypass. This is a ~40-line Django view plus `PyJWT[crypto]` on the Identity side.

**Problem 2 (revocation).** Honestly scoped: with stateless verification, a revoked access token
remains valid for **at most its TTL**. Three options:

| Option | Verdict |
|---|---|
| Shorten access TTL to 5–10 min | **Rejected.** Increases refresh traffic and still not instant |
| Every Go request checks Identity's blacklist | **Rejected.** That is a synchronous service-to-service call on every request — it recreates the coupling §5 spent eliminating |
| Accept a 30-minute bound | **Choose.** It matches the current system's actual security posture: today the blacklist is enforced, but logout does not terminate an in-flight session either. The honest comparison is 30-min exposure vs 30-min exposure |

**The real mitigation is on the client:** `AuthContext` already clears local storage on logout. The
added measure is a `logout_at` timestamp emitted in the next token, plus refresh-token reuse
detection, which *does* kill the whole token family immediately. That covers the realistic attack
(stolen refresh token) far better than the access-token blacklist does.

Documented as accepted risk with a named owner, not silently dropped. Revisit with short-lived
access tokens if an incident requires it.

---

## 7. Migration: Exact Sequence

### 7.1 The strangler rules

| Rule | Detail |
|---|---|
| Extract a *seam*, not a *table* | Every phase ends with a deployable system, not a partial database move |
| Never big-bang | No phase migrates more than one service's write path |
| The monolith stays runnable | At every commit, `docker-compose up` yields a working store |
| New first, cut over second | Deploy the new service alongside the old; switch traffic only when it is verified |
| Rollback must not require a data restore | Rollbacks are traffic switches, not data migrations |
| Read cutover before write cutover | Reads are easy to compare and easy to revert. Writes are neither |
| Every phase has a measurable exit criterion | "Done" is not a criterion. "`p99 latency unchanged and error rate 0 over 7 days`" is |

**Target topology at the end** (4 deployables + edge, versus the previous analysis's 7):

```
                    ┌──────────────────────────┐
     SPA ──────────▶│  Edge (host Nginx)       │
                    └────┬──────────┬──────────┘
                         │          │
              /api/v1/products    /api/v1/{cart,orders,wishlist}
                         │          │
                   ┌─────▼────┐ ┌───▼─────────────┐
                   │ catalog  │ │ commerce        │      GO
                   │ (Go)     │ │ (Go)            │
                   └─────┬────┘ └───┬─────────────┘
                         │          │
                   ┌─────▼──────────▼─────┐
                   │  identity (Django)    │  JWT issuer, JWKS, users
                   └───────────┬───────────┘
                               │
              ┌────────────────┴─────────────────┐
              │         workers (Go)             │
              │  engagement (own schema)         │
              │  reporting  (own schema)         │
              └────────────────┬─────────────────┘
                               │
                        Redis Streams
```

The monolith is gone. Identity remains in Django — **deliberately not extracted** (§7.8).

### 7.2 Phase 0 — Harden the monolith (no new services)

The most important phase, and the one most likely to be skipped. Everything extracted later is a
copy of whatever exists in the monolith. Fixing the model first means migrating a correct model.

| # | Change | Defect | Why here |
|---|---|---|---|
| 0.1 | `UPDATE … WHERE available >= qty` + `select_for_update` in checkout | D1 | The oversell race must be fixed and proven before the logic is copied into Go |
| 0.2 | Single shared order-transition function used by customer **and** admin cancel | D3 | Two divergent implementations must not be migrated |
| 0.3 | `stock`/`in_stock` removed from `Product`; `stock_level` + `stock_movement` introduced | D6, W4 | Gives Inventory a real model (§1.4) before extraction |
| 0.4 | Cart snapshots: `unit_price_snapshot`, `product_name_snapshot`, `product_image_snapshot` | — | Removes Catalog from the checkout path (§3.5) |
| 0.5 | Break all 7 cross-boundary FKs → opaque ids; product deletion soft-deletes | D4 | Cascade data loss must be impossible before tables are copied |
| 0.6 | Notifications moved out of the order/registration transactions | D5 | Celery is not called inside a transaction again |
| 0.7 | `idempotency_keys` + `Idempotency-Key` header on checkout; SPA sends a stable UUID | D2 | Fixes a live double-order bug now; the mechanism migrates |
| 0.8 | `outbox` table + relay task publishing to Redis Streams | — | The event backbone exists before any consumer |
| 0.9 | `/api/v1/` versioned prefix; version in JWT (`typ`, `aud`) | — | Extraction without versioning is a trap |
| 0.10 | `role` added to JWT; `IsAdminUser` unified with `role` | §6.1 P3 | One authorization concept |
| 0.11 | Ed25519 signing + `/.well-known/jwks.json` | §6.1 P1 | Unblocks all later phases |
| 0.12 | Tests: checkout (incl. concurrency), cancellation, authorization, cart math | — | The safety net for every later phase |
| 0.13 | `log_id` + `correlation_id` threaded through; JSON logging | — | Observability before distribution |

**Exit criteria:** all 38 existing tests pass; **new** checkout concurrency test proves no
overselling under parallel load; no notification write occurs inside a request transaction; no
cross-boundary FKs remain.

**Rollback:** every change is independently revertible. Nothing external has changed yet.

**Effort:** ~2–3 weeks. This phase pays for itself at Phase 3.

### 7.3 Phase 1 — Engagement extraction (first consumer)

The lowest-risk extraction: it reads events and writes its own database. No user-facing read path
changes.

| Step | Action |
|---|---|
| 1.1 | Create `engagement` database + Go service with `POST /notifications` and `GET /notifications` |
| 1.2 | Consumer reads `UserRegistered.v1`, `OrderPlaced.v1`, `OrderCancelled.v1`, `LowStockDetected.v1` |
| 1.3 | **Dual-write:** Django still writes `notifications_notification`; the consumer also writes. Both are live |
| 1.4 | **Compare** both for 7 days; alert on any divergence |
| 1.5 | Cut reads to the Go service; stop the Django write |
| 1.6 | Run once daily: delete Django notifications created before the cutover |

**Exit criteria:** 7 consecutive days of zero divergence; consumer lag < 60s; notification
delivery works when Redis is down (outbox replay).

**Rollback:** repoint `GET /notifications` at Django. Because both were written during the window,
nothing is lost. **Trivially safe** — the reward for choosing a consumer-first extraction.

**Effort:** ~1 week.

### 7.4 Phase 2 — Reporting extraction

| Step | Action |
|---|---|
| 2.1 | `reporting` database + consumer of order events; build `fact_order`, `fact_product_daily` |
| 2.2 | **Dual-run:** keep Django's aggregate queries on `/admin/dashboard/stats` |
| 2.3 | **Compare** rollup vs live query daily for 7 days |
| 2.4 | Cut the dashboard to Reporting |
| 2.5 | Move `django_celery_beat` scheduling to the Go worker |
| 2.6 | Rebuild-from-zero drill: truncate reporting, replay the outbox, verify totals match |

**Exit criteria:** rollups match live queries for 7 days; step 2.6 replay produces byte-identical
totals.

**Rollback:** revert one route to the Django query.

**Effort:** ~1 week.

### 7.5 Phase 3 — Catalog extraction

The first read-heavy service. Chosen after Engagement/Reporting because those proved the event
backbone works.

| Step | Action |
|---|---|
| 3.1 | Go `catalog` service; `products_*` tables copied to `catalog` DB |
| 3.2 | **Read-only** cutover of `GET /api/v1/products` behind a feature flag. Django admin still writes Postgres |
| 3.3 | **Outbox relay in Django** publishes `ProductUpdated.v1` / `ProductDeleted.v1` / `PriceChanged.v1`; Go catalog consumes into its own DB |
| 3.4 | Compare product responses byte-for-byte for 7 days |
| 3.5 | Move the admin write path to Catalog (Django product admin retired) |
| 3.6 | SPA `httpOnly` cookie token storage (§6.2) — do it here, it is a frontend-wide change and now the auth story is stable |
| 3.7 | Stop reading `products_*` from Postgres; drop the tables after 30 days |

**Exit criteria:** identical product responses for 7 days; admin writes propagate to the Go catalog
in < 5s.

**Rollback:** repoint the product route to Django. Writes revert with it. **The flag makes this a
one-line change.**

**Effort:** ~2 weeks.

### 7.6 Phase 4 — Commerce read paths

Inventory moves **with** Commerce, in this phase — not as its own phase. Splitting them would
require the cross-service saga that §1 rejected.

| Step | Action |
|---|---|
| 4.1 | Go `commerce` service; `cart_*`, `wishlist_*`, `orders_*`, `stock_level`, `stock_movement`, `stock_released` copied to `commerce` DB |
| 4.2 | **Read-only** cutover: `GET /cart`, `GET /wishlist`, `GET /orders`, `GET /orders/{id}` |
| 4.3 | Django keeps all writes; sync via the same relay mechanism |
| 4.4 | Compare all read responses for 7 days |
| 4.5 | **No `stock_level` in Django after this step.** It is never read by the monolith once Commerce reads are cut over |

**Exit criteria:** zero read divergence for 7 days; `stock_level` has no Django reader.

**Rollback:** repoint read routes. Writes never moved, so nothing is inconsistent.

**Effort:** ~2 weeks.

### 7.7 Phase 5 — Commerce write path (the irreversible one)

| Step | Action |
|---|---|
| 5.1 | Cut cart/wishlist writes to Commerce |
| 5.2 | **Cut order writes with a feature flag + maintenance window for the first hour.** Checkout moves from Django to Go; both paths must not write simultaneously |
| 5.3 | Run the §3.4 transaction in production behind the flag at 10%, 50%, 100% |
| 5.4 | Move order-status transitions and admin cancel to Go |
| 5.5 | Delete the Django `orders`/`cart`/`wishlist` code paths |
| 5.6 | **Full-system verification:** place → confirm → ship → deliver; place → cancel; concurrent last-unit race |

**Exit criteria:** step 5.6 passes; no D1 oversell under production concurrency; no order exists
with a non-deducted stock line; zero Django writes to commerce tables for 7 days.

**Rollback: harder than earlier phases.** Writes have moved. The honest options:
- If caught in the first hour, revert the flag → Django is authoritative, Go's orders are
  reconciled by `event_id` (idempotency makes re-sending safe).
- After that, rollback requires dual-write re-enablement for the duration. **This asymmetry is the
  reason for step 5.2's maintenance window** — you want the decision made while you can still
  press one button.

**Effort:** ~2 weeks.

### 7.8 What is NOT extracted, and why

| Left in Django | Reason |
|---|---|
| **Identity** | Token issuance and password handling are the highest-risk code to port and the lowest business value to port. The asymmetric-JWT + JWKS change (§6.2) makes Identity extractable **later** without touching any other service. Extracting it now would add a 6th service, a second auth failure domain, and a user-table migration — for no gain |
| Django admin | Replaced by SPA admin screens for the migrated domains. Keeping it would require Django to keep writing to Postgres forever, defeating the migration |

**Phase 6 (optional, not planned):** extract Identity last, once `role` and JWKS are proven in
production. Trigger: a second service needs to issue tokens, or the Django app must be replaced
independently.

### 7.9 Data migration and verification

| Concern | Method |
|---|---|
| Copy | One-off logical copy (`pg_dump --data-only` per table, then transform), not logical replication. The dataset is small; replication would entangle the two versions |
| FK removal | Drop the FK **constraints** first (keeps data), replace the columns, re-point the application. Never drop data and re-create |
| Dual-write | Only during a bounded window, never as a permanent state. A permanent dual-write is two sources of truth |
| Verification | Per-table row counts + checksum; then **behavioural** comparison — same request to both implementations, compare responses field by field |
| Cutover | Feature flag, canary percentages, then full. Never a single irreversible switch |
| Post-cutover | Keep the old tables for 30 days, read-only, before dropping |

### 7.10 Summary

| Phase | Scope | Risk | Rollback |
|---|---|---|---|
| 0 | Harden monolith | Very low | Per-commit revert |
| 1 | Engagement consumer | Very low | Route flip |
| 2 | Reporting | Very low | Route flip |
| 3 | Catalog | Low | Feature flag |
| 4 | Commerce reads | Low | Route flip |
| 5 | Commerce writes | **Medium** | Flag + reconciliation |
| 6 | Identity (deferred) | — | Not planned |

Total: ~9–11 weeks. Ordered so that **the two irreversible phases (3 and 5) come after two phases
that prove the event backbone end-to-end.**

---

## 8. Infrastructure: Minimum Production-Ready

### 8.1 What runs today

`docker-compose.yml` defines **7 containers**, all started on one EC2 `t3.micro`
(`docker-compose.prod.yml` overrides only logging and two commands):

| Container | Runtime | Memory (approx) |
|---|---|---|
| `db` | Postgres 16-alpine | ~300–400 MB |
| `redis` | Redis 7-alpine | ~50–100 MB |
| `backend` | Gunicorn, 3 workers | ~250–400 MB |
| `celery_worker` | Celery, concurrency 2, `max-memory-per-child=150000` | ~150–300 MB |
| `celery_beat` | Celery beat + `DatabaseScheduler` | ~50 MB |
| `flower` | Flower | ~50–80 MB |
| `nginx` | Nginx | ~10 MB |
| **Total** | | **~860 MB – 1.34 GB** |

**A `t3.micro` has 1 GB of RAM. The system is already overcommitted before a single line of
migration code is written.** There are no `mem_limit` or CPU limits anywhere in either compose
file, so nothing is bounded — the kernel's OOM killer picks the victim, and because Celery's own
limit is 150 MB per child, the worker is a likely candidate.

**This is the most urgent infrastructure finding in the review, and it precedes the migration
decision.** Phase 0 must include resizing the host (§8.4). Migrating to Go while overcommitted
would make the migration look slower and more fragile than it is.

### 8.2 Target: 6 containers, and 5 of them are lighter

| Container | Replaces | Runtime | Memory (approx) |
|---|---|---|---|
| `postgres` | `db` | Postgres 16 | ~300–400 MB |
| `redis` | `redis` | Redis 7 + **AOF** | ~100 MB |
| `identity` | part of `backend` | Django + Gunicorn | ~350 MB |
| `catalog` | — | Go | ~30 MB |
| `commerce` | — | Go | ~40 MB |
| `workers` | `celery_worker` + `celery_beat` + `flower` | Go | ~40 MB |
| `edge` | `nginx` | Nginx | ~10 MB |
| **Total** | | | **~870 MB** |

**The container count goes from 7 to 7, but three Django processes and Flower are replaced by one Go
binary.** Go services idle at ~30–40 MB because a Go binary's baseline RSS is ~5–10 MB and it has
no runtime. Flower and Celery beat disappear entirely — their two jobs become functions inside
`workers`.

Note the honest part: this saves ~250 MB, which on a 2 GB instance is the difference between
"constantly swapping" and "comfortable." **It does not rescue `t3.micro`.** The instance must still
grow (§8.4).

### 8.3 Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Orchestration | **Docker Compose on one host. Not Kubernetes.** | 4 services, one host, ~0.25 events/s. A k8s cluster has a control plane, etcd, an ingress controller, a metrics stack, and a CNI — hundreds of MB and a full-time operational specialty. Its entire value proposition (self-healing across nodes, horizontal scale across nodes) is unused |
| Managed services | **Postgres → RDS (or Aurora Serverless v2). Redis stays on-host.** | Postgres is the one component whose failure loses data. RDS gives automated backups, PITR, and failover for roughly the cost of the instance. Redis is a *transport buffer* — the outbox is the source of truth (§2.6) — so losing it costs redelivery, not data |
| Load balancer | **Host Nginx. No ALB, no NLB.** | One host, one edge. An ALB adds cost and a health-check layer that Nginx reverse-proxying a local port already provides |
| Service discovery | **Compose service names as DNS.** | `catalog:8080` resolves. A discovery system for 4 static containers is unnecessary |
| Connection pooling | **PgBouncer: not yet.** | With 5 services, pool counts are ~25 connections. Postgres's default `max_connections=100` is sufficient. Revisit above ~40 connections |
| Migrations | **Plain `.sql` files, applied by the service at startup.** | Not a migration tool. A schema change is a file reviewable in a PR, applied idempotently, and rolled back by a compensating file |
| Secrets | **Environment variables from a single `.env.prod`, `chmod 600`, owned by the deploy user** | Docker Compose has no secret manager. A separate secrets service for one host is not justified. **Rotate the JWT signing key without a deploy** — publish both keys during overlap (§6.2) |
| TLS | **Terminate at host Nginx.** Services speak plain HTTP on the internal network | Adding TLS between the edge and its own containers buys nothing; the traffic never leaves the host |
| Deployment | **`docker compose up -d --build`, triggered by CI over SSH.** | GitHub Actions → build image → push to ECR → SSH → `docker compose pull && up -d`. A 5-service app does not need Argo CD or Flux |
| Rollback | **Previous image tag, redeployed.** | Tag images with the commit SHA. Rollback is a redeploy, not a rebuild |

### 8.4 Host sizing

| Size | RAM | Verdict |
|---|---|---|
| `t3.micro` | 1 GB | **Insufficient — today, before migration.** Already overcommitted (§8.1). Do not attempt the migration here |
| `t3.small` | 2 GB | **Absolute minimum.** Fits the ~870 MB budget with room for OS and page cache |
| `t3.medium` | 4 GB | **Recommended.** ~2.4 GB of headroom above the floor, absorbs a redeploy (old + new containers running simultaneously) and a traffic spike without OOM |
| `t3.large` | 8 GB | Not justified. Nothing here needs it, and it quadruples the bill |

**Recommendation: `t3.medium` (4 GB), 2 vCPU.** `t3.small` is a viable cost-saving floor, but a
rolling deploy briefly runs two copies of everything — which is exactly when an under-provisioned
host OOM-kills the database. The extra ~$15/month buys the ability to deploy without gambling.

CPU: 2 vCPU is fine for ~0.25 events/s and single-digit request rates. Note that `t3` **burstable
instances are CPU-credit based** — sustained CPU use gets throttled after the credit allowance is
exhausted. The workload is spiky, so this is acceptable, but `t3a` or an unlimited-instance
configuration is worth considering if throttling is observed.

### 8.5 Explicitly not adopting

| Not adopted | Why |
|---|---|
| Kubernetes / k3s | Zero value at 4 services and 1 host. Enormous operational cost |
| Docker Swarm | Nominal (single-node) benefit, real complexity |
| Service mesh (Istio/Linkerd) | Its purpose is securing and observing service-to-service traffic. **There is none** (§5.2). This is the clearest case of premature complexity in the space |
| gRPC | Nothing to serve internally |
| Kafka | §2.3 |
| RabbitMQ | §2.2 |
| NATS | Viable, but Redis already exists and carries 0.25 events/s |
| Redis Cluster / Sentinel | Single-node Redis with AOF plus outbox replay is sufficient |
| PgBouncer | Not at 25 connections |
| ELK / Loki / full OpenTelemetry stack | §10.5 |
| Blue/green with a second host | A redeploy with a previous image tag is sufficient rollback (§13) |

### 8.6 Database

| Concern | Decision |
|---|---|
| Instances | **5 separate Postgres databases** on one instance (`identity`, `catalog`, `commerce`, `engagement`, `reporting`), created in Phase 0 |
| Why separate databases, not separate servers | Logical isolation (no cross-schema FKs, no accidental joins, no shared credentials), physical simplicity. **Server-per-service would be indefensible** at this scale |
| Roles | One role per service. `commerce` has no grant on `catalog`. Enforces §4.1 at the database level, not just by convention |
| Schema search path | Per-role, so `commerce` never needs to know `catalog` exists |
| Backups | RDS automated backups + PITR (7-day window) + nightly `pg_dump` to S3 (30-day retention) |
| Restore drill | Quarterly. **A backup that has never been restored is not a backup** |
| Migrations | `.sql` files, applied at startup, idempotent, one service at a time |
| Extensions | `pgcrypto` for `gen_random_uuid()`. Nothing else |

**Adding the cross-database FK guard (§4.4) here:** a CI check asserting no `commerce` migration
declares a foreign key into a `catalog` or `identity` schema. The database roles make a violation
fail at deploy time too — defence in depth.

### 8.7 Redis configuration (required changes)

```yaml
redis:
  image: redis:7-alpine
  command: >
    redis-server
    --requirepass ${REDIS_PASSWORD}
    --appendonly yes
    --appendfsync everysec
    --maxmemory 256mb
    --maxmemory-policy noeviction
  healthcheck:
    test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
```

| Flag | Why |
|---|---|
| `--appendonly yes --appendfsync everysec` | **Currently absent (§2.6).** Without it, a Redis restart loses every in-flight stream entry. Costs ~1% throughput and a few MB — worth it for not having to replay the outbox |
| `--maxmemory-policy noeviction` | The default is `allkeys-lru`, which **evicts stream entries under memory pressure** — silently dropping domain events. Must be explicit |
| `--maxmemory 256mb` | Bounded. Without a limit, Redis can consume the host and trigger an OOM kill of Postgres |
| `--requirepass` | Already present. Keep |

**Redis databases 1 and 2** (Celery broker/result) become unused once `workers` replaces Celery and
can be decommissioned in Phase 2. Streams get their own logical db.

### 8.8 Networking and ports

| Service | Published | Rationale |
|---|---|---|
| `edge` (Nginx) | `80`, `443` only | The single entry point |
| `flower` | `127.0.0.1:5555` | Already correct today (`docker-compose.prod.yml:36`). Removed in Phase 2 anyway |
| `postgres`, `redis` | **Not published** | Already correct today — only 2 `ports:` blocks exist in prod, both for flower and nginx. Keep it |
| `catalog`, `commerce`, `workers`, `identity` | **`expose` only, never `ports`** | Not reachable from outside the Docker network |

**Required at the edge (not present today):**

| Rule | Why |
|---|---|
| Strip client-supplied `X-User-Id`, `X-Forwarded-User`, `X-Forwarded-Email` | If a service ever trusts a header for identity, a client can forge it. **The JWT is the only identity source** (§6.3) |
| Strip `X-Forwarded-For` from clients, set it to the real client IP | Otherwise any client spoofs its own IP in logs |
| `proxy_set_header Host $host`, `X-Real-IP`, `X-Forwarded-Proto` | Correct for `secure` cookie detection (§6.2) |
| Rate limit `/api/v1/auth/*` | Login and registration are the brute-force surface |
| Request body size limit | `client_max_body_size 1m` |
| `server_tokens off` | Do not advertise the Nginx version |

### 8.9 Startup, health, and shutdown

| Concern | Implementation |
|---|---|
| `/healthz` | Liveness. Process is up. **No dependencies checked** — a liveness check that fails on a dependency causes restart loops during database outages |
| `/readyz` | Readiness. DB ping + (Identity only) JWKS loaded. Failure → removed from rotation, **not** restarted |
| Restart policy | `restart: unless-stopped` on all services. Already the pattern in `docker-compose.yml` |
| Startup ordering | `depends_on: condition: service_healthy` for Postgres and Redis. Already present |
| Graceful shutdown | Go: `server.Shutdown(ctx)` on `SIGTERM`, with a 30s deadline to finish in-flight requests. **Compose `stop_grace_period: 40s`** so a rolling deploy does not kill requests mid-transaction |
| Outbox relay on shutdown | Stop claiming new rows; finish the current batch; leave unpublished rows for the next start |

The liveness/readiness split is the detail most often missed. Conflating them is why a brief database
outage in a monolith-style app turns into a full restart loop of every process.

### 8.10 Deployment

```bash
# CI, after tests pass on the tagged commit
docker build -t $AWS_ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/sneakin/commerce:$SHA .
docker push …/commerce:$SHA
# SSH to the host
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose … up -d --remove-orphans
# verify /readyz on every service before declaring success
```

| Rule | Detail |
|---|---|
| Tag with the commit SHA | Never `latest` — rollback needs a specific version |
| Migrate before switching traffic | The service applies migrations at startup, then reports ready |
| Verify after deploy | `/readyz` on all services. **A deploy is not complete until health checks pass** |
| One service at a time | Do not roll 5 services simultaneously. Sequential deploys are slower and vastly easier to diagnose |

---

## 9. Go Technology Choices

### 9.1 Principle

> **Standard library by default. A dependency is a cost paid forever and must be justified
> individually.**

Not "Go is fast" and not "the team knows Go." Go's `net/http` and `database/sql` are complete,
excellent, and sufficient. The 12 or so dependencies a typical Go service pulls in are usually
avoidable.

### 9.2 Dependencies: the complete list

**Three. Not twelve.**

| Dependency | Why it is unavoidable | Why a stdlib alternative does not work |
|---|---|---|
| `github.com/jackc/pgx/v5` | PostgreSQL driver | `database/sql` defines the interface but **ships no `postgres` driver**. `pgx` also provides a connection pool |
| `github.com/golang-jwt/jwt/v5` | JWT verification | `crypto` has primitives; JWT is a format spec with real parsing rules (alg confusion, `kid` handling, clock skew). Hand-rolling it invites security bugs |
| `github.com/redis/go-redis/v9` | Redis Streams client | `net` has no Redis protocol implementation. This client is required for `XADD`/`XREADGROUP`/`XACK`/`XAUTOCLAIM` |

Everything else comes from the standard library:

| Need | Standard library package |
|---|---|
| HTTP server, routing, middleware | `net/http`, `http.ServeMux` |
| JSON | `encoding/json` |
| Structured logging | `log/slog` |
| TLS, certificate handling | `crypto/tls` |
| Graceful shutdown, signals | `context`, `os/signal` |
| Configuration | `os` (env vars) |
| Concurrency | `goroutine`, channels, `sync` |
| Tests, assertions, benchmarks, fuzzing | `testing`, `net/http/httptest` |
| Time, UUID generation | `time`, `crypto/rand` |
| Error wrapping | `errors`, `fmt.Errorf("%w")` |

### 9.3 Explicitly rejected dependencies

| Rejected | Reason |
|---|---|
| **GORM** (or any ORM) | Hides SQL, and this system *needs* to see its SQL. `SELECT … FOR UPDATE`, `ON CONFLICT DO NOTHING`, conditional `UPDATE`s (§3.4) are the correctness-critical parts of checkout, and an ORM either makes them awkward or generates them invisibly. **Hand-written SQL with `database/sql`** — these are 4–6 queries per endpoint, not CRUD |
| **Gin / Echo / Fiber** | `http.ServeMux` has supported method-and-path patterns (`GET /api/v1/products/{id}`) since Go 1.22. Middleware is a function wrapping `http.Handler`. Gin adds a dependency, a performance ceiling that is irrelevant at 10 rps, and a non-standard `*gin.Context` that leaks into every handler signature |
| **zap / zerolog** | `log/slog` (Go 1.21+) is structured, leveled, and handler-based. Exactly sufficient |
| **viper / godotenv** | Environment variables. 20 lines of code. A config library to read `os.Getenv` is a poor trade |
| **go-playground/validator** | Struct tags plus explicit checks. The validation rules here are few and business-specific |
| **OpenTelemetry SDK** | Deferred — §10.5 |
| **sqlc / gorm-gen / squirrel** | `database/sql` + constants. Code generation adds a build step and generated-file churn |
| **grpc-go + protobuf** | No internal RPC (§5.5) |
| **testify** | `testing` plus `t.Fatalf`. The assertion gain is small; the dependency is not |
| **Wire / any DI framework** | Constructors and explicit parameters. Go DI is a solved problem by design |

**Line count consequence:** `commerce` is realistically ~2,500–3,500 lines of Go. A `main.go`,
a `config.go`, `http.go` (router + middleware), `checkout.go`, `orders.go`, `inventory.go`,
`cart.go`, `wishlist.go`, `outbox.go`, and one repository file per aggregate. That is a codebase one
person can hold in their head, which is the actual benefit.

### 9.4 Project layout

```
commerce/
├── cmd/commerce/main.go        # composition root; ~60 lines
├── internal/
│   ├── config/                 # env → typed struct, fails fast on invalid config
│   ├── httpapi/                # router, middleware, error rendering
│   ├── auth/                   # JWT verify, JWKS cache, role extraction
│   ├── checkout/               # §3.4 transaction — the crown jewel
│   ├── order/                  # state machine (§3.7)
│   ├── inventory/              # §1.2 module: stock_level, stock_movement, the ledger
│   ├── cart/  wishlist/
│   ├── outbox/                 # relay + publisher
│   ├── store/                  # SQL, one package per aggregate
│   └── platform/               # slog, postgres, redis, health
├── migrations/*.sql
└── Dockerfile
```

`internal/` enforces the boundary: **nothing outside the module can import it.** The inventory
package boundary from §1.2 is enforced by the compiler, not a convention.

### 9.5 Patterns

| Pattern | Choice | Rationale |
|---|---|---|
| HTTP | `http.ServeMux` with Go 1.22 method patterns | Stdlib. No framework |
| Middleware | `func(http.Handler) http.Handler` | Composition by wrapping. Testable in isolation |
| SQL | `database/sql` + `pgx`, **named/positional params, no string concatenation** | The correctness depends on exact SQL (§3.4). It must be readable in a PR |
| Transactions | Explicit `BeginTx`/`Commit`/`Rollback`, `defer` the rollback | No ORM-managed sessions. The transaction boundary is the most important line of code in the service and it should be visible |
| Logging | `slog` JSON to stdout; Docker's `json-file` driver rotates | Never log to a file from inside a container |
| Errors | Sentinel errors + `errors.Is`; one JSON error shape for all responses | Consistency is what the frontend needs |
| Config | Env vars parsed in `main`, **invalid config = exit immediately** | Never start in a half-configured state |
| Context | `r.Context()` threaded through every call | Cancellation propagates; no goroutine leaks |
| Retries | Only in the outbox relay. **Never inside a request handler** | A retry inside a handler holds a connection and blows the 10s timeout budget |
| Concurrency | One goroutine per request; `sync.RWMutex` only if a real shared cache is built | `database/sql` pools connections. Do not hand-roll a pool |
| Graceful shutdown | `signal.NotifyContext` + `srv.Shutdown(ctx)` | Finishes in-flight requests (§8.9) |

### 9.6 Build and runtime

```dockerfile
# --- build ---
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# -trimpath for reproducible builds; CGO disabled → static binary
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/commerce ./cmd/commerce

# --- runtime ---
FROM gcr.io/distroless/static-debian12
COPY --from=build /out/commerce /commerce
COPY migrations /migrations
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/commerce"]
```

| Choice | Rationale |
|---|---|
| `CGO_ENABLED=0` | Static binary. No libc, no version skew |
| `distroless/static` | No shell, no package manager, **no CVEs from an OS userspace**. A 4-service architecture does not need to debug production with `apt` |
| `USER nonroot` | Container runs unprivileged. Not root by default |
| `-trimpath -ldflags "-s -w"` | Reproducible builds, ~30% smaller binary |
| No `EXPOSE` reliance | Informational only; actual exposure is Compose/network policy |
| Binary, not a framework | One process, one PID 1. No supervisor, no signal-forwarding bug |

Note `distroless` has no shell: **health checks must use the binary itself**
(`commerce -healthcheck`) or run from outside. Not an oversight — it is the trade for a smaller
attack surface.

---

## 10. Observability

### 10.1 Current state

| Capability | Status |
|---|---|
| Structured logging | **No.** Gunicorn access logs only |
| Request/correlation IDs | **None in application code** (`grep log_id\|request_id\|correlation` → no hits outside `.venv`) |
| Application metrics | **None.** `prometheus-client` is in `requirements/base.txt` but is imported only by Flower |
| Distributed tracing | None |
| Error tracking | Sentry, optional — `SENTRY_DSN` defaults to `""`, so it is **disabled unless configured** |
| Health endpoints | None (Django has none by default) |

**In a single-process monolith, the absence of correlation IDs is a nuisance. Across four services
it is the difference between "the customer's order failed" and "which hop failed, with what request
body, and did the event ever publish."** Phase 0 item 0.13 exists for this reason.

### 10.2 Logs

| Decision | Detail |
|---|---|
| Format | **JSON to stdout.** `log/slog` with a JSON handler. Docker's `json-file` driver rotates at 10 MB × 3 (already configured) |
| Correlation | **Every log line carries `correlation_id` and `log_id`.** Incoming `X-Request-ID` / `correlation_id` header is honoured, else generated |
| Identity | `user_id` and `role` logged from the **verified** token, never from a header |
| Level discipline | `ERROR` = needs a human. `WARN` = degraded but handled. `INFO` = business events (order placed, cancelled). **Not one `INFO` per request** — that is what metrics are for |
| Retention | Ship to CloudWatch Logs (7 days hot, 30 days archive). stdout alone is lost on host rebuild |

**Required structured events (a fixed set, not free-form):**

| Event | Fields |
|---|---|
| `checkout.completed` | `correlation_id, user_id, order_id, line_count, total_amount, duration_ms` |
| `checkout.rejected` | `correlation_id, user_id, reason (empty_cart\|insufficient_stock\|conflict), duration_ms` |
| `order.cancelled` | `correlation_id, order_id, actor_id, actor_role, released_lines` |
| `outbox.published` | `correlation_id, event_id, event_type, lag_ms, batch_size` |
| `consumer.processed` | `correlation_id, event_id, event_type, consumer, duration_ms, replayed(bool)` |
| `consumer.dead_lettered` | `event_id, event_type, consumer, attempts, error` |
| `auth.rejected` | `correlation_id, reason (expired\|bad_signature\|missing_role), path` |

**Never log:** passwords, JWTs, `Authorization` headers, full request/response bodies, addresses,
phone numbers, payment references. **Log `order_id` and `user_id` — those are enough to find the
record without leaking PII into the log aggregator.** This is a retention/PII boundary: logs live
longer than the data they describe.

### 10.3 Metrics

**Decision: hand-roll the Prometheus text exposition format on `/metrics`.**

This is the one place where avoiding a dependency requires justification, because
`prometheus/client_golang` exists and is fine. The argument: the required output is counters, gauges,
and histograms in a text format that is ~150 lines to emit and requires **no registry, no
collectors, and no client-side state management**. `client_golang` adds ~15 transitive packages and
its own lifecycle model for four metrics types. At this scale the win is the dependency, not the
performance.

**If `client_golang` is preferred, take it.** The decision is low-stakes and either is correct. Do
not let it block Phase 0.

| Metric | Type | Labels | Why |
|---|---|---|---|
| `http_requests_total` | counter | `service, method, route, status` | Traffic + error rate. **`route`, not raw path** — otherwise `/products/{id}` creates unbounded cardinality |
| `http_request_duration_seconds` | histogram | `service, method, route` | Latency, p50/p95/p99 |
| `checkout_attempts_total` | counter | `result (completed\|rejected_empty\|rejected_stock\|conflict)` | **The business metric that matters** |
| `checkout_duration_seconds` | histogram | `result` | Checkout health |
| `outbox_unpublished_total` | gauge | `service, event_type` | **The single most important alert.** Non-zero and growing = events stuck |
| `outbox_publish_lag_seconds` | histogram | `service` | Relay health |
| `consumer_lag_entries` | gauge | `consumer` | Pending stream entries. Rising = a stuck consumer |
| `consumer_processed_total` | counter | `consumer, event_type, outcome` | Throughput |
| `dead_letters_total` | counter | `consumer, event_type` | Data loss. Page on any increase |
| `db_pool_in_use` / `db_pool_wait_seconds` | gauge / histogram | `service` | Pool exhaustion |
| `jwks_cache_age_seconds` | gauge | `service` | Key-rotation problems before they cause 401s |

### 10.4 Traces

**Decision: W3C Trace Context propagation + `trace_id` on every log line. No OpenTelemetry SDK yet.**

| Element | Decision |
|---|---|
| Context format | `traceparent: 00-{trace_id}-{span_id}-{flags}`, per W3C |
| Where generated | At the edge, in Nginx or the first service. Propagated inbound; honoured on every hop |
| Storage | `trace_id` as a field on every log line (§10.2). **This is what makes logs joinable without a tracing backend** |
| Per-request spans | `auth.verify`, `db.checkout` (one parent, not per query) |
| Span on errors | Attach a span to every error log. **`ERROR` without a trace is an anti-pattern** |
| Backend | None |

**Why not a tracing backend:** a full OTel deployment is a collector, an exporter, a storage backend,
a query UI, and tail-sampling configuration. At 10 requests/second and 0.25 events/second, this
analyses a volume of data nobody will read, while consuming the memory of an already-overcommitted
host (§8.1).

**What you actually lose:** you cannot see *where inside* a 4-hop flow time was spent — but there
are **no multi-hop flows** (§5.2). The critical path is edge → one service → one transaction. A
per-request `duration_ms` plus a `trace_id` answers essentially every question this system can pose.

**Triggers to adopt OpenTelemetry:**

| Trigger | Threshold |
|---|---|
| A real synchronous inter-service call exists | Any |
| p99 latency exceeds the SLO and the cause is not obvious from `route`-level histograms | Two consecutive weeks |
| A customer reports intermittent failure that logs cannot localise | Any occurrence |
| >10 services | Any |

Adopting it later is cheap: `slog` already emits `trace_id`, which is exactly the field OTel uses.

### 10.5 Dashboards and alerts

**Dashboard (one page, four panels):** request rate + error rate · latency percentiles by route ·
checkout funnel (attempt → completed, with rejection reasons) · event pipeline health (outbox lag,
consumer lag, dead letters).

**Alerts — four, each actionable:**

| Alert | Threshold | Why this one |
|---|---|---|
| **Checkout failure rate** | >5% over 5m | The business stops working. **This is the only page-worthy alert on day one** |
| **Outbox unpublished rows growing** | >100 for 5m | Silent data drift. Nothing else surfaces this |
| **Dead letters increased** | Any increase | Data loss has occurred |
| **Host memory** | >85% for 5m | The OOM killer is the top threat (§8.1). Prevents the worst failure |
| Consumer lag | >1000 for 15m | Warning, not page — a slow consumer self-heals |

**Deliberately not alerted:** p99 latency in isolation (no SLO to breach yet), 5xx from a single
route, CPU (burstable instances spike legitimately), Redis memory growth (bounded by `maxmemory`).

### 10.6 Health

Per §8.9: `/healthz` (liveness, no dependencies), `/readyz` (readiness, dependencies checked),
`/metrics`. **`/healthz` must never touch a dependency** — a liveness check that fails on a database
blip turns a 30-second outage into a restart storm.

---

## 11. Security

### 11.1 What is already right

Worth recording, because these should not be regressed during the migration:

| Control | Status |
|---|---|
| `SECRET_KEY` | `config("SECRET_KEY")` with **no default** — fails fast. Correct |
| `.env*` | Gitignored (`.gitignore:36-38`). Correct |
| Requirements | **Fully pinned, exact versions** (`Django==5.1.6`, not `>=`). Correct |
| Dev vs prod dependencies | Separate `base.txt` / `dev.txt`; the Dockerfile installs `base.txt` only. Correct |
| HSTS | 1 year + subdomains + preload (`prod.py:38-40`). Correct |
| Cookies | `Secure` + `SameSite=None` (required — SPA on Vercel, API on EC2) |
| `DEBUG` | `False` in prod. Correct |
| `ALLOWED_HOSTS` / CORS | Env-driven, not `*`, in prod |
| Payment data | Only a method string (`cod`/`stripe`/`razorpay`). **No card data is stored.** Correct |
| Redis/DB ports | Not published in prod |
| Flower | Bound to `127.0.0.1`, basic auth. Correct |

### 11.2 Findings to fix

| # | Finding | Severity | Fix |
|---|---|---|---|
| S1 | **HS256 shared secret** (D11) | **High** | Ed25519 + JWKS (§6.2). Blocks extraction; compromise of any verifier = full auth bypass |
| S2 | **`role` not in the JWT** | **High** | Add the claim; unify with `is_staff` (§6.3) |
| S3 | **`IsOwnerOrAdmin` is defined but never used** | **High** | Any order/cart/wishlist endpoint relying on default DRF permissions is accessible to any authenticated user. Audit every view's `permission_classes` before extraction |
| S4 | **Fallback secrets** — `changeme` for Redis and Flower | Medium | Fail fast on unset secrets. Never boot with a default password |
| S5 | **Refresh token in `localStorage`** | Medium | XSS → token theft. Move to `httpOnly; SameSite=Strict` cookie (§6.2, Phase 3) |
| S6 | `ALLOWED_HOSTS`/`CORS_ORIGINS` default `""` → `[""]` | Low | Filter empty strings. Fails closed today, but the sentinel is wrong |
| S7 | No rate limiting anywhere | Medium | Nginx `limit_req` on `/api/v1/auth/*` and checkout |
| S8 | No `log_id`/correlation IDs | Medium | §10.2. Without them, an incident is not reconstructable |
| S9 | No dependency scanning | Low | `pip-audit` + `govulndir-check` in CI; Dependabot |
| S10 | No `X-Request-ID` at the edge, no security headers on Go services | Low | §11.4 |
| S11 | `SENTRY_DSN` defaults empty → error tracking silently off | Low | Fail loudly if monitoring is expected to be on |

**S3 deserves emphasis.** `IsOwnerOrAdmin` exists, is correctly written, and is unused — which means
the ownership checks the analysis describes are not actually enforced at the framework layer. Verify
per-endpoint before migrating; do not assume the intended authorization is present.

### 11.3 Threat model

| Threat | Control |
|---|---|
| Credential stuffing / brute force | Rate limit on auth routes; `role`-based lockout; no user enumeration in error messages |
| Token theft (XSS) | `httpOnly` cookie for refresh (§6.2); `SameSite`; CSP on the SPA; React escapes by default — avoid `dangerouslySetInnerHTML` |
| Token forgery | Asymmetric keys; verifier services hold only public keys (S1) |
| Token replay after logout | 30-min access TTL bound + refresh-family revocation on reuse (§6.4) |
| Broken object authorization (BOLA/IDOR) | **Ownership as a query filter**, never fetch-then-compare (§6.3). This is the most likely real-world breach in this system |
| SQL injection | Parameterized queries only; **no string concatenation anywhere** (§9.5). The `where`/`order_by` patterns in `admin_views.py` are exactly the risk — allowlist sort fields |
| CSRF | JWT in the `Authorization` header, not a cookie, so CSRF does not apply to API calls. Cookies are only for refresh, `SameSite=Strict`, CORS allowlisted |
| Privilege escalation | `role` from the **verified** signature; never from body, query, or header |
| Mass assignment | Explicit DTOs with known fields. **Never bind a request body directly to a model** |
| Internal service exposure | No published ports; no auth on internal endpoints because none are reachable (§8.8) |
| Supply chain | Pinned versions; scanning in CI; distroless images (S9) |
| Secret leakage in logs | Explicit allowlist of loggable fields (§10.2) |
| Dependency confusion / typosquatting | Vendoring or checksum verification; CI review of new dependencies |
| DDoS / volumetric | Host-level provider protection. **Explicitly out of scope** — Cloudflare/WAF only when justified by a real incident |
| Data at rest | RDS encryption at rest; TLS in transit; `shipping_address` and `phone` are PII — restrict and define retention |

### 11.4 Security headers

Set at the edge so all services inherit them:

```
Content-Security-Policy: default-src 'self'; img-src 'self' data: https:; script-src 'self';
  style-src 'self' 'unsafe-inline'; connect-src 'self' https://<api-domain>;
  frame-ancestors 'none'; base-uri 'self'; form-action 'self'
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

`connect-src` must list the API domain explicitly — the SPA on Vercel calls the API cross-origin.

**Trust boundary rule:** the edge **strips** `X-User-Id`, `X-Forwarded-User`, `X-Forwarded-Email`
from client requests (§8.8). If any service ever trusts a header for identity, a client can forge
it. **The JWT signature is the only identity assertion in the system.** This rule is what makes
"no service-to-service auth" (§6.2) safe.

---

## 12. Testing

### 12.1 Principle

> **The tests must protect the invariants that make checkout correct. Everything else is optional.**
> The invariants are: no oversell, no order without a stock decrement, no duplicate order, no
> double stock release, no lost event.

### 12.2 Current state

38 tests. Coverage is concentrated on models, serializers, and views **for the catalog app**;
`cart`, `wishlist`, and `orders` are largely untested. **There is no test for `PlaceOrder` at
all** — the single most complex function in the codebase.

| App | Tested? | Note |
|---|---|---|
| `products` | Yes | The best-covered area |
| `accounts` | Partial | Manager tests; no registration-flow or authz tests |
| `cart` | **No** | Including no arithmetic tests |
| `wishlist` | **No** | |
| `orders` | **No** | **No checkout test** |
| `notifications` | **No** | |
| `config` | **No** | |

### 12.3 Required test matrix

| Level | Scope | Quantity | Runs in |
|---|---|---|---|
| **Unit** | Pure logic: state machine (§3.7), price computation, idempotency-key handling | ~60 | Every commit |
| **Integration** | Real Postgres, real HTTP handler, real SQL. **Every §3.4 branch** | ~40 | Every commit |
| **Contract** | Event schemas; `role` claims; error shapes; JWKS fixture | ~15 | Every commit |
| **Concurrency** | §12.4 | 3 | Every commit |
| **Chaos** | §12.5 | 4 | Nightly |
| **Migration** | Response-by-response comparison | Per phase | Per phase |

**Integration tests use real Postgres, not mocks.** Mocking `SELECT … FOR UPDATE` or an
`ON CONFLICT` clause tests your mock, not your code. This system is 4–6 SQL statements per endpoint;
a testcontainer or a local Postgres is affordable and catches everything a mock cannot — constraint
violations, deadlock behaviour, isolation-level surprises, and transaction semantics.

**Mock only what is genuinely external:** JWT verification (fixture keys) and time (inject a clock).

### 12.4 The three concurrency tests (the highest-value tests in the system)

**C1 — Last unit, two buyers.** Two goroutines, one unit of stock, one shared cart-free path:

```go
func TestConcurrentCheckout_LastUnit_ExactlyOneSucceeds(t *testing.T) {
    db := testDB(t)                       // real Postgres
    seed(t, db, productID, size, 1)       // available = 1

    results := make(chan int, 2)
    for _, user := range []int{1, 2} {
        go func(u int) {
            results <- placeOrder(t, db, u, productID, size, 1)
        }(user)
    }

    a, b := <-results, <-results
    require.Equal(t, 1, countOf(a, b, http.StatusCreated),
        "exactly one checkout must succeed")
    require.Equal(t, 0, countOf(a, b, http.StatusInternalServerError),
        "no request may 500 — the loser gets a clean 409")

    assert.Equal(t, 0, availableFor(t, db, productID, size), "stock must be 0, never -1")
    assert.Equal(t, 1, orderCount(t, db), "exactly one order")
    assert.Equal(t, 1, movementCount(t, db, productID, -1), "one ledger entry")
}
```

This is the test that fails against the current code. `orders/views.py:65-70` reads stock, `:97-100`
writes it, no lock — two concurrent checkouts both read 1, both write 0, and one raises
`IntegrityError` on the `PositiveIntegerField` at commit, surfacing a 500.

**C2 — Idempotent retry.** Fire `PlaceOrder` 10 times with the same `Idempotency-Key`, concurrently.
Assert: exactly 1 order, exactly 1 stock decrement, and all 10 responses carry the same `order_id`.
Assert status is `201` or a replayed `200` — never a duplicate.

**C3 — Cancellation under concurrency.** Fire `CancelOrder` 10 times concurrently for one order.
Assert: stock restored **exactly once**, one `OrderCancelled.v1` event emitted, one
`stock_released` row. This proves the `stock_released(order_id UNIQUE)` guard (§3.3).

### 12.5 Chaos tests (nightly)

| Test | Simulate | Assert |
|---|---|---|
| **X1 — Redis down** | Stop Redis; attempt checkout | Order created, stock decremented, **checkout succeeds**, `outbox_unpublished_total` grows (§3.12 F8) |
| **X2 — Redis flush** | `FLUSHALL` mid-flight; restart | Relay republishes from the outbox; consumers `XAUTOCLAIM`; **no lost events** (§2.6) |
| **X3 — Consumer crash mid-batch** | Kill `workers` after reading events, before commit | Unacked entries redelivered after the 60s visibility timeout; `processed_events` prevents duplicate side effects |
| **X4 — Postgres failover** | Restart Postgres mid-checkout | `COMMIT` fails; client gets a clean 503/502; retry with the same key succeeds; **no partial state** |

X1 and X2 are the tests that justify the whole event design. If they pass, the system is
resilient to Redis; if they are never written, the design is only asserted.

### 12.6 Migration verification (per phase)

The pattern is a **golden-master comparison** — the highest-value technique in this migration:

```
For each endpoint, for N representative requests:
    response_old  = monolith response (before cutover)
    response_new  = new service response
    diff(response_old, response_new) must be empty,
        excluding explicitly allowlisted fields (timestamps, ids, ordering)
```

Run continuously during dual-run. It converts "the migration looks fine" into a measurable claim, and
it is the actual exit criterion for Phases 2, 3, and 4 (§7).

| Phase | Verification |
|---|---|
| 0 | All existing tests pass; C1/C2/C3 added and passing; no FK to a foreign table |
| 1 | Notification rows identical for 7 days; consumer lag < 60s |
| 2 | Rollup totals equal live Django aggregates for 7 days; rebuild-from-zero drill |
| 3 | Product responses byte-identical for 7 days (order preserved, images ordered) |
| 4 | Cart/wishlist/order responses identical for 7 days |
| 5 | Full journey E2E: place → confirm → ship → deliver; place → cancel; C1 in production |

### 12.7 E2E scope

Use **Playwright** (the SPA stack is React; a JS-native driver avoids a second language):

| Flow | Priority |
|---|---|
| Register → verify → login → add to cart → checkout → order appears in "My Orders" | **Critical** |
| Admin: confirm → ship → deliver; cancel with stock restored | **Critical** |
| Insufficient stock → clean error, cart intact | **Critical** |
| Cross-user access attempt → 404 (not 403) | High |
| Token expiry → refresh → retry succeeds | High |

### 12.8 Honest coverage targets

| Area | Target | Why |
|---|---|---|
| `checkout` package | **95%+**, branch coverage | The correctness-critical path. Untested branches here are revenue bugs |
| `inventory` package | 90%+ | Same |
| `order` state machine | 100% of transitions, positive and negative | It is a table; testing all of it is cheap |
| Go HTTP handlers | 70%+ | Integration tests cover the SQL |
| Django (Phase 0) | Raise from current to 70% on `cart`/`orders` | Everything extracted later is copied from here |

**Explicitly not the target:** 100% overall. Chasing it produces low-value tests of error-wrapping
and struct literals. The five tests that matter are C1, C2, C3, X1, and the golden-master comparison.

---

## 13. Rollback

### 13.1 Principle

> **A rollback that requires a data restore is not a rollback; it is a recovery.** Every phase must
> be revertible by a traffic switch or an image redeploy. Data movement is designed so that the
> *old* implementation can always read data the *new* one wrote.

### 13.2 Per-phase rollback

| Phase | Blast radius | Rollback action | Data recovery | Time |
|---|---|---|---|---|
| **0 — Harden** | Monolith only | Revert commits | None | Minutes |
| **1 — Engagement** | Notification reads | Repoint route to Django | None — both were written | < 5 min |
| **2 — Reporting** | Dashboard stats | Repoint to Django aggregates | Rebuild rollups | < 5 min |
| **3 — Catalog** | Product reads + writes | Turn off flag; Django writes resume; Go catalog resyncs from `ProductUpdated.v1` | Replay events | < 30 min |
| **4 — Commerce reads** | Cart/order reads | Repoint routes; writes never moved | None | < 5 min |
| **5 — Commerce writes** | **Checkout** | **See §13.3** | **See §13.3** | 1–4 hours |

### 13.3 The hard one: Phase 5

Writes are the only irreversible step. The rollback decision has to be made fast and against
partial information.

| Situation | Action | Time |
|---|---|---|
| Broken within the first hour, flag not yet at 100% | Set the flag back to 0. **Django is authoritative again.** Go-written orders reconcile by `event_id` — idempotency makes re-sending safe | < 5 min |
| Broken at 100%, duration unknown | **Freeze checkout** (503 from the edge). Do not attempt a partial revert with mixed writers. Determine the divergence window, then choose | 15 min to decide |
| Divergence window known, small | Re-enable **dual-write** for that window: Django mirrors every write from the Go path. Cut reads back to Django. Reconcile offline by `correlation_id` | 1–2 hours |
| Divergence window known, large | **Roll forward.** Fix forward is faster than reconciling a large unknown window | Hours |
| Data corruption detected | Restore from RDS PITR into a new instance; reconcile `orders` ↔ `stock_movement` via the ledger | Hours |

**Why freeze beats revert:** with two active writers you cannot tell which system is right. Stopping
writes preserves a consistent state and gives a clean before/after boundary — which is exactly what
the `correlation_id` and the outbox give you.

**Why roll forward is usually right:** rollback requires understanding what the new system did
during the window. Roll forward requires only fixing the bug. Choose rollback when the new system is
*wrong in a way you cannot characterise*; choose roll-forward when it is *wrong in a known way*.

### 13.4 Why rollback is cheap for most phases

| Mechanism | Effect |
|---|---|
| Dual-write during a bounded window | Both implementations hold the data, so reverting reads is free (§7.3–7.5) |
| Feature flags | Toggle without a deploy. Per-route and per-percentage |
| Image tags = commit SHA | `docker compose up` with the previous tag. No rebuild |
| Append-only ledgers | `stock_movement` and `outbox` are never updated or deleted, so a re-run reconstructs rather than guesses |
| Idempotent consumers | Replaying events after a rollback is **safe by construction** — `processed_events` and `stock_released` prevent double-application |
| `correlation_id` on every row | The divergence window can be identified **precisely**, which turns "some orders may be wrong" into "these 47 orders are wrong" |

That last row is worth isolating: **correlation IDs are what make an incident bounded.** Without
them, a rollback means "assume the worst since the deploy," which usually means a manual audit of
every order since a timestamp nobody recorded.

### 13.5 Rehearsal

| Rehearsal | Frequency | Verifies |
|---|---|---|
| Rollback of a Phase 3 deploy | Every deploy | Previous image tag works |
| Restore from RDS snapshot | Quarterly | Backups are real |
| Consumer replay from a truncated outbox | Monthly | Idempotency actually prevents duplicates |
| Full-stack game day: kill Redis, restart Postgres, roll back a service | Quarterly | The runbook works before it is needed |

**A rollback plan that has never been executed is a hypothesis.** At this scale a quarterly
rehearsal costs a few hours and is the highest-value reliability activity available.

### 13.6 Data reconciliation job

Not needed in normal operation (that is the point of the transaction). Needed **after** a Phase 5
incident, as a one-off:

```sql
-- Orders with no matching stock decrement. Must return zero rows.
SELECT o.id, o.created_at
  FROM orders_order o
  LEFT JOIN stock_movement m
    ON m.order_id = o.id AND m.reason = 'order_placed'
 WHERE m.id IS NULL AND o.status <> 'cancelled';

-- Stock decrements with no matching order. Must return zero rows.
SELECT m.id, m.product_id, m.delta
  FROM stock_movement m
  LEFT JOIN orders_order o ON o.id = m.order_id
 WHERE o.id IS NULL AND m.reason = 'order_placed';

-- Cancellations that released stock more than once. Must return zero rows.
SELECT order_id, COUNT(*) FROM stock_released GROUP BY order_id HAVING COUNT(*) > 1;
```

These queries are why `stock_movement` is an immutable ledger (§1.2) rather than a convenience
table. It is the reconciliation safety net that the previous proposal needed a distributed saga to
provide — and here it is three SQL statements that run in a second.

---

## 14. Risk Register

| # | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | **Checkout correctness regresses during the Go rewrite** | Medium | **Critical** | C1/C2/C3 before cutover; golden-master comparison; 10%→50%→100% canary; Django implementation retained for one week | Unassigned |
| R2 | **Inventory co-location is challenged as "not real microservices"** | Medium | Low | This is a technical decision with named triggers (§1.5). The cost of being wrong is one module boundary. The cost of extracting prematurely is a distributed transaction | Unassigned |
| R3 | Phase 5 rollback is needed and messy | Medium | High | Freeze-then-decide (§13.3); dual-write window; `correlation_id` bounds the damage | Unassigned |
| R4 | Event backbone is over-engineered | Low | Low | Redis is already deployed. The outbox is 1 table. Total new infrastructure: **0** | Unassigned |
| R5 | Team velocity drops during the migration | **High** | Medium | Consumer-first ordering means Phases 1–2 are low-risk wins; every phase is independently shippable | Unassigned |
| R6 | Host OOM during a rolling deploy | **High** | **High** | Resize to `t3.medium` in Phase 0 (§8.4). This is the most likely operational incident in the whole plan | Unassigned |
| R7 | Ed25519/JWKS works in Python but not in Go | Low | Medium | Both `PyJWT` and `golang-jwt` support EdDSA. Fallback: RS256, widely supported | Unassigned |
| R8 | Catalog availability projection is stale and misleads customers | Medium | Low | 60s TTL, `PriceChanged` events, soft-delete instead of delete (§7.2 step 0.5), checkout enforces the truth | Unassigned |
| R9 | Sentry/monitoring silently disabled (`SENTRY_DSN=""`) | Medium | Medium | Fail fast if expected; Phase 0 exit criterion | Unassigned |
| R10 | Idempotency keys grow unbounded | Low | Low | Retention policy in §3.8, pruned on the relay's existing schedule | Unassigned |
| R11 | Someone adds a "small" synchronous call later and re-couples the system | **Medium** | **High** | §5.1 classification test as a review checklist item; the composition-root layout makes the sync surface visible in one file | Unassigned |

R11 deserves its own note: **the architecture's main property is that there are no inter-service
calls, and the main threat to it is a reasonable-sounding future feature.** A single `GET` to Catalog
inside the checkout transaction would reintroduce everything §1 and §3 removed. The classification
test (§5.1) needs to be in the PR template, not just in this document.

---

## 15. Verdict

`ARCHITECTURE_ANALYSIS.md` is thorough and correctly identifies most of the domain problems. Its
central architectural claim is wrong, and it is wrong in an expensive direction.

| | Previous analysis | This review |
|---|---|---|
| Services | 7 (+ Identity) | **4** (+ Identity) |
| Synchronous service-to-service calls | 1 (`inventory.reserve`) | **0** |
| Distributed transactions | 1 saga, 3 compensations, reconciliation required | **0** |
| New stateful infrastructure | Kafka/RabbitMQ | **0** (Redis already deployed) |
| Checkout's dependency on its neighbours | Catalog + Inventory | **None** |
| Inventory ownership | Contradictory (§0) | Decided, justified, with exit triggers |
| Host | `t3.micro`, already overcommitted | `t3.medium`, budgeted (§8.2) |
| Checkout correctness under concurrency | Race → 500 | **Tested (§12.4 C1)** |

**The single highest-leverage change in this entire document is not an architectural one.** It is
the `cart_item` price snapshot (§3.5). It is a pure refactor of a single existing table, it takes
hours, and it removes the checkout path's only remaining cross-domain dependency. It would improve
the system whether or not any service is ever extracted.

**The second highest-leverage change is `SELECT … FOR UPDATE` plus the conditional decrement in
checkout (§3.4).** The system can currently oversell, and does so with a 500 rather than a 409.
That is a live bug, and fixing it in Django before any migration work begins is both cheaper and
safer than fixing it in Go.

**Third: resize the host.** `t3.micro` is running 7 containers against 1 GB of RAM with no memory
limits (§8.1). That is the most likely incident in the current system, and it has nothing to do with
microservices.

**Recommended order of work — none of it requires deciding anything else:**

1. Fix the oversell race (§12.4 C1 proves it).
2. Add cart price snapshots (§3.5).
3. Resize the host to `t3.medium` (§8.4).
4. Introduce `stock_level` + `stock_movement` and delete the four ad-hoc stock writers.
5. Add correlation IDs and checkout metrics (§10.2–10.3).
6. Add the outbox and the idempotency key (§3.8).
7. Switch to Ed25519 + JWKS (§6.2).
8. *Then* begin extracting, starting with a consumer (§7.3).

Steps 1–7 are all Phase 0. **Every one of them makes the monolith better on its own**, which is the
practical argument for doing them first: the migration is not a bet on microservices, it is a queue
of improvements that happen to leave the monolith behind.

**What would change these conclusions:** a warehouse or multi-region stock model (R2 → extract
Inventory), a synchronous inter-service call appearing on a write path (§10.4 → add tracing), or
sustained event volume above ~100/s (§2.7 → NATS). None of the three holds today.

---

## Appendix A — Decision Index

| # | Decision | Outcome | Section |
|---|---|---|---|
| A1 | Inventory ownership | **Module inside Commerce.** No separate service | §1 |
| A2 | Stock model | On-hand decrement at order placement. Reservation model deferred | §3.7 |
| A3 | Event durability | **Postgres outbox — mandatory** | §2.4 |
| A4 | Event transport | **Redis Streams.** Kafka rejected | §2.5 |
| A5 | Dead letters | Application-level table, not a broker DLQ | §2.5 |
| A6 | Checkout structure | **One local ACID transaction. No saga** | §3.4 |
| A7 | Compensating actions | **None in checkout.** Cancellation is a forward operation | §3.11 |
| A8 | Cart prices | **Snapshots**, with `PriceChanged.v1` async repricing | §3.5 |
| A9 | Idempotency | HTTP `Idempotency-Key` + `event_id` + natural key | §3.8 |
| A10 | Inter-service calls | **Zero** | §5.2 |
| A11 | Wire format | HTTP + JSON. No gRPC | §5.5 |
| A12 | Availability propagation | Async projection to Catalog. Never a sync call | §5.4 |
| A13 | Caches | Per-service only. No shared cache | §4.5 |
| A14 | Token signing | **Ed25519 asymmetric + JWKS** | §6.2 |
| A15 | Token revocation | 30-min TTL bound + refresh-family reuse detection | §6.4 |
| A16 | Authorization | `role` claim + ownership as a query filter. 404 for others | §6.3 |
| A17 | Identity extraction | **Deferred.** Django remains | §7.8 |
| A18 | Orchestration | **Docker Compose. No Kubernetes** | §8.3 |
| A19 | Postgres | 5 databases, one instance. RDS recommended | §8.6 |
| A20 | Redis config | **Add `--appendonly yes`, `--maxmemory-policy noeviction`** | §8.7 |
| A21 | Host size | **`t3.medium` (4 GB).** `t3.micro` insufficient | §8.4 |
| A22 | PgBouncer | Not at 25 connections | §8.3 |
| A23 | Go dependencies | **3 total** (pgx, golang-jwt, go-redis) | §9.2 |
| A24 | ORM | **None.** Hand-written SQL | §9.3 |
| A25 | Metrics | Prometheus text format, hand-rolled. `client_golang` acceptable | §10.3 |
| A26 | Tracing | W3C `traceparent` + `trace_id` in logs. **No OTel SDK** | §10.4 |
| A27 | Required alerts | 4 (checkout failure, outbox backlog, dead letters, host memory) | §10.5 |
| A28 | Liveness vs readiness | Separate. **`/healthz` never checks dependencies** | §8.9 |
| A29 | Cross-service FKs | **All 7 broken** to opaque ids | §4.4 |
| A30 | Deletion policy | **Soft delete.** Hard delete cannot destroy order history | §7.2 |

## Appendix B — Corrections to `ARCHITECTURE_ANALYSIS.md`

| # | Location | Analysis says | This review says |
|---|---|---|---|
| B1 | §3, §5.1, §5.2, §6.2, §10, §11 | Inventory is a separate service owning its own DB, with sync `reserve`/`release` | **Incorrect and self-contradictory (§0).** Inventory is a Commerce module; the sync API and the saga are deleted |
| B2 | §4.3 | `ordering-svc` owns `inventory` | Consistent with this review's conclusion, but incompatible with §5.1/§10/§11 in the same document |
| B3 | §10, §11 | Inventory extraction is Phase 4, before Commerce | **Reordered.** Commerce (with Inventory) is Phases 4–5. Splitting them would require the rejected saga |
| B4 | §6.2 Rule 3 | "the only synchronous cross-service write is `inventory.reserve`" | **Wrong after B1.** There are **zero** synchronous service-to-service calls (§5.2) |
| B5 | §7.x | Checkout saga with compensating actions | **Replaced** by one local ACID transaction (§3.4) |
| B6 | Service count | 7 | **4** (§7.1) |
| B7 | Message broker | Kafka or RabbitMQ | **Redis Streams** + outbox; Kafka rejected on a 4-order-of-magnitude throughput gap (§2.3) |
| B8 | Rollback | Generic | Per-phase, with a distinct procedure for the one irreversible phase (§13) |
| B9 | Host sizing | Not addressed | **`t3.micro` is overcommitted today** (§8.1). Resize to `t3.medium` |
| B10 | Redis persistence | Not addressed | **No AOF in production** (§2.6, §8.7) |
| B11 | Observability | Metrics/traces discussed at framework level | Sentry, correlation IDs, and the 4 required alerts specified; OTel explicitly deferred (§10) |

## Appendix C — Evidence Index

Every claim in this review is traceable to the code.

| Claim | Evidence |
|---|---|
| Oversell race | `orders/views.py:65-70` reads, `:97-100` writes, no lock; `Product.stock` is `PositiveIntegerField` → `IntegrityError` at commit → 500 |
| Cart has no price snapshot | `cart/serializers.py:16` `obj.product.price * obj.quantity`; `:29` sums over live products |
| Duplicate cancellation logic | `orders/views.py:24-48` vs `orders/admin_views.py:76-102` |
| Product deletion destroys carts and wishlists | `cart/models.py` `CartItem.product → CASCADE`; `wishlist/models.py` `product → CASCADE` |
| Order lines lose their product | `orders/models.py` `OrderItem.product → SET_NULL` while `product_name`/`price` are snapshots |
| Notifications inside transactions | `orders/views.py` and `accounts/views.py` create `Notification` and call Celery inline |
| Dead `ProductSize.stock` | `products/models.py` — declared, never read or written |
| Dead `low_stock` notification type | `notifications/models.py` — in `NOTIFICATION_TYPES`, never emitted |
| `IsOwnerOrAdmin` unused | `accounts/permissions.py` — defined, no import anywhere |
| Symmetric JWT | `settings/base.py:84` `SIMPLE_JWT`, HS256 with shared `SECRET_KEY` |
| `role` absent from claims | SimpleJWT default claim set is `user_id`/`token_type`/`exp`/`jti` |
| Redis has no persistence | `docker-compose.prod.yml:49` `redis-server --requirepass …` — no `appendonly` |
| Redis/DB not exposed | Only 2 `ports:` blocks in `docker-compose.prod.yml` (flower `127.0.0.1:5555`, nginx `8080:80`) |
| Host overcommitted | 7 containers on `t3.micro` (1 GB); no `mem_limit` in either compose file |
| Cross-origin SPA | `settings/prod.py:44-45` `SameSite=None` — frontend on Vercel, API on EC2 |
| HSTS present | `settings/prod.py:38-40` |
| Dependencies pinned | `requirements/base.txt` — exact versions; `dev.txt` separate; Dockerfile installs `base.txt` only |
| No correlation IDs | `grep log_id\|request_id\|correlation` → no application hits |
| No app metrics | `prometheus-client` in `base.txt`, imported only by Flower |
| `prometheus-client` unused by app | Dependency present; no application import |
| Notification writes inline | `orders/views.py`, `accounts/views.py` |
| Foreign keys to break | 7 enumerated in §4.4 |
| Event volume | 2 Celery tasks total; 1 EC2; 27 customer + 18 admin endpoints |
| Django security posture | `prod.py` HSTS + secure cookies + `DEBUG=False`; `dev.py` `ALLOWED_HOSTS=["*"]`, `CORS_ALLOW_ALL_ORIGINS=True` (dev only) |

---

*End of review. **No application code was modified, no service was created, and no database was
migrated in producing this document.** Findings above marked "Current" describe the repository as it
stands; findings marked "Required" describe changes that this document recommends but does not
perform.*
