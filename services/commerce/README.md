# commerce

**Status: Phase 0 — structure only.** This directory contains no code. `backend/apps/cart`,
`orders`, and `wishlist` move here in a later phase (§2.8, §20 Phase 3).

## Responsibility

**Go** service. Owns:

- cart
- wishlist
- orders
- inventory
- checkout
- transactional outbox

**Inventory is a module inside Commerce, not a service.** Do not create `services/inventory/`
(R §1.2, R §4.2). It co-locates with orders so the checkout transaction stays one local
PostgreSQL transaction (R §3.4).

Commerce also owns the outbox **and its relay** (I Appendix A.1, §1.4 C-9).

## Service metadata (§13.2)

| Field | Value |
|---|---|
| API base path | `/api/v1/{cart,orders,wishlist}` (R §7.1 target topology). Not frozen until `contracts/openapi/` exists — §20 Phase 1 |
| Database | `commerce` (R §4.2, Database 3) |
| Events produced | `OrderPlaced.v1`, `CheckoutCompleted.v1`, `OrderCancelled.v1`, `OrderStatusChanged.v1`, `StockAdjusted.v1`, `LowStockDetected.v1`, `StockChanged.v1` (§8.1) |
| Events consumed | `ProductUpdated.v1`, `ProductDeleted.v1`, `PriceChanged.v1`, and `CheckoutCompleted.v1` (cart-clear, self) (§8.1) |
| Local run command | Not yet available. `make build-commerce` is I §18.7 and arrives with the service |
| Owner | Unassigned — the CODEOWNERS roster is unresolved (§21.2 Q4) |

## Not here yet

Per §18 this phase does not create `cmd/`, `internal/`, `go.mod`, migrations, or a `Dockerfile`.
The outbox table and relay are Phase 3 work, not Phase 0.
