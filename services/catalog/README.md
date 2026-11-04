# catalog

**Status: Phase 0 — structure only.** This directory contains no code. `backend/apps/products`
moves here in a later phase (§2.8, §20 Phase 4).

## Responsibility

**Go** service. Owns:

- products
- categories / catalog data
- catalog reads and writes

Catalog is read-only from the edge's point of view at cutover: reads flip first behind a feature
flag, writes stay in Django until the later write cutover (R §7.5).

## Service metadata (§13.2)

| Field | Value |
|---|---|
| API base path | `/api/v1/products/*` (R §7.1 target topology). Not frozen until `contracts/openapi/` exists — §20 Phase 1 |
| Database | `catalog` (R §4.2, Database 2) |
| Events produced | `ProductUpdated.v1`, `ProductDeleted.v1`, `PriceChanged.v1` (§8.1) |
| Events consumed | `StockChanged.v1` — availability cache (R §4.5) |
| Local run command | Not yet available. `make build-catalog` is I §18.7 and arrives with the service |
| Owner | Unassigned — the CODEOWNERS roster is unresolved (§21.2 Q4) |

## Not here yet

Per §18 this phase does not create `cmd/`, `internal/`, `go.mod`, migrations, or a `Dockerfile`.
Catalog is a Go service, so its code lands under `internal/` (§2.3).
