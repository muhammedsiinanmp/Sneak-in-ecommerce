# workers

**Status: Phase 0 — structure only.** This directory contains no code. `backend/apps/notifications`
moves here for engagement, and the reporting tables are new (§2.8, §20 Phases 5–6).

## Responsibility

**Go worker processes.** Responsible for asynchronous workloads such as:

- event consumption
- engagement processing
- reporting processing

Do not split workers into additional services unless a later architectural decision explicitly
requires it. Two worker roles, one deployable directory.

`workers` owns **two** of the five logical databases — `engagement` and `reporting` are separate
databases inside one service (R §4.2, Databases 4 and 5).

## Service metadata (§13.2)

| Field | Value |
|---|---|
| API base path | None. The target topology puts only `catalog` and `commerce` behind the edge (R §7.1) |
| Database | `engagement` and `reporting` (R §4.2, Databases 4 and 5) |
| Events produced | None (§8.1) |
| Events consumed | **engagement:** `OrderPlaced.v1`, `OrderCancelled.v1`, `OrderStatusChanged.v1`, `LowStockDetected.v1`, `UserRegistered.v1`. **reporting:** `OrderPlaced.v1`, `OrderCancelled.v1`, `OrderStatusChanged.v1`, `StockAdjusted.v1`, `UserRegistered.v1` (§8.1) |
| Local run command | Not yet available. `make build-workers` is I §18.7 and arrives with the service |
| Owner | Unassigned — the CODEOWNERS roster is unresolved (§21.2 Q4) |

## Not here yet

Per §18 this phase does not create `cmd/`, `internal/`, `go.mod`, migrations, or a `Dockerfile`.
Consumers, consumer groups, and the outbox relay arrive with §20 Phases 3, 5, and 6.
