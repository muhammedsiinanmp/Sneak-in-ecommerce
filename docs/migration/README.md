# Microservices migration plan

This is a plan. No service code exists yet: the running app is still the Django monolith in `backend/` and the React app in `e-commerce-app/`, described in the [main README](../../README.md).

## Status

**Status: Phase 0 of the modernization is complete.** Today the whole system is one Django app
(`backend/`) and one React app (`e-commerce-app/`). Nothing has moved into `services/` yet — those
directories and their READMEs describe where each service will live and what it will own.

The target is four services — `identity`, `catalog`, `commerce`, `workers` — on a
Terraform-managed platform. Three properties every change is judged against:

| Property | Source |
|---|---|
| Zero synchronous service-to-service calls | R §5.1, I §1.1 |
| At-least-once events with durable deduplication | R §3.6–3.9, I §8 |
| Behaviour preserved through the migration, proven by a golden master | R §12.6 |

### Phases (§20)

| Phase | Repository work | Gate that must exist first |
|---|---|---|
| **0. Structure** | Layout, `Makefile`, `CODEOWNERS`, PR template, `AGENTS.md` | ADR-0001, ADR-0002, ADR-0003 |
| **1. Contracts first** | Event and API schemas before any producer exists | §2.4 |
| **2. Identity** | Django stays Django; JWT, JWKS, refresh rotation | §5.3 |
| **3. Commerce** | Go service; the checkout transaction; the outbox relay | §7.5, ADR-0003 |
| **4. Catalog** | Go service; product reads behind a feature flag | R §12.6 golden master |
| **5. Engagement** | Go service; notifications; Celery database separated | R §7.3, I §8.10 |
| **6. Reporting** | Go service; `OrderPlaced.v1` consumption | §8.6 |
| **7. Infrastructure** | Terraform modules; staging; CI on production images | §2.5, §19.1 |
| **8. Cutover** | Per-phase dual-run with golden-master comparison | §7.6, §9.6 |

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Backend | Django 5.1 + Django REST Framework |
| Frontend | React 19 + Vite + TailwindCSS |
| Database | PostgreSQL 16 (AWS RDS in production) |
| Cache / Queue | Redis 7 |
| Background tasks | Celery + Celery Beat |
| Auth | JWT via SimpleJWT (token rotation + blacklisting) |
| Containerization | Docker + Docker Compose |
| Hosting | AWS EC2 t3.micro + Vercel |
| CI/CD | GitHub Actions |

---

## Features

**Customer**

- Browse products with filtering by brand, category, price
- Persistent cart and wishlist across sessions
- Order placement with price snapshot (price locked at purchase time)
- Order history and status tracking
- JWT authentication with silent token refresh

**Admin**

- Product, inventory, and brand management
- Order status management (confirm, ship, deliver, cancel)
- User management and role control
- Daily sales report auto-generated and emailed at 12:30 AM via Celery Beat

---

## Repository layout (§2.1)

```
sneakin/
├── services/                    # Application code. One directory per service.
│   ├── identity/                # Django. Stays Django (R §7.8)
│   ├── catalog/                 # Go
│   ├── commerce/                # Go
│   └── workers/                 # Go. Engagement + Reporting consumers.
├── contracts/                   # Machine-checked interface definitions.
│   ├── events/                  # JSON Schema per event type and version
│   ├── openapi/                 # One OpenAPI document per service
│   └── sql/                     # Shared DDL constraints and test fixtures
├── infra/terraform/             # modules/ · environments/ · shared/
├── deploy/                      # pipelines/ · manifests/
├── tests/                       # contract · system · e2e · smoke · chaos · fixtures
├── observability/               # dashboards · alerts · runbooks
├── docs/                        # adr/ · api/ · operational/ · migration/
├── scripts/                     # Repository maintenance only.
├── .github/                     # workflows/ · CODEOWNERS · PULL_REQUEST_TEMPLATE.md
├── Makefile                     # Every workflow is a target (§2.6)
├── ARCHITECTURE_REVIEW.md       # R — rank 1
├── INFRASTRUCTURE_ARCHITECTURE.md  # I — rank 1
├── REPOSITORY_ENGINEERING_STANDARD.md  # § — rank 2
├── AGENTS.md                    # How work is done here — rank 4
└── README.md                    # This file
```

The transitional application is not part of that list and will be dismantled as phases 2–6 land:

```
backend/          # Django monolith. Moves to services/identity, services/commerce (§20)
e-commerce-app/   # React + Vite frontend
nginx/            # Container Nginx config
docker-compose.yml · docker-compose.prod.yml · docker-compose.override.example.yml
```

---

## Service ownership

| Service | Runs | Database(s) | Detail | Owner |
|---|---|---|---|---|
| `identity` | Django (stays Django, R §7.8) | `identity` | [services/identity/README.md](../../services/identity/README.md) | Unassigned — §21.2 Q4 |
| `catalog` | Go | `catalog` | [services/catalog/README.md](../../services/catalog/README.md) | Unassigned — §21.2 Q4 |
| `commerce` | Go | `commerce` | [services/commerce/README.md](../../services/commerce/README.md) | Unassigned — §21.2 Q4 |
| `workers` | Go | `engagement`, `reporting` | [services/workers/README.md](../../services/workers/README.md) | Unassigned — §21.2 Q4 |

Five databases, four services: `engagement` and `reporting` are separate databases inside
`workers` (R §4.2). There is no `services/inventory/` — inventory is a module inside `commerce`
(R §1.2, R §4.2).

---

## Documentation and authority

Read in order. Higher rank wins.

| Rank | Document | Authoritative for |
|---|---|---|
| 1 | [ARCHITECTURE_REVIEW.md](../../ARCHITECTURE_REVIEW.md) | Domain model, service ownership, events, checkout, data ownership |
| 1 | [INFRASTRUCTURE_ARCHITECTURE.md](../../INFRASTRUCTURE_ARCHITECTURE.md) | Modules, networking, runtime, datastores, CI/CD, environments |
| 2 | [REPOSITORY_ENGINEERING_STANDARD.md](../../REPOSITORY_ENGINEERING_STANDARD.md) | Layout, naming, testing, security, git, ADRs, definition of done |
| 3 | [docs/adr/](../adr/README.md) | One decision each, within the scope delegated to it |
| 4 | [AGENTS.md](../../AGENTS.md) | Workflow, scope discipline, local commands |
| 5 | `README.md` and `docs/**` (non-ADR) | What exists today and how to run it |

R and I do not outrank each other — they cover disjoint domains. Code never outranks a document.

**Reference notation.** `§14` means the standard. `R §7.5` means a section of
ARCHITECTURE_REVIEW.md. `I §18.1` means a section of INFRASTRUCTURE_ARCHITECTURE.md. A bare `§`
pointing at another document is rejected in review (§0.2).

**Architecture Decision Records** live in [`docs/adr/`](../adr/README.md). The index there lists
every ADR with its status; ADR-0001 through ADR-0004 are `Accepted`. An ADR may not be
implemented while it is still `Proposed` (§14.4).

**If you are an agent,** read [`AGENTS.md`](../../AGENTS.md) before your first edit. It fixes the
authority chain, the mandatory startup procedure, the four work classes, the stop conditions, and
the completion-report format every task must end with.
