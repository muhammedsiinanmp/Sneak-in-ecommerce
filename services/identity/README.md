# identity

**Status: Phase 0 — structure only.** This directory contains no code. The Django application still
lives in `backend/` and moves here in a later phase (§2.8, §20).

## Responsibility

Owned by **Django**, and it stays Django (R §7.8, R §1.1).

- authentication
- identity
- token issuance
- identity-related data

Identity is built first, because every other service depends on its tokens (I §16.2).

## Service metadata (§13.2)

| Field | Value |
|---|---|
| API base path | `/api/v1/` versioned prefix (R §7.2 item 0.9). The auth surface is `/api/v1/auth/*`. The full surface is not frozen until `contracts/openapi/` exists — §20 Phase 1 |
| Database | `identity` (R §4.2, Database 1) |
| Events produced | `UserRegistered.v1` (§8.1) |
| Events consumed | None |
| Local run command | Not yet available. `make dev` is I §18.5 and arrives with the service. Today the existing app runs from `backend/` via `docker compose up --build` (§2.8) |
| Owner | Unassigned — the CODEOWNERS roster is unresolved (§21.2 Q4) |

## Not here yet

Per §18 this phase does not create `manage.py`, `config/`, `apps/`, `requirements/`, migrations, or a
`Dockerfile`. Those arrive with §20 Phase 2.
