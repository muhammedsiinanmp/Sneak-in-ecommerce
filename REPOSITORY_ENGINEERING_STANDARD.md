# Repository Engineering Standard — SneakIn

**Status:** Authoritative. Design-only document; implements no code.
**Scope:** How humans and AI agents engineer inside this repository.
**Does not define:** Application/domain architecture (`ARCHITECTURE_REVIEW.md`) or
infrastructure/platform architecture (`INFRASTRUCTURE_ARCHITECTURE.md`).

---

## 0. Purpose, Conventions, and How to Read This Document

### 0.1 Purpose

Two architecture documents exist and are approved. Neither is sufficient to implement against,
because both answer *what the system is* rather than *how work is done in this repository*. Neither
contains an ADR process, a `docs/` structure, a commit convention, an environment-variable
convention, a CODEOWNERS roster, or a change-classification scheme.

This document fills exactly that gap. It is authoritative for **repository-level engineering
practice** and deliberately says nothing about what the services do.

| Question | Answered by |
|---|---|
| Who owns inventory? | R §1 |
| What is the checkout transaction? | R §3.4 |
| Do we use PgBouncer? | I §7.5 |
| Which Go libraries may I import? | R §9.2, restated as rules in §4 |
| Where does my service's code live? | §2 |
| What do I name this table? | §3 |
| Do I need an ADR for this? | §14, §18 |
| May I weaken a test to make it pass? | §15.9, §17 |

### 0.2 Reference notation

This is mandatory, because the failure mode it prevents is an agent citing the wrong document.

| Form | Means |
|---|---|
| `§N`, `§N.M` | **This document.** `REPOSITORY_ENGINEERING_STANDARD.md` |
| `R §N`, `R §N.M` | `ARCHITECTURE_REVIEW.md` |
| `I §N`, `I §N.M` | `INFRASTRUCTURE_ARCHITECTURE.md` |

**MANDATORY:** a reference to another document always carries its prefix. A bare `§` in a PR
description, commit message, ADR, or code comment is ambiguous and is rejected in review.
**Enforcement:** Review.

### 0.3 Rule classification

Every rule is labelled. The label determines what happens when it is broken.

| Label | Meaning | Consequence of violation |
|---|---|---|
| **MANDATORY** | Must be followed. No exception without a recorded ADR | PR blocked, or an ADR |
| **PROHIBITED** | Must not be done. Same authority as MANDATORY | PR blocked, or an ADR |
| **RECOMMENDED** | Follow unless there is a specific reason not to | Reviewer may request a change; the author may decline with a reason |
| **DEFERRED** | A decision is required before the relevant work starts. Listed in §21 | Work depending on it should not start |

**MANDATORY:** every rule states its enforcement mechanism. A rule nobody can check is an opinion.
Where automation is impossible, the rule says so and names the human review that covers it.
**Enforcement:** Review — the PR checklist in §16 is read against this rule.

### 0.4 Enforcement mechanisms

| Mechanism | Meaning |
|---|---|
| **CI** | A job in `.github/workflows/` fails the PR |
| **Review** | A human reviewer must check it |
| **ADR** | A record in `docs/adr/` is required before merge |
| **Compiler** | Enforced by the language or by `internal/` visibility |

### 0.5 What this document deliberately does not do

| Not doing | Reason |
|---|---|
| Restate the domain model | R is authoritative. Duplicating it creates two sources that drift |
| Restate infrastructure topology | I is authoritative |
| Add a technology | §0.7 |
| Mandate a repository-wide coverage number | R §12.8 sets **per-area** targets and explicitly rejects chasing 100% overall. A flat number would contradict it |
| Specify every event payload field | §8.2 fixes the envelope; individual payloads belong in `contracts/` |
| Invent tooling where the architecture documents name none | The decision is recorded as an open question (§21) rather than picked silently |

### 0.6 Precedence in one paragraph

R and I are the owners of record for their domains (§1). This document governs practice and **cannot
redefine either**. An ADR changes practice within its scope and cannot change architecture. Code
never outranks a document. When documents disagree, §1.3 applies.

### 0.7 Technology additions require an ADR

Adding any dependency, service, or platform is an **architecture change** (§18 class 7), not an
implementation detail. It requires an ADR under §14.

This applies with particular force to the twenty technologies I §22 records as deliberately unused,
each with a stated reason and a named revisit trigger (§14.5): Kubernetes, Kafka, NATS, RabbitMQ, a
service mesh, gRPC, an API gateway, ELK, Loki, the full OpenTelemetry stack, Redis Cluster, VPC
endpoints/PrivateLink, a NAT gateway, read replicas, Aurora, Lambda, Step Functions, Terraform
Cloud, a service mesh for egress control, and a full browser matrix in Playwright.

**Each remains rejected.** Introducing one requires an ADR that addresses the specific trigger its
rejection named. "We might need it eventually" is not a trigger.

**PROHIBITED:** adding anything I §22 does not list without an ADR — the list is not exhaustive of
what may be questioned. **Enforcement:** Review.

---

## 1. Authority and Conflict Resolution

### 1.1 The authority hierarchy

```
  ┌──────────────────────────────────────────────────────────────────┐
  │ ARCHITECTURE_REVIEW.md         Application / domain architecture │
  │ INFRASTRUCTURE_ARCHITECTURE.md Infrastructure / platform        │
  │                                        Owner of record each        │
  └──────────────────────────────────────────────────────────────────┘
                    │  neither is subordinate to the other
                    ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │ REPOSITORY_ENGINEERING_STANDARD.md   Repository practice          │
  │ Cannot redefine the two above. Where it touches architecture it   │
  │ points at the owning document.                                   │
  └──────────────────────────────────────────────────────────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
  docs/adr/             AGENTS.md          README, runbooks,
  One decision within   How an agent       docs/operational/
  delegated scope       should work        Implementation docs
  Supersedes §— of      Cannot contain
  this document         architecture
```

| Rank | Artifact | Authoritative for | Explicitly **not** authoritative for |
|---|---|---|---|
| 1 | `ARCHITECTURE_REVIEW.md` | Domain model, service ownership, event contracts, checkout semantics, data ownership, application technology choices, app-level testing targets | Infrastructure topology, CI/CD, deployment, repository layout, naming |
| 1 | `INFRASTRUCTURE_ARCHITECTURE.md` | Infrastructure modules, networking, runtime, images, datastores, secrets/IAM, edge, observability, CI/CD, environments, cost, operations | Domain model, event semantics, checkout design, data-ownership rules |
| 2 | `REPOSITORY_ENGINEERING_STANDARD.md` | Repository layout, naming, language standards, API conventions, testing practice, security practice, observability practice, git/collaboration, documentation, ADRs, AI-agent rules, DoD | **Any** architecture decision |
| 3 | `docs/adr/NNNN-*.md` | One decision inside the scope delegated to it | Anything outside its scope; R or I |
| 4 | `AGENTS.md` | Agent workflow, tool usage, local commands | Architecture, naming, standards. It references this document; it does not restate it |
| 5 | `README.md`, `docs/**` (non-ADR) | Implementation documentation, runbooks, how-to | Architecture or standards. Describes what exists |

### 1.2 Precedence rules

**PR1 — R and I outrank everything else.** No ADR, AGENTS.md rule, or agent instruction can override
either.

**PR2 — R and I do not outrank each other.** They occupy disjoint domains (§1.1).

**PR3 — An ADR outranks this document, within its scope.** An ADR may change a naming convention, a
package boundary, a test strategy, or a workflow. It may not change a domain model, an event
contract, a datastore topology, or a technology decision.

**PR4 — Code never outranks a document.** If code contradicts a document, either the code is wrong
(fix it) or the document is stale (raise an ADR and update the document in the same PR). "The code
does it this way" is not a justification. **This applies to AI agents with particular force**
(§15.4).

**PR5 — A document never outranks reality silently.** If reality has legitimately diverged, the fix
is an ADR plus a document update in the same PR. Divergence back-filled later is how documents lose
credibility.

**PR6 — Specific beats general, at equal rank.** Within one document, a specific rule beats a
general one. Across R and I, see §1.3.

### 1.3 Conflict resolution procedure

| Step | Action |
|---|---|
| 1 | **Identify rank and domain** of each artifact (§1.1). Is it domain-over-domain, or does a lower-rank artifact contradict a higher-rank one? |
| 2 | **Domain-over-domain** → ranking does not resolve it. Raise an ADR. Until resolved, **do not implement the contested behaviour** |
| 3 | **Lower-rank contradicts higher-rank** → the lower-rank artifact is wrong. Fix it. If already applied, raise an ADR recording the change and update the artifact in the same PR (PR5) |
| 4 | **A document contradicts itself** → a defect in that document. Raise an ADR recording the resolution, then correct both statements in the same PR |
| 5 | **A document is silent** → this document applies if it covers the topic. If neither covers it, an ADR is required before implementation. **Silence is not permission to improvise** (§15.9) |
| 6 | Record the resolution in `docs/adr/` and remove the entry from §21 if it was a known open question |

### 1.4 Known conflicts inherited from R and I

Recorded so nobody re-discovers them.

| # | Conflict | Ranks | Status |
|---|---|---|---|
| C-1 | Redis stream name: `sneakin:dev`/`sneakin:prod` (R §2.5) vs `sneakin:<env>:events` (I §8) | R vs I, different domains | **Resolved** — `sneakin:<env>:events`, Redis DB 3. ADR-0001. R §2.5 corrected |
| C-2 | Image path: `sneakin/commerce:$SHA` (R §8.10) vs `<registry>/<env>/<service>:<sha>` (I §6.2) | R vs I | **Resolved** — I §6.2 owns image naming. §3.10 records R §8.10 as superseded |
| C-3 | Health endpoints: `/api/health/` (R) vs `/healthz`, `/readyz`, `/diagnostics` (I §11.4) | R vs I | **Resolved** — I §11.4. The monolith's `/api/health/` is replaced. §6.9 |
| C-4 | Outbox columns: R §2.5 lists eight; I §8 additionally requires `published_at` | R vs I | **Compatible** — additive. §8.3 specifies the full set |
| C-5 | Alert count: "four" in prose vs five listed (R §10.5) vs nine (I §11.6) | R vs I | **Resolved** — nine, per I §11.6. §11.3 |
| C-6 | Test counts: ~60 unit (R §12.3) vs ~450 (I §14.1) | R vs I | **Resolved** — I §14.1, which reflects the full target state. §9.1 |
| C-7 | Terraform module name: `modules/database` + `modules/database-proxy` (I §3.1) vs `modules/datastores` (I Appendix C item 3) | I self-conflict | **Resolved** — three modules: `database`, `database-proxy`, `redis`. ADR-0002. Appendix C corrected |
| C-8 | Migration ordering: "one service at a time" (R §8.6) vs `identity` first then four in parallel (I §16.2) | R vs I | **Resolved** — I §16.2. §7.6 records both ordering rules distinctly |
| C-9 | Outbox relay owner: per-service process (R §2.5) vs Commerce owns the outbox **and its relay** (I Appendix A.1) | R vs I | **Resolved** — Commerce. §8.5 |
| C-10 | Hosting: resize the host (R §8.4) vs task platform (I §5.2) | R vs I; I explicitly supersedes R §8 | **Resolved** — tasks |
| C-11 | Go Postgres layer: `database/sql` + pgx (R §9.2, R §9.5) while pgx "also provides a connection pool" (R §9.2) — and I §7.5 required a transaction-mode PgBouncer prepared-statement decision | R vs I | **Resolved** — `database/sql` + `jackc/pgx/v5/stdlib` with `default_query_exec_mode=exec`. ADR-0003. R §9.2's rationale clause is deferred to a separate ADR |
| C-12 | PgBouncer: "not yet … revisit above ~40 connections" (R §8.3, R Appendix A A22) vs required, because autoscaling maxima reach 224 server connections (I §7.5) | R vs I | **Resolved** — I §7.5 is the later arithmetic and revises R §8.3 explicitly. §7.5 |

**All twelve conflicts are now resolved.** C-1, C-7, and C-11 were open until ADR-0001,
ADR-0002, and ADR-0003 respectively; the rest were resolved by this document or by the
architecture documents themselves. **PROHIBITED:** implementing a contested behaviour while a
conflict is open. **Why:** §1.3 step 2 — an ADR is required first, so implementing either
side pre-empts the decision. **Enforcement:** Review — the PR description is checked against
§21.1's open list.

**MANDATORY:** an ADR marked `Proposed` is binding as the implementation decision, but is not
**Accepted** until a repository owner records approval. Only an owner may change status; an agent
may not. **Why:** acceptance is a governance act, not a technical one, and it gates future changes
rather than the current one. **Enforcement:** Review — a status change to `Accepted` requires the
approval record cited in the ADR's header. ADR-0001 through ADR-0004 are `Accepted`, approved by
the repository owner on 2026-10-06.

---

## 2. Repository Structure

### 2.1 Top-level layout

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
├── infra/                       # Terraform only.
│   └── terraform/
│       ├── modules/             # Capability-scoped (§2.5)
│       ├── environments/        # floci / staging / production
│       └── shared/              # Provider versions, tags, naming helpers
├── deploy/                      # Deployment configuration, not infrastructure.
│   ├── pipelines/               # Job definitions beyond .github/workflows
│   └── manifests/               # Release manifest schema, task-shape descriptors
├── tests/                       # Cross-cutting suites and fixtures.
│   ├── contract/                # Producer/consumer contract tests
│   ├── system/                  # Multi-service, multi-database
│   ├── e2e/                     # Playwright specs
│   ├── smoke/                   # 3 post-deploy assertions (I §14.1)
│   ├── chaos/                   # Redis down, flush, consumer crash, failover
│   └── fixtures/                # Seed data, JWKS keys, golden-master payloads
├── observability/               # Dashboards, alert definitions, runbooks.
│   ├── dashboards/
│   ├── alerts/
│   └── runbooks/
├── docs/
│   ├── adr/                     # Architecture Decision Records (§14)
│   ├── api/                     # API reference
│   ├── operational/             # Operational guides and runbooks
│   └── migration/               # Phase-by-phase extraction notes (R §7)
├── scripts/                     # Repository maintenance only.
├── .github/
│   ├── workflows/               # CI/CD. CODEOWNERS-protected.
│   ├── CODEOWNERS
│   └── pull_request_template.md
├── Makefile                     # Every workflow is a target (§2.6)
├── ARCHITECTURE_REVIEW.md
├── INFRASTRUCTURE_ARCHITECTURE.md
├── REPOSITORY_ENGINEERING_STANDARD.md
└── README.md
```

### 2.2 Ownership by directory

| Directory | Owns | Must not contain |
|---|---|---|
| `services/<name>/` | Application code, migrations, Dockerfile, service-local tests | Infrastructure definitions, CI config, cross-service code |
| `contracts/` | Interface definitions consumed by more than one party | Implementation code, checked-in generated clients, business logic |
| `infra/` | Terraform `.tf`/`.tfvars`/provider config | Application code, migration execution, secret **values**, any resource not created by `apply` |
| `deploy/` | Pipeline config, release-manifest schema, task-shape descriptors, promotion config | Terraform, application code, a second copy of an architecture decision |
| `tests/` | Cross-cutting suites and fixtures spanning services | Single-service unit tests (those live with the service), mocks of the system under test |
| `observability/` | Dashboard definitions, alert rule definitions, runbooks | Application instrumentation, log statements, a duplicate of an alert already defined in I §11.6 |
| `docs/` | ADRs (`docs/adr/`), API reference (`docs/api/`), operational guides (`docs/operational/`), migration notes (`docs/migration/`) | Architecture decisions (R/I), secrets, credentials, runbooks (those live in `observability/`, beside the alert they answer) |
| `scripts/` | Repository maintenance: codegen wrappers, seed helpers, lint wrappers | Business logic, deployment logic, anything the Makefile should do instead |
| `.github/` | Workflows, CODEOWNERS, PR/issue templates | Secret **values**, long-lived cloud credentials (use OIDC, I §9.6) |

**MANDATORY:** `infra/terraform/` is the only place Terraform lives. **Why:** a second Terraform
root invites state confusion, and I §3.5 makes state isolation mandatory.
**Enforcement:** CI + Review.

**MANDATORY:** no secret **value** in any tracked file, including `.tfvars`. Terraform variables
carry names and ARNs only (I §3.6). **Enforcement:** CI secret scan + push protection (I §12.8).

### 2.3 Service directory structure

Derived from R §9.4, which is authoritative for the Go layout.

**Go service — catalog, commerce, workers:**

```
services/commerce/
├── cmd/commerce/main.go        # Composition root. ~60 lines.
├── internal/
│   ├── config/                 # env → typed struct; fails fast
│   ├── httpapi/                # router, middleware, error rendering
│   ├── auth/                   # JWT verify, JWKS cache, role extraction
│   ├── checkout/               # R §3.4 transaction
│   ├── order/                  # R §3.7 state machine
│   ├── inventory/              # R §1.2 module: stock_level, stock_movement
│   ├── cart/  wishlist/
│   ├── outbox/                 # relay + publisher
│   ├── store/                  # SQL. One file per aggregate.
│   └── platform/               # slog, postgres, redis, health
├── migrations/*.sql            # Plain SQL. No migration framework (R §8.3)
├── Dockerfile
└── README.md
```

**Django service — identity:**

```
services/identity/
├── manage.py
├── config/                     # settings/{base,dev,prod}.py, urls.py, wsgi.py
├── apps/
│   ├── accounts/               # users, JWT issuance, JWKS, token blacklist
│   └── <future identity apps>
├── requirements/
│   ├── base.txt                # Pinned exactly (R §11.1)
│   └── dev.txt
├── Dockerfile
└── README.md
```

**MANDATORY:** Go code lives under `internal/`. Nothing outside the module can import it, so the
inventory package boundary from R §1.2 is enforced by the compiler rather than by convention.
**Enforcement:** Compiler.

**MANDATORY:** exactly four service directories, named `identity`, `catalog`, `commerce`, `workers`.
These names are fixed by R §1.1 and are also the permitted `Service` tag values (I §3.8).
**Enforcement:** Review + CI naming check.

**MANDATORY:** `services/identity/` contains **only** identity concerns. Cart, orders, wishlist,
products, and notifications leave as their services are extracted — R §4.2 assigns every table an
owner. **Enforcement:** Review.

**MANDATORY:** the four service directories each contain their own `Dockerfile`, their own
migrations, and their own `README.md`. **Why:** I §12.2 builds one image per service, and R §8.3
makes migrations code reviewed per service. **Enforcement:** CI.

### 2.4 `contracts/`

**MANDATORY:** every event type published by Commerce, Catalog, or Identity has a JSON Schema file
in `contracts/events/` **before** any consumer depends on it. **Why:** R §3.6 defines payloads;
I §12.1 requires contract tests. A payload defined only in producer code has no enforceable
contract.
**Enforcement:** CI — a contract test fails if a published event type has no schema file.

| Path | Holds | Hand-written? |
|---|---|---|
| `contracts/events/<Type>.v<N>.schema.json` | Envelope + payload schema per event version | Yes |
| `contracts/openapi/<service>.yaml` | Public HTTP surface per service | Yes |
| `contracts/sql/` | DDL constraints agreed across boundaries, and fixtures for the no-cross-service-FK check | Yes |

**MANDATORY:** a breaking change under `contracts/` is an API/contract change (§18 class 5) and
requires
an ADR. **Enforcement:** Review + CI path check on `contracts/**`.

**PROHIBITED:** generated Go or Python clients checked into source. **Why:** generated code churns,
obscures the actual contract, and creates a second place to fix a break. R §9.3 rejects code
generation (`sqlc`, `gorm-gen`) for the same reason. **Enforcement:** Review.

**PROHIBITED:** business rules in a contract file. A JSON Schema describes shape; a rule like "stock
must be sufficient" belongs in the owning service and is enforced by its transaction (R §3.4).
**Enforcement:** Review — a `contracts/` PR is checked for non-shape constraints.

### 2.5 `infra/`

I §3.1 owns the structure. This document adds only practice rules.

| Rule | Enforcement |
|---|---|
| Modules are **capability-scoped, not resource-scoped**. `database/` must not know `commerce` exists | Review |
| No `provider` block in a module. Providers declared only in root modules (I §3.2) | CI: `terraform validate` |
| No hardcoded environment names in a module. `production` must not be inferable from a module | CI + grep |
| A module consumes another module's declared outputs only | Review |
| Sensitive values are **inputs, never module constants** — a secret created inside a module is invisible to the environment's rotation policy | CI + Review |
| No module reads the data plane. Terraform creates the empty database; the pipeline applies the schema (I §3.4) | CI: no `local-exec` or `null_resource` provisioners |
| Environment root modules hold **no resource definitions of their own** (I §3.3) | Review |
| Provider versions pinned via `required_version` + constraints. A provider upgrade is a reviewed PR (I §3.9) | CI: `terraform validate` |
| `*.tfstate`, `*.tfstate.*`, `*.tfplan` never committed (I §3.5) | CI + `.gitignore` |
| State isolated per environment (I §3.5) | Review |
| `prevent_destroy` on stateful resources: database, state bucket, production VPC (I §12.6) | CI: `terraform plan` assert |

**MANDATORY:** every resource carries all seven tags from I §3.8. `CostCenter` is inherited from an
environment variable, never hardcoded. **Why:** I §3.8 — "a PR that adds a resource without the
required tags fails validation. This is the difference between tagging as documentation and tagging
as a control." **Enforcement:** CI.

### 2.6 `Makefile` is the interface

**MANDATORY:** any operation performed more than once must be reachable as a `make` target.
**Why:** I §18.1 — "Every step is idempotent and every step is a Make target. No manual steps, no
documented sequence a newcomer has to assemble from a wiki page." **Enforcement:** Review.

**MANDATORY:** `make lint`, `make fmt`, `make lint-terraform`, `make validate-terraform` mirror the
CI jobs exactly, so `make lint` is a genuine pre-flight for the merge gate (I §18.7).
**Enforcement:** Review + CI comparison of the Makefile target list against workflow job names.

**PROHIBITED:** documenting a manual sequence in a README that is not expressed as Make targets.
**Why:** I §18.9's reproducibility verification includes "No manual steps — follow the README on a
clean machine"; a README-only sequence fails that test. **Enforcement:** Review + the clean-clone
check in I §18.9.

### 2.7 `scripts/` and `deploy/`

**MANDATORY:** `scripts/` holds repository maintenance only: code-generation wrappers, seed helpers,
lint wrappers, changelog assembly. **Why:** §2.7 — anything substantive belongs in a service, a
migration, or Terraform, where it has tests and review. **Enforcement:** Review.

**PROHIBITED:** deployment logic in `scripts/`. Deployment belongs to the CI pipeline (I §12.3);
infrastructure belongs to Terraform (§2.5). **Enforcement:** Review.

**PROHIBITED:** business logic in `scripts/`. If it needs a database, it belongs in a service or a
migration. **Why:** untested script logic becomes an unowned production dependency. **Enforcement:**
Review.

**MANDATORY:** `deploy/` holds pipeline configuration, the release-manifest schema, task-shape
descriptors, and promotion config. **Why:** I §12.3 defines a 13-step deployment sequence and I
§6.11
defines a release manifest; both need a versioned home that is neither application code nor
Terraform. **Enforcement:** Review.

**PROHIBITED:** any file in `deploy/` that duplicates a decision recorded in R or I. A second copy
is a second source that will drift. **Enforcement:** Review.

### 2.8 Migration-time layout

**The current layout is transitional.** The repository today has `backend/` (Django monolith),
`e-commerce-app/` (React SPA), `nginx/`, and root-level `docker-compose*.yml`.

The **Phase** column is R's *migration* phase (R §7.2–7.7), not §20's repository phase.

| Current path | Target | R's phase | Authority |
|---|---|---|---|
| `backend/apps/accounts` | `services/identity/apps/accounts` | 0 (stays Django) | R §1.1, R §7.8 |
| `backend/apps/notifications` | `services/workers` (engagement) | 1 | R §7.3 |
| *No source app — reporting tables are new* | `services/workers` (reporting): `fact_order`, `fact_product_daily`, `dim_date`, `dim_product` | 2 | R §4.2, §7.4 |
| `backend/apps/products` | `services/catalog` | 3 | R §7.5 |
| `backend/apps/cart`, `orders`, `wishlist` | `services/commerce` | 4 (reads), 5 (writes) | R §7.6, R §7.7 |
| `e-commerce-app` | `frontend/` | 0 | I §12.2 — the SPA is built once and uploaded to object storage |
| `nginx/` | Replaced by edge config | — | I §10 |
| `docker-compose*.yml` | `make dev` fast path only | — | I §18.5 |
| `lint.sh` | `scripts/`, wrapped by a Make target | — | §2.6 |

**MANDATORY:** a structural move uses `git mv` and lands in one commit that changes nothing else.
**Enforcement:** Review.

**MANDATORY:** no commit mixes a structural move with a behavioural change. **Why:** a rename plus a
logic change makes `git bisect` and `git blame` useless, and I §15.3 and I §25 rely on that
debugging
capability during deploys and incidents. **Enforcement:** Review.

**MANDATORY:** a restructuring PR touches no logic and runs the full existing test suite green
before and after. **Enforcement:** CI.

---

## 3. Naming Conventions

### 3.1 Principles

| Principle | Rule | Why |
|---|---|---|
| Machine-generated names beat typed names | Prefer a name a generator or Terraform produces | A hand-typed cloud name is where the wrong region gets typed |
| Names are stable | Renaming a database object is a migration, not a refactor | It touches every consumer including historical data |
| No environment in code | `commerce` is a service; `production-commerce` is a deployment | Environment identity belongs in deployment config |
| One term per concept | "Correlation ID" means one thing everywhere | Two names for one concept is how a correlation search silently fails |

### 3.2 Directories and files

| Element | Convention | Example |
|---|---|---|
| Directory | lowercase; `kebab-case` for non-language dirs | `infra/terraform`, `docs/adr` |
| Python package | `snake_case` | `apps/accounts` |
| Go package | lowercase, single word | `internal/checkout` |
| camelCase in paths | PROHIBITED | — |
| Spaces in paths | PROHIBITED | — |
| Go source | `snake_case.go` | `order_state.go` |
| Go test | `snake_case_test.go`, beside the file | `order_state_test.go` |
| Python module | `snake_case.py` | `jwks.py` |
| Python test | `test_*.py` | `test_jwt_issuer.py` |
| SQL migration | `NNNNNN_<snake_case>.sql`, zero-padded, monotonic | `000042_add_correlation_id_to_orders.sql` |
| Django migration | Django's own name. Never renamed, never hand-edited | `0003_alter_customuser_options.py` |
| Terraform | `snake_case.tf`; env dirs use `main.tf`, `variables.tf`, `outputs.tf`, `providers.tf`, `versions.tf`, `terraform.tfvars.example` | `network.tf` |
| JSON Schema | `<Type>.v<N>.schema.json` | `OrderPlaced.v1.schema.json` |
| OpenAPI | `<service>.yaml` | `commerce.yaml` |
| ADR | `NNNN-<kebab-title>.md`, NNNN zero-padded, never reused | `0007-pgbouncer-prepared-statements.md` |
| Playwright spec | `<feature>.spec.ts` | `checkout.spec.ts` |
| Dashboard | `<subject>-<audience>.json` | `checkout-overview.json` |
| Runbook | `<failure-mode-slug>.md` | `redis-unavailable.md` |
| Makefile | `Makefile` | — |

**MANDATORY:** migration filenames are zero-padded to a fixed width so lexical order equals numeric
order. **Why:** without padding `0009_x.sql` sorts after `00010_x.sql`, and migration order is
correctness, not convenience. **Enforcement:** CI regex check.

**MANDATORY:** an ADR number is never reused, and a superseded ADR is never deleted — it is marked
Superseded with a link to its successor. **Enforcement:** Review.

### 3.3 Go packages and identifiers

R §9.4 fixes the package names. This section adds identifier rules.

| Element | Rule | Example |
|---|---|---|
| Package name | lowercase, single word, no underscore, no plural | `checkout`, `inventory` |
| Package name `util`, `common`, `helpers`, `base`, `models` | PROHIBITED | — |
| Exported identifier | `CamelCase` | `PlaceOrder`, `StockLevel` |
| Unexported identifier | `camelCase` | `reserveStock` |
| Initialism | Uniform capitalisation: `ID`, `URL`, `HTTP`, `SQL`, `JWT`, `SKU`, `JWKS` — never `Id`, `Url` | `orderID`, `jwksCacheAge` |
| Receiver | 1–2 letters, consistent per type | `s *Store` |
| Interface | Noun, small, defined by the consumer | `type OrderStore interface` |
| Sentinel error | `Err` prefix | `ErrOrderNotFound` |
| Error wrapping | `fmt.Errorf("...: %w", err)` | — |
| Shared test helper | `test…` prefix; constructor `newTestStore` | — |
| Table-test cases | variable named `tests` or `cases` | — |

**MANDATORY:** initialism capitalisation is uniform repository-wide. `userID` and `userId` in
different files is a defect, not a style preference. **Enforcement:** CI linter (`staticcheck`,
`revive`).

**RECOMMENDED:** keep interfaces narrow, one to three methods. An interface with ten methods is a
mock
in disguise; R §9.3 rejects DI frameworks on the grounds that constructors and explicit parameters
are sufficient. **Enforcement:** Review.

### 3.4 Python and Django identifiers

| Element | Rule | Example |
|---|---|---|
| Module | `snake_case.py` | `jwks.py` |
| Class | `CapWords` | `CustomUser` |
| Function/method | `snake_case`; leading underscore for internal | `_sign_access_token` |
| Constant | `UPPER_SNAKE_CASE` | `ACCESS_TOKEN_TTL` |
| Django app label | lowercase, singular, no underscore | `accounts` |
| Model | `CapWords`, singular | `CustomUser` |
| Model field | `snake_case` | `preferred_size` |
| Migration | Django-generated; never hand-edited, never renamed | — |
| Django setting | `UPPER_SNAKE_CASE` | `SIMPLE_JWT` |
| Serializer | `CapWords` + `Serializer` | `OrderSerializer` |
| View | `CapWords` + `View`/`APIView` | `OrderListView` |
| URL name | `snake_case`, namespaced by app | `orders:detail` |
| Test | `class Test…(TestCase)` or `test_*` | `TestPlaceOrderConcurrency` |

**PROHIBITED:** a model or serializer in `services/identity/` describing Commerce, Catalog, or
Engagement data. **Why:** a shared model is the mechanism by which a bounded context erodes, and R
§4.2 assigns each table to exactly one owner. **Enforcement:** Review.

**MANDATORY:** Django app labels are stable for the life of the database. **Why:** R §4.2 records
the
existing names — `accounts_customuser`, `cart_cart`, `orders_order` — and renaming an app renames
every table it owns. That is a large, destructive, pointless migration. **Enforcement:** ADR
required.

**MANDATORY:** `requirements/base.txt` and `dev.txt` pin **exact versions**. **Why:** R §11.1
records exact pinning as an existing control worth not regressing; I §23.7 requires it. The
Dockerfile installs `base.txt` only. **Enforcement:** CI — a range specifier fails.

### 3.5 API paths and endpoints

I §10.2 owns routing. This section adds naming rules.

| Rule | Value | Example |
|---|---|---|
| Version prefix | MANDATORY: `/api/v1` | `/api/v1/orders` |
| Resource | Plural, lowercase, no separators | `/api/v1/wishlist` |
| Multi-word path segment | `kebab-case` | `/api/v1/order-statuses` |
| Service in the path | PROHIBITED | No `/commerce/api/...` |
| Identifier | Opaque; never composite | `/api/v1/orders/1237` |
| Nesting | Only for genuine containment, max one level | `/api/v1/orders/1237/items` |
| Verbs in paths | PROHIBITED | No `/api/v1/orders/cancel` — use `PATCH` |
| Subdomain routing | PROHIBITED | I Appendix A D20: the SPA assumes a single origin |
| Query parameters | `snake_case` | `?page=1&limit=20&sort=created_at` |

**The four prefixes and their owning services are fixed by I §10.2 and must not change:**
`/api/v1/products*` → catalog; `/api/v1/cart/*`, `/api/v1/orders/*`, `/api/v1/wishlist/*` →
commerce; `/api/v1/auth/*` → identity.

**MANDATORY:** exact-path edge rules precede wildcard rules. **Why:** I §10.2 — `/api/v1/products`
matches both, and wildcard-first evaluation makes precedence implicit and fragile.
**Enforcement:** Review on any edge-config change.

### 3.6 Database objects

| Object | Rule | Example |
|---|---|---|
| Table | `snake_case`, singular for transactional tables | `stock_level`, `outbox` |
| Django-managed table | `<app_label>_<model_snake>`, preserved as-is | `accounts_customuser` |
| Reporting table | `fact_*` or `dim_*` — the existing convention | `fact_order`, `dim_product` |
| Column | `snake_case` | `available`, `correlation_id` |
| Cross-service reference | `<entity>_id`, and **no FK constraint** | `user_id bigint` |
| Timestamp | `_at` suffix | `created_at`, `published_at` |
| Boolean | No prefix; positive phrasing | `is_active`, not `not_cancelled` |
| Primary key | `id`, or a natural key named for what it identifies | `stock_level` PK `(product_id, size_value)`; `stock_released` PK `order_id` |
| Index | `idx_<table>_<columns>` | `idx_stock_level_product_id` |
| Unique constraint | `uq_<table>_<columns>` | `uq_order_item_order_product` |
| Check constraint | `ck_<table>_<rule>` | `ck_stock_level_available_nonneg` |
| In-database FK | `fk_<table>_<column>` | `fk_order_item_order_id` |
| Sequence | `<table>_<column>_seq` | `order_id_seq` |
| Per-service expected schema version | `schema_version`, reported by `/version` | I §11.4; the column name is a **new** decision (B26) |

**MANDATORY:** no surrogate `id` on a table whose natural key is composite — `stock_level`,
`stock_movement`, `processed_events`. **Why:** R §4.2 specifies composite primary keys, and a
surrogate key on a ledger table makes it ambiguous which value is canonical.
**Enforcement:** Review + a schema test.

**MANDATORY:** every cross-service reference is a plain integer column with **no foreign key
constraint**. **Why:** R §4.4 lists seven cross-boundary FKs that must become opaque integers; an FK
reintroduces the coupling the five-database model exists to prevent. **Enforcement:** CI — "a CI
check that no `commerce` migration contains a FK to a `catalog` or `identity` table. Cheap to write,
catches regressions permanently."

**MANDATORY:** within a single database, foreign keys **are** required for same-context references
such as `order_item.order_id` → `order.id`. **Why:** the prohibition is on cross-*boundary*
references, not on referential integrity. Dropping in-context FKs loses constraint enforcement for
no architectural gain. **Enforcement:** Review.

**MANDATORY:** existing table and column names are preserved through migration. **Why:** R §4.2 is
an
inventory of names that historical data lives under; a rename is a destructive migration with no
architectural benefit. **Enforcement:** ADR required to change one.

### 3.7 Events

R §3.6 defines the event set. §8 fixes the evolution rules.

| Rule | Value | Example |
|---|---|---|
| Event type name | `PascalCase` describing **something that happened** | `OrderPlaced` |
| Version suffix | `.v<N>`, mandatory, from `v1` | `OrderPlaced.v1` |
| Past tense | MANDATORY | `OrderPlaced`, not `PlaceOrder` |
| Aggregate | First segment names the aggregate | `Order*`, `Product*`, `Stock*`, `User*` |
| Stream | `sneakin:<env>:events` in Redis logical database `3`, one stream per environment | `sneakin:production:events` |
| Consumer group | One of four fixed groups (I §8.2): `commerce-cart-clear`, `workers-engagement`, `workers-reporting`, `catalog-availability` | `commerce-cart-clear` |

**The eleven registered event types** (R §3.6, R §4.5, ARCHITECTURE_ANALYSIS.md §7.1):
`OrderPlaced.v1`, `CheckoutCompleted.v1`, `OrderCancelled.v1`, `OrderStatusChanged.v1`,
`StockAdjusted.v1`, `LowStockDetected.v1`, `StockChanged.v1`, `UserRegistered.v1`,
`ProductUpdated.v1`, `ProductDeleted.v1`, `PriceChanged.v1`. §8.1 is the authoritative table.

**MANDATORY:** event type names are immutable once published. A payload correction is a new version
(§8.4), never an in-place edit. **Why:** I §15.6 makes additive-only evolution within a version a
condition of rolling deployment. **Enforcement:** CI — `contracts/events/` is append-only.

**PROHIBITED:** emitting an event for a step internal to one transaction. **Why:** R §3.6 — there is
no `InventoryReserved.v1` and no `InventoryReserveFailed.v1` because with co-location reservation is
not an observable event. "Emitting an event for a transaction-internal step is noise."
**Enforcement:** Review.

### 3.8 Terraform resources and modules

I §3.6 owns the cloud naming pattern. This section fixes the HCL-level names.

```
<env>-<region>-<service>-<resource>-<qualifier>

sneakin-prod-eu-west-1-commerce-sg-01
sneakin-floci-local-catalog-task-role
```

| Element | Rule | Example |
|---|---|---|
| Resource `name` | `"${local.name_prefix}-commerce-sg"` | — |
| Local variable | `snake_case`, descriptive | `catalog_desired_count` |
| Output | `snake_case`, noun phrase | `commerce_task_role_arn` |
| Module label | Capability name matching the directory | `module "database" {}` |
| `.tfvars` key | Matches the variable name | — |
| Random suffixes | PROHIBITED — use `name_prefix` or explicit indices | — |
| Environment aliases, dates in names | PROHIBITED | — |

**MANDATORY:** deterministic names. **Why:** I §3.6 — "deterministic names mean a diff shows a
rename, not a churn storm." **Enforcement:** Review.

**MANDATORY:** `Service` tag values are restricted to `identity`, `catalog`, `commerce`, `workers`,
`edge`. A value outside that list fails CI. **Why:** a typo'd `Service` tag silently breaks cost
attribution, which is what the tag exists for (I §3.8). **Enforcement:** CI.

### 3.9 Docker images

I §6.2 owns this and it is **resolved against** R §8.10's `sneakin/commerce:$SHA` form (§1.4 C-2).

```
<registry-host>/<env>/<service>:<commit-sha>

sneakin-floci.local:5000/dev/catalog:4f2a9c1
sneakin-floci.local:5000/prod/commerce:4f2a9c1
```

| Rule | Value |
|---|---|
| Repository | `<env>/<service>` |
| Canonical tag | Full 40-character commit SHA |
| Convenience tags | 7-character SHA; `git-describe` |
| `staging`, `production` tags | **Mutable pointers only. Never referenced by a task definition** |
| `latest` | **PROHIBITED** — "not a version" |
| Environment-only tag as sole tag | **PROHIBITED** — defeats digest pinning |

**MANDATORY:** task definitions reference the **digest**, never a tag. **Enforcement:** CI — a
mutable tag in production "makes staging verification meaningless" (I §12.1 job 20).

**MANDATORY:** one image per service, built once per commit, promoted by digest. Not per
environment. **Enforcement:** CI + the digest assertion in I §12.4.

### 3.10 Environment variables

**Genuinely new convention.** Neither R nor I specifies runtime environment variable naming. Derived
here to be consistent with the Terraform convention (I §3.6) and the secret-ARN model (I §3.7).

| Rule | Value | Example |
|---|---|---|
| Case | `UPPER_SNAKE_CASE` | `DB_HOST` |
| Grouping | `PREFIX_SUFFIX` by concern | `DB_`, `REDIS_`, `JWT_`, `LOG_` |
| Booleans | lowercase `true`/`false` | `OTEL_ENABLED=true` |
| Durations | Go duration string or integer seconds, documented per variable | `REQUEST_TIMEOUT=10s` |
| Sizes | Integer bytes or suffixed unit, documented per variable | `MAX_CONNECTIONS=25` |
| Service name as prefix | PROHIBITED — the container knows its own name | `COMMERCE_DB_HOST` |
| Environment name as prefix | PROHIBITED | `PROD_DB_HOST` |

**MANDATORY:** environment variables carry non-secret configuration and secret **references**
(ARNs/paths), never secret values. **Why:** I §3.7 — Terraform outputs the ARN of a secret and the
runtime retrieves the value. **Enforcement:** CI scanner flags assignments of secret-shaped
literals.

**MANDATORY:** every environment variable a service reads is documented in that service's
`README.md` with type, default, and required-or-not. **Why:** I §18.1 makes "no manual steps" an
acceptance criterion, and an undocumented variable is an undocumented step. **Enforcement:** Review.

**MANDATORY:** invalid configuration causes **immediate exit**. **Why:** R §9.5 — "invalid config =
exit immediately. Never start in a half-configured state." **Enforcement:** CI test — a service
started with a missing required variable exits non-zero.

**PROHIBITED:** a fallback default for a secret, ever. **Why:** R §11.2 S4 records `changeme`
defaults as a live finding; I §23.6 requires generation, never authoring. **Enforcement:** CI grep
+ scanner.

### 3.11 Metrics

The metric set is fixed by I §11.3. Naming rules:

| Rule | Value | Example |
|---|---|---|
| Namespace | `<subsystem>_<measurement>` | `http_request_duration_seconds` |
| Counter | `_total` suffix | `checkout_attempts_total` |
| Gauge | No suffix; describes a current value | `outbox_rows_total` |
| Histogram | `_seconds` for durations | `outbox_publish_lag_seconds` |
| Units | `_seconds`, `_bytes`, `_entries` | — |
| Labels | `snake_case`, low cardinality, bounded | `{result}`, `{outcome}` |
| High-cardinality labels | PROHIBITED: `user_id`, `order_id`, `correlation_id`, `product_id`, raw paths | — |
| Namespace prefixes | `http_`, `checkout_`, `outbox_`, `consumer_`, `db_`, `redis_`, `jwks_`, `deployment_` | — |

**The fifteen mandated metrics** (I §11.3): `http_requests_total`, `http_request_duration_seconds`,
`checkout_attempts_total{result}`, `checkout_duration_seconds`, `outbox_unpublished_total`,
`outbox_publish_lag_seconds`, `consumer_lag_entries`, `consumer_processed_total{outcome}`,
`dead_letters_total`, `db_pool_in_use`, `db_pool_wait_seconds`, `redis_up`,
`jwks_cache_age_seconds`, `deployment_revision`, `outbox_rows_total`.

**MANDATORY:** adding a metric outside this list requires an ADR. **Why:** each metric exists to
answer a question in I §11.5, and each of the nine alerts maps to a metric. A metric nobody queries
or alerts on is cost with no reader. **Enforcement:** Review.

**MANDATORY:** `checkout_attempts_total{result}` exists and is the primary business alert. R §10.4
and I §11.3 identify checkout failure rate as the metric that matters most. **Enforcement:** CI —
the metric must appear in checkout test output.

### 3.12 Logs

I §11.2 owns the log contract.

| Field | Rule | Why |
|---|---|---|
| Format | JSON, one object per line | I §11.2 |
| Always present | `timestamp`, `level`, `service`, `environment`, `correlation_id`, `trace_id` | I §11.2 |
| Business context | `user_id`, `role`, `order_id` where applicable | I §11.2 |
| Retention | 30 days hot, 90 days archive | I §11.2 |
| Collection | Container stdout → collector → log service. **Never a file written by the app** | I §11.2 |
| Secrets | **Never logged** | I §11.2, R §10.2 |
| Per-request `INFO` | **PROHIBITED** — "that is what metrics are for" | §3.11 |
| Level discipline | `ERROR` needs a human; `WARN` degraded but handled; `INFO` business events | §3.11 |

**MANDATORY:** `user_id` and `role` come from the **verified token**, never from a header or request
body. **Why:** R §11.3's threat model requires `role` from the verified signature, never from body,
query, or header. **Enforcement:** Review + a test asserting header-supplied identity is ignored.

**MANDATORY:** the app writes to stdout and nothing else. **Why:** I §11.2 — collection is
"container
stdout → collector → log service," and a log file written by the app is a file that ships with the
image and nobody rotates. **Enforcement:** Review — no `os.open`, `RotatingFileHandler`, or
`/var/log`
path outside stdout.

### 3.13 Dashboards and alerts

| Object | Rule |
|---|---|
| Dashboard | One per operational question, not one per service. Named `<subject>-<audience>.json` |
| Alert | One per I §17 failure mode. Nine exist (I §11.6) |
| Alert without a runbook | PROHIBITED — rejected in review |
| Alert thresholds | Defined in I §11.6 and **not** redefined here |
| New alert | Requires a runbook link under `observability/runbooks/` |

**MANDATORY:** every alert is verified to fire deliberately at least once (I §26.7).
**Enforcement:** Nightly verification job.

### 3.14 Git branches, commits, and PRs

**Branch model:** `main` plus pull requests. **PROHIBITED:** a `develop` or `release` branch.
**Why:** I Appendix A D25 — "`develop` does not exist today. Two extra branches add ceremony without
adding safety." **Enforcement:** branch protection + Review.

| Rule | Value | Why |
|---|---|---|
| Long-lived branches | `main` only | D25 |
| Feature branches | `<type>/<short-description>` | — |
| Branch from | `main` | — |
| Merge | Squash. Linear history | I §15.3 and I §25 rely on `git bisect` during deploys and incidents |
| Force-push to `main` | PROHIBITED | Branch protection |
| Direct push to `main` | PROHIBITED | Required status checks (§19) |

**Commit messages — genuinely new convention.** Neither R nor I specifies commit format.

```
<type>(<scope>): <subject>

<body>

<footer>
```

| Part | Rule |
|---|---|
| `type` | `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`, `perf`, `chore`, `revert` |
| `scope` | Service or subsystem: `commerce`, `catalog`, `identity`, `workers`, `infra`, `ci`, `docs` |
| `subject` | Imperative mood, ≤ 72 characters, no trailing period |
| `body` | Why, not what. Wrap at 100 characters |
| `footer` | `BREAKING CHANGE:` for a §18.1 change. `Refs: #<n>` for the issue |

**MANDATORY:** one commit is one logical change. A commit touching four services for one reason
either names four scopes or splits. **Why:** I §6.11 makes the release manifest per-commit, and
mixed commits make "which digest introduced this" unanswerable. **Enforcement:** Review.

**RECOMMENDED:** cite the governing section in the body when behaviour is constrained by one —
`Per ARCHITECTURE_REVIEW.md §3.4`. **Enforcement:** Review — §15.2 requires the citation, this
records it in the commit.

**PR titles** use the same format, so the squash commit message is the PR title by construction.

### 3.15 Cloud resources

Cloud resource names follow §3.8 (I §3.6 owns the pattern) and `Service` tags are restricted to
`identity`, `catalog`, `commerce`, `workers`, `edge` (§3.8).

---

## 4. Go Engineering Standard

R §9 is authoritative for Go technology choices. This section restates them as rules and adds
engineering practice.

### 4.1 Principle

> **Standard library by default. A dependency is a cost paid forever and must be justified
> individually.** (R §9.1)

### 4.2 Dependency policy

**The permitted dependency set is exactly three.** R §9.2: "Three. Not twelve."

| Dependency | Purpose |
|---|---|
| `github.com/jackc/pgx/v5` | PostgreSQL driver |
| `github.com/golang-jwt/jwt/v5` | JWT verification |
| `github.com/redis/go-redis/v9` | Redis Streams client |

**MANDATORY:** no fourth dependency enters `go.mod` without an ADR. **Why:** R §9.3 lists each
rejection with its reason, and I §22 records every technology rejection with a named trigger.
**Enforcement:** CI — a dependency-count check plus a review-required marker on `go.mod` diffs.

**PROHIBITED (R §9.3):** GORM or any ORM; Gin, Echo, Fiber; zap, zerolog; viper, godotenv;
go-playground/validator; the OpenTelemetry SDK; sqlc, gorm-gen, squirrel; grpc-go and protobuf;
testify; Wire or any DI framework.

**Standard library substitutes (R §9.2):** `net/http` and `http.ServeMux`; `encoding/json`;
`log/slog`; `crypto/tls`; `context`, `os/signal`; `os` for configuration; goroutines, channels,
`sync`; `testing`, `net/http/httptest`; `time`, `crypto/rand`; `errors`, `fmt.Errorf("%w")`.

**MANDATORY:** no ORM, because the system needs to see its SQL. **Why:** R §9.3 — `SELECT … FOR
UPDATE`, `ON CONFLICT DO NOTHING`, and conditional `UPDATE`s are the correctness-critical parts of
checkout (R §3.4), and an ORM makes them awkward or generates them invisibly. **Enforcement:**
CI import ban + Review.

**PROHIBITED:** `go mod tidy` as an unreviewed side effect. Dependency changes appear in their own
commit with the ADR reference. **Why:** R §9.1 treats a dependency as a permanent cost.
**Enforcement:** Review.

### 4.3 Package boundaries and dependency direction

**MANDATORY:** all code under `internal/`. The compiler enforces that nothing outside the module can
import it, which is how the R §1.2 inventory boundary is held. **Enforcement:** Compiler.

**MANDATORY:** dependency direction is strictly inward. Nothing may import upward or sideways.
**Why:** §4.3 — an inward-only graph is what makes a domain package testable without a transport.
**Enforcement:** Compiler — `go build` fails on a cycle; Review for the direction itself.

```
        cmd/commerce          composition root. Wires everything.
              │
    ┌─────────┼─────────┬─────────┐
    ▼         ▼         ▼         ▼
 httpapi    auth      config    platform     outer: transport, config, I/O
    │                             ▲
    ▼                             │
 checkout  order  cart  wishlist  inventory  outbox    domain
    │                                          │
    └────────────────┬─────────────────────────┘
                     ▼
                   store                        innermost: SQL only
```

| Package | Rule |
|---|---|
| `store` | Imports no domain package. SQL and row mapping only |
| Domain packages | Import `store` and stdlib. **Never `httpapi`** |
| `httpapi` | Owns transport concerns: routing, middleware, status codes, error rendering. Contains no business rule |
| `auth` | JWT verification, JWKS cache, role extraction. The **only** package that trusts identity. It never imports `httpapi` |
| `checkout` | Owns the R §3.4 transaction. Nothing else may call `BeginTx` for a checkout |
| `inventory` | Owns `stock_level`, `stock_movement`, `stock_released`. No other package writes them |
| `outbox` | Owns the relay and the publisher. The only package that calls `XADD` |
| `platform` | `slog` setup, database pool, Redis client, health endpoints |
| `config` | Env parsing. Fails fast. Imports nothing from the service |

**MANDATORY:** `inventory` is a package boundary, not a naming convention — R §1.2 makes it the
module boundary, and I Appendix A.1 places the outbox relay in Commerce. No other package touches
those tables. **Enforcement:** Review — plus I §12.1 job 22 as a partial automated check.

**MANDATORY:** no import cycle, and no `init()` that does work. Initialisation is explicit in
`main`. **Why:** R §9.3 rejects DI frameworks because "constructors and explicit parameters" are
sufficient; hidden initialisation is the same problem. **Enforcement:** `go vet` + Review.

### 4.4 Errors

| Rule | Value |
|---|---|
| Sentinel errors | `var ErrOrderNotFound = errors.New("order not found")` |
| Wrapping | `fmt.Errorf("reserve stock: %w", err)` — always `%w` |
| Checking | `errors.Is`, never `==` or string comparison on an error |
| Type assertions | `errors.As` for typed errors |
| One JSON error shape | Every response, every service. R §9.5 |
| Never | Include a raw internal error in a client-facing response |

**MANDATORY:** the client-facing error body is identical in shape across all four services.
**Why:** R §9.5 — "Consistency is what the frontend needs." **Enforcement:** Contract test in
`tests/contract/`.

**PROHIBITED:** leaking internal error text to a client. **Why:** R §11.2 and I §11.2 both treat raw
exception text as an information-disclosure surface; I §0 C4 replaces the current
`f"down: {str(e)}"` endpoint. **Enforcement:** Contract test + Review.

### 4.5 Context

**MANDATORY:** `r.Context()` is threaded through every call that can block. **Why:** R §9.5 —
cancellation propagates and goroutines do not leak. **Enforcement:** Review + a test asserting
cancellation reaches the store.

**PROHIBITED:** storing a `context.Context` in a struct field. **Why:** R §9.5 follows Go's own
guidance; a context in a struct outlives its request and defeats cancellation. **Enforcement:**
`lostcancel` vet check + Review.

**MANDATORY:** every context created with `context.WithTimeout` or `context.WithCancel` is
cancelled. **Enforcement:** `lostcancel`, `govet`.

### 4.6 HTTP handlers

| Rule | Value | Why |
|---|---|---|
| Router | `http.ServeMux` with Go 1.22 method-and-path patterns | R §9.3 — method patterns are stdlib; a framework leaks its context type into every signature |
| Middleware | `func(http.Handler) http.Handler` | Composable and testable in isolation |
| Handler body | Transport concerns only | §4.3 |
| SQL | Never in a handler. Delegate to a domain package | §4.3 |
| Timeouts | `http.Server` read/write/header timeouts set. Never `http.ListenAndServe` bare | R §11.1 S-naming — `nginx.conf` today has 60s timeouts; the service sets its own |
| Request timeout | 10s ceiling on edge → commerce checkout. A safety ceiling, not a target | R §3.10, R §9.5 |
| Retries | **PROHIBITED in a handler.** Only in the outbox relay | R §9.5 |
| Request body | Bounded before parsing | I §10.6 |
| Body size limit | Enforced at the edge and in the service | — |

**MANDATORY:** retries never occur inside a request handler. **Why:** R §9.5 — "a retry inside a
handler holds a connection and blows the 10s timeout budget." **Enforcement:** Review + a grep for
retry loops in `httpapi/`.

### 4.7 Configuration

**MANDATORY:** environment variables parsed in `main`, into a typed struct, failing fast on invalid
config. **Why:** R §9.5 — "Never start in a half-configured state." **Enforcement:** CI test — a
service with a missing required variable exits non-zero.

**MANDATORY:** naming per §3.10. **PROHIBITED:** viper, godotenv, or any config library.
**Why:** R §9.3 — "A config library to read `os.Getenv` is a poor trade." **Enforcement:** CI import
ban.

**MANDATORY:** no configuration branch changes behaviour between environments beyond values.
Environment-specific behaviour is a value, not a code path. **Why:** I §20.2 requires the
configuration model to be exact across environments; a per-environment code path is a divergence.
**Enforcement:** Review + a CI diff check for environment-name string literals outside config.

### 4.8 Logging

**MANDATORY:** `log/slog` with a JSON handler to **stdout**. Never a file. **Why:** R §9.5 —
Docker's
`json-file` driver rotates. **Enforcement:** CI — no file-writing logging call in service code.

**MANDATORY:** every line carries `correlation_id`, `trace_id`, `service`, `environment` (§3.12).
**Enforcement:** CI — a log-assertion helper used in tests fails a line missing them.

**MANDATORY:** logging happens in the domain package that knows the fact, not only at the handler.
A failed reservation must be logged where the reservation failed. **Enforcement:** Review.

**PROHIBITED:** zap, zerolog (§4.2). `log/slog` is "structured, leveled, and handler-based. Exactly
sufficient" (R §9.3). **Enforcement:** CI import ban.

### 4.9 Graceful shutdown

**MANDATORY:** `signal.NotifyContext` plus `srv.Shutdown(ctx)`. **Why:** R §9.5, and R §8.9 requires
in-flight requests to finish. **Enforcement:** CI — a test starts a slow request, sends `SIGTERM`,
and asserts the response completes.

**The timing contract is fixed by I §5.8 and is not a service-level choice:**

| Phase | Duration | Why |
|---|---|---|
| Deregister from the load balancer | 10s | Must exceed the target health-check interval, so the LB stops sending **before** the process stops accepting |
| Finish in-flight requests | 20s | R §8.9's 30s drain, bounded |
| Drain consumers, flush the outbox | 10s | — |
| Total stop grace period | **40s** | I §5.8 — exceeds R §8.9's 30s; the orchestrator may `SIGKILL` after this |

**MANDATORY:** the ordering is deregister **then** drain. **Why:** I §5.8 — "if the process stops
accepting connections *before* the load balancer stops sending, in-flight requests get
connection-refused instead of completing." **Enforcement:** CI shutdown test asserting the ordering.

**MANDATORY:** the shutdown sequence is: stop accepting, deregister, drain HTTP, drain consumers,
flush the outbox, close pools, exit. **Why:** for `commerce` a `SIGTERM` mid-checkout leaves the
transaction to PostgreSQL's in-doubt mechanism (I §5.8). **Enforcement:** CI shutdown test.

**MANDATORY:** the task's stop grace period is 40s, exceeding R §8.9's 30s drain (I §5.8).
**Enforcement:** CI — a task-definition check on the grace period value.

### 4.10 Connection management

| Rule | Value | Why |
|---|---|---|
| Pool | `database/sql` + pgx stdlib, one pool per service, connecting to PgBouncer on 6432 | R §9.5 — "Do not hand-roll a pool"; ADR-0003 |
| Driver | `github.com/jackc/pgx/v5/stdlib` behind `database/sql`. **`pgxpool` is prohibited** | ADR-0003, R §9.5 |
| Prepared statements | **Disabled**: `default_query_exec_mode=exec` in every DSN. `QueryExecModeDescribeExec`, SQL `PREPARE`/`EXECUTE`/`DEALLOCATE`, and `db.Prepare` are **prohibited** | I §7.5, ADR-0003 |
| Session state | No assumption of session state surviving a transaction | I §7.5, ADR-0003 |
| Parameters | Named or positional. **Never string concatenation** | R §9.5, and R §11.3 — the `where`/`order_by` patterns in `admin_views.py` are the named risk |
| Sort fields | Allowlist, never interpolated | R §11.3 |
| Transactions | Explicit `BeginTx` / `Commit` / `Rollback`, with `defer` of the rollback | R §9.5 — "The transaction boundary is the most important line of code in the service and it should be visible" |
| `statement_timeout` | Set **per role**, so one service's runaway query cannot starve the instance | I §7.6 |
| `lock_timeout` | **5s** and `statement_timeout` **60s** in the migration session | I §16.6 — a migration that must wait "fails fast rather than queueing behind a long transaction" |
| Redis | One client. Per-consumer credentials (R §2.5) | §8.6 |
| Closing | Pools closed after drain, before exit | §4.9 |

**MANDATORY:** SQL is readable in a PR without interpretation. **Why:** R §9.5 — "The correctness
depends on exact SQL. It must be readable in a PR." **Enforcement:** Review.

**PROHIBITED:** an ORM-managed session, or any library that hides the transaction boundary.
**Why:** §4.10 — R §9.5 requires the boundary to be visible in the source. **Enforcement:** CI
import
ban + Review.

### 4.11 Concurrency

**MANDATORY:** one goroutine per request. **Why:** `database/sql` pools connections (R §9.5).
**Enforcement:** Review.

**PROHIBITED:** hand-rolled connection pooling. **Why:** R §9.5. **Enforcement:** Review.

**RECOMMENDED:** `sync.RWMutex` only if a real shared cache is built. **Why:** R §9.5 — there is no
shared Redis cache (R §4.5 rejects it). **Enforcement:** Review.

**MANDATORY:** every goroutine either is awaited or is registered for shutdown tracking. A leaked
goroutine outlives the request that started it. **Enforcement:** CI — `go test -race` plus a
goroutine-leak assertion in the shutdown test.

**MANDATORY:** `-race` runs in CI on every Go package. **Why:** I §12.1 names race-enabled Go tests
as a long pole of the PR gate. **Enforcement:** CI.

### 4.12 Static analysis

**MANDATORY:** the following run on every PR and block the merge (I §12.1). **Why:** §0.4 — an
unenforced rule is an opinion, and these are the cheapest to automate. **Enforcement:** CI.

| Tool | Checks |
|---|---|
| `gofmt -l` | Formatting; empty output required |
| `go vet ./...` | Standard correctness |
| `golangci-lint` | The gate. Runs `staticcheck` (bug patterns, unused code, simplifications) and `revive` (style, initialisms per §3.3, exported comments) |
| `govulncheck` | Known vulnerabilities in reachable code (I §23) |

**MANDATORY:** the `golangci-lint` configuration is committed, not per-developer. **Enforcement:**
CI + Review on config changes.

**MANDATORY:** lint findings are fixed or explicitly suppressed with a comment naming the reason.
**PROHIBITED:** a blanket `//nolint` without a reason. **Enforcement:** Review.

### 4.13 Testing

**MANDATORY:** `testing` and `net/http/httptest`. **PROHIBITED:** testify (R §9.3). **Why:** R §9.3
—
`testing` is the stdlib and the assertion surface needed is small. **Enforcement:** CI import ban.

**MANDATORY:** integration tests use **real PostgreSQL**, not mocks. **Why:** R §12.3 — "Mocking
`SELECT … FOR UPDATE` or an `ON CONFLICT` clause tests your mock, not your code." **Enforcement:**
CI.

**MANDATORY:** only JWT verification (fixture keys) and time (injected clock) are mocked. **Why:**
R §12.3. **Enforcement:** Review.

**MANDATORY:** table-driven tests for state machines and validation. **Why:** R §12.8 requires 100%
transition coverage on the order state machine, "it is a table; testing all of it is cheap."
**Enforcement:** Review.

**MANDATORY:** coverage targets are per-area, from R §12.8, not repository-wide. **Why:** R §12.8
rejects a flat number. **Enforcement:** CI reports per area; §9.8 states what is not gated:

| Area | Target |
|---|---|
| `checkout` package | 95%+, branch coverage |
| `inventory` package | 90%+ |
| `order` state machine | 100% of transitions, positive and negative |
| Go HTTP handlers | 70%+ |

**PROHIBITED:** a flat repository-wide coverage gate. **Why:** R §12.8 — "Chasing it produces
low-value tests of error-wrapping and struct literals." **Enforcement:** CI.

**MANDATORY:** `make test-race` exists and runs with `-race` (I §18.7). **Enforcement:** CI.

### 4.14 Build

| Rule | Value | Why |
|---|---|---|
| Build flags | `CGO_ENABLED=0 go build -trimpath -ldflags="-s -w"` | R §9.6 — static binary, reproducible, ~30% smaller |
| Runtime base | `gcr.io/distroless/static-debian12` | R §9.6 — "no CVEs from an OS userspace" |
| User | `USER nonroot:nonroot` | R §9.6 |
| Pinned base images | By digest, not tag | I §23.7 |
| Multi-stage | Build stage never shipped | I §9.6 |
| Migrations in the image | Copied alongside the binary; executed by a one-off task using **the same image** | I §16.2 — "the task is guaranteed compatible with the schema it expects" |
| Health check | The binary itself (`commerce -healthcheck`) or from outside | R §9.6 — distroless has no shell, "not an oversight" |

**PROHIBITED:** a shell in a production Go image. `make shell` is therefore unavailable for Go
services, and that is documented behaviour, not a gap (I §18.5). **Enforcement:** CI — image scan
plus a Dockerfile check for a shell-bearing production image.

---

## 5. Python and Django Engineering Standard (Identity)

### 5.1 Scope and the leakage problem

Identity remains Django. R §1.1 and R §7 fix this; it is not revisited here.

**The rule this section exists to enforce:** Django's idioms must not leak into the Go services, and
Go's idioms must not leak into Identity. Three leaks are the risk:

| Leak | Symptom | Rule |
|---|---|---|
| A Go service importing Django models or the Django ORM | Impossible by construction — the runtimes cannot import each other | §5.4 |
| A Go service replicating Django's URL or serializer conventions | Two different-looking APIs for one system | §6 |
| **Identity retaining models for other services' domains** | The actual historical failure: `backend/apps/` holds cart, orders, wishlist, products, notifications | §5.3 |

**MANDATORY:** Identity models users, JWT issuance, JWKS, and the token blacklist. Nothing else.
**Why:** R §4.2 assigns every table to exactly one owner — cart/orders/wishlist belong to Commerce,
products to Catalog, notifications to Engagement. **Enforcement:** Review, plus I §12.1 job 22's
cross-service FK check as a partial guard.

### 5.2 Django practice

| Rule | Value | Why |
|---|---|---|
| ORM | Django ORM for Identity's own tables | R §1.1 |
| Raw SQL | Only for reporting queries and performance-critical paths, with a written reason | — |
| Migrations | Generated by Django; never hand-edited, never renamed | §3.2 |
| Settings | Split `base`/`dev`/`prod`. No environment branching inside a setting function | §4.7 |
| `DEBUG` | `False` in production | R §11.1 |
| `SECRET_KEY` | No default. Fails fast when unset | R §11.1 — already correct; do not regress |
| `ALLOWED_HOSTS`, `CORS_ORIGINS` | Env-driven, never `*`; empty strings filtered | R §11.1 S6 |
| Passwords | Django 5.1 default, migrating to **Argon2id** when convenient | R §6.2 |
| Static files | Served from object storage, not from the task | I §10.3, C3 |
| WSGI server | Gunicorn | R §11.1 |
| `requirements/base.txt` | Exact pins. The Dockerfile installs `base.txt` only | R §11.1 |

**MANDATORY:** `makemigrations --check --dry-run` runs in CI. **Why:** R §7 and
`ARCHITECTURE_ANALYSIS.md` DB-8 treat unmanaged migrations as a Phase 0 gap; a model change without
a migration is invisible until deploy. **Enforcement:** CI.

**MANDATORY:** a `select_for_update` support test against real PostgreSQL exists before
`select_for_update` is used in production code. **Why:** R §3.4 and R §12.4 C1 both depend on row
locking; its absence from the monolith is the live oversell bug. **Enforcement:** CI.

### 5.3 Authentication and authorization

R §6.2 and R §6.3 are authoritative. Implementation rules:

| Rule | Value | Why |
|---|---|---|
| Signing algorithm | **Ed25519 (EdDSA)**; RS256 only if tooling rejects EdDSA | R §6.2 — HS256 "is not fixable by configuration — it requires a key-type change" |
| Private key | In Identity only; never leaves it | R §6.2 |
| Public key | Served as JWKS at `GET /.well-known/jwks.json` | R §6.2 |
| JWKS cache | 1 hour, refreshed on unknown `kid` | R §6.2 |
| Key rotation | 90 days. Publish old + new during overlap; retain the retired **public** key 24h (> the 30-min access TTL) | R §6.2 |
| Access token claims | `iss`, `aud`, `sub`, `role`, `email`, `name`, `iat`, `exp`, `jti`, `typ`, `kid` | R §6.2 |
| `typ` claim | Verified explicitly; an access token must not work as a refresh token | R §6.2 — "Go verifiers must not ignore it" |
| Access token TTL | 30 minutes | R §6.1 |
| Refresh token | Opaque 256-bit random value, SHA-256 hashed at rest, rotated on use; reuse revokes the family | R §6.2 |
| SPA storage | Access token in memory; refresh in `httpOnly; Secure; SameSite=Strict` | R §6.2, S5 |
| `role` | From the verified signature. **Never from body, query, or header** | R §11.3 |
| `is_staff` / `role` | Unified into one `role` concept | R §6.1 Problem 3 |

**MANDATORY:** every DRF view declares `permission_classes` explicitly. **Why:** R §11.2 S3 —
"`IsOwnerOrAdmin` exists, is correctly written, and is unused — which means the ownership checks the
analysis describes are not actually enforced at the framework layer." **This is a live finding.**
**Enforcement:** CI — a test asserting every registered view has a non-default permission class.

**MANDATORY:** ownership is a **query filter**, never fetch-then-compare. **Why:** R §11.3 calls
BOLA
"the most likely real-world breach in this system." **Enforcement:** Review + the cross-user E2E
test
returning 404 (R §12.7).

**MANDATORY:** a cross-user access attempt returns **404, not 403**. **Why:** R §12.7 lists this as
high priority; 403 confirms the resource exists. **Enforcement:** E2E test.

**PROHIBITED:** mass assignment — never bind a request body directly to a model. **Why:** R §11.3 —
"Explicit DTOs with known fields." **Enforcement:** Review + serializer field allowlists.

**PROHIBITED:** user enumeration in error messages. **Why:** R §11.3. **Enforcement:** test
assertion.

### 5.4 Boundary with Go services

| Rule | Value |
|---|---|
| No shared code between Python and Go | No shared module, no protobuf, no checked-in generated client. Enforced by language |
| Communication | HTTP at the edge, and events through the outbox. **Never one service importing the other's data** |
| JWKS | The only cross-language contract, and it is a public key document |
| Event schemas | `contracts/events/`, consumed by both runtimes |
| Identity's database | `identity` only. Commerce never reads it; `user_id` arrives in the JWT (R §4.5) |

**MANDATORY:** `UserRegistered.v1` is the only way another service learns a user exists. **Why:** R
§3.6 and R §4.5. **Enforcement:** I §12.1 job 22 + Review.

### 5.5 Migration-time Django rules

**MANDATORY:** during dual-run, Django keeps all writes for its domain and new services take reads
behind a feature flag. **Why:** R §7 phases 2 and 3 specify read-only cutover of
`GET /api/v1/products` and the dashboard stats endpoint. **Enforcement:** Review.

**MANDATORY:** golden-master response comparison runs continuously during dual-run. **Why:** R §12.6
—
it "converts 'the migration looks fine' into a measurable claim, and it is the actual exit criterion
for Phases 2, 3, and 4." **Enforcement:** CI + per-phase sign-off.

**MANDATORY:** Celery databases are separated from the events database **before** the transition
begins. **Why:** I §8.10 — `FLUSHALL` during Celery debugging must not destroy domain events.
**Enforcement:** Review + CI config check.

---

## 6. API Standard

### 6.1 HTTP semantics

| Rule | Standard |
|---|---|
| `GET` | Safe, idempotent, no side effects |
| `POST` | Create or a non-CRUD action. `201` + `Location` for a created resource |
| `PUT` | Full replace, idempotent |
| `PATCH` | Partial update, idempotent |
| `DELETE` | Idempotent. `204` or `200` with a body |
| Status codes | `200`, `201`, `202`, `204`, `400`, `401`, `403`, `404`, `409`, `422`, `429`, `500`, `503` |

**MANDATORY:** status codes mean what they say. **Why:** R §3.4 specifies `201` for a placed order;
R §12.4 C1 requires the losing checkout to get "a clean `409`", never a `500`. **Enforcement:**
Contract tests in `tests/contract/`.

| Code | Used for |
|---|---|
| `401` | Missing, malformed, or expired token |
| `403` | Authenticated, but the role forbids it |
| `404` | Does not exist, **or** exists and is not yours (R §12.7) |
| `409` | Conflict: oversell, illegal state transition, or idempotency-key replay conflict |
| `422` | Idempotency key reused with a different request body (R §3.8) |
| `429` | Rate limited (I §10.6) |
| `503` | A dependency the request needs is unavailable |

**MANDATORY:** an internal error never leaks its message. **Why:** I §0 C4 and I §11.2 — the current
`/api/health/` embeds `f"down: {str(e)}"` on an `AllowAny` route and can leak connection strings and
hostnames. **Enforcement:** Contract test asserting no internal detail in error bodies.

### 6.2 URLs

Naming per §3.5. The four prefixes and their services are fixed by I §10.2.

**MANDATORY:** a new endpoint requires a route in exactly one service's OpenAPI document in
`contracts/openapi/`, and a matching edge rule if it needs one. **Why:** I §10.2 makes the edge the
complete topology; an unrouted endpoint is unreachable. **Enforcement:** Review + CI path check.

**MANDATORY:** no endpoint calls another service. **Why:** R §5.2 — zero synchronous
service-to-service calls is the property the whole network design rests on (I §4.4).
**Enforcement:** Review + I §4.4 network policy, which makes the attempt impossible.

### 6.3 Request and response conventions

| Rule | Value |
|---|---|
| Content type | `application/json` |
| Field naming | `snake_case`, matching the database (§3.6) |
| Timestamps | RFC 3339, UTC |
| Money | Integer minor units or a decimal string. **Never a float** |
| IDs | Opaque integers, or UUIDs where the column is |
| Envelope | No wrapper on success; the resource is the body |
| Empty collections | `[]`, never `null` |
| Pagination | `?page=1&limit=20`; response carries `count`, `next`, `previous`, `results` |
| Sorting | `?sort=created_at`, **allowlisted fields only** (R §11.3) |
| Filtering | Query parameters, allowlisted |
| Unknown request fields | Rejected, not ignored |
| Response headers | `X-Request-ID` plus the security headers in I §10.7 |

**MANDATORY:** timestamps are UTC, RFC 3339. **Enforcement:** Contract test.

**MANDATORY:** money is never a float. **Why:** R §3.4 involves a total computed at checkout;
floating-point rounding on a monetary total is a revenue defect. **Enforcement:** Review + one
consistent type.

### 6.4 Errors

One shape, all services (R §9.5, §4.4).

```json
{
  "error": {
    "code": "insufficient_stock",
    "message": "Not enough stock for the requested size",
    "correlation_id": "0193f6c2-7a41-7c3d-b0e2-5f8a1d4c6e90"
  }
}
```

| Field | Rule | Why |
|---|---|---|
| `code` | Stable, `snake_case`, machine-readable. Never localised, never reworded | The SPA branches on this |
| `message` | Human-readable and safe to display. **No internal detail** | — |
| `correlation_id` | On every error, matching the log line | I §25.3 troubleshooting runbook |

**MANDATORY:** `code` values are a closed, versioned set defined in `contracts/`.
**Enforcement:** Contract test.

**PROHIBITED:** a stack trace, SQL fragment, host name, or connection string in any response.
**Enforcement:** Contract test + Review.

### 6.5 Authentication

**MANDATORY:** `Authorization: Bearer <access_token>`. **Why:** R §11.3 — JWT in the header means
CSRF
does not apply to API calls; cookies are only for refresh, `SameSite=Strict`, CORS allowlisted.
**Enforcement:** Review.

**MANDATORY:** the edge **strips** `X-User-Id`, `X-Forwarded-User`, and `X-Forwarded-Email` from
client requests. **Why:** R §11.4 — "If any service ever trusts a header for identity, a client can
forge it. The JWT signature is the only identity assertion in the system." **Enforcement:** CI edge
config check + a test asserting a forged header is ignored.

**MANDATORY:** no endpoint authenticates via query parameter, via a cookie other than the refresh
cookie, or via a custom header. **Enforcement:** Review.

### 6.6 Authorization

**MANDATORY:** authorization is enforced by the service that owns the resource, per R §6.3. **Why:**
§6.6 — only the owner has the data needed to decide. **Enforcement:** Review + the BOLA
query-filter test (§10.5):

| Resource | Customer | Admin |
|---|---|---|
| Product list/detail | Read | Read, write |
| Cart | Own only | Read any (support) |
| Wishlist | Own only | — |
| Order | Own, read | Read any, transition status, cancel |
| Notification | Own, mark read | Read all, broadcast |
| Dashboard metrics | — | Read |

**MANDATORY:** a role claim never grants access to another user's row. **Why:** R §6.3 — "ownership
is always checked against the service's own data." **Enforcement:** Review + the BOLA query-filter
test.

**MANDATORY:** the edge performs **no** authorization. It routes. **Why:** I §10.9 — central
authorisation would require the whole domain model of all four services and creates a single
authorisation failure point. **Enforcement:** Review — the edge config contains routes and nothing
else.

### 6.7 Idempotency

**MANDATORY:** `POST /api/v1/orders` requires an `Idempotency-Key` header carrying a
client-generated
UUID. **Why:** R §3.8 identifies this as "the only write on the checkout critical path," and notes
it
is a **frontend change** — the SPA generates one UUID per checkout intent and reuses it on retry.
**Enforcement:** contract test + integration test (§9.3).

**MANDATORY:** the key is stored in `idempotency_keys` with `request_hash`, `state`, and
`response_body`; a replay returns the stored response; reuse with a **different** body returns
`422`.
**Why:** R §3.4 T1–T7. **Enforcement:** contract test + integration test (R §12.4 C2).

**MANDATORY:** `idempotency_keys` is pruned after **7 days** and `processed_events` after **30
days**. **Why:** R §3.8 fixes both retentions, noting `idempotency_keys` "grows without bound
otherwise." **Enforcement:** the scheduled sweep (§2.6) + a CI assertion that every retention
`DELETE` names its own age threshold.

**MANDATORY:** every other state-changing endpoint states its idempotency behaviour explicitly in
its
contract, including "none required". Silence is not acceptable. **Enforcement:** Review.

### 6.8 Correlation IDs

| Rule | Value | Why |
|---|---|---|
| Header name | `X-Request-ID` | I §10.4, R §10.2 |
| Generated at | The **edge**, on every request | I §10.4 |
| Inbound | Honoured when well-formed; otherwise generated | R §10.2 |
| Propagated | To the service, into the `correlation_id` log field, into the outbox column, and into every event the transaction emits | R §3.4 T6 |
| Value format | UUIDv7, generated by the edge. Written to `order.correlation_id`, `outbox.correlation_id`, and every event's `correlation_id` | R §3.4 T6, §13.4 |
| Returned | In the response and in every error body | §6.4 |
| Spoofable headers | Stripped (§6.5) | R §11.4 |

**MANDATORY:** `correlation_id` is written to the order row, the outbox row, and every event emitted
by the checkout transaction. **Why:** R §3.4 T6, and R §13.4 — "correlation IDs are what make an
incident bounded." Without them, rollback "means 'assume the worst since the deploy.'"
**Enforcement:** integration test asserting a checkout's `correlation_id` reaches its outbox rows.

### 6.9 Health and operational endpoints

Fixed by I §11.4. **This replaces the monolith's `/api/health/`** (§1.4 C-3).

| Endpoint | Semantics | Wired to |
|---|---|---|
| `/healthz` | Liveness. **No dependencies whatsoever** | Container health check |
| `/readyz` | Readiness. PostgreSQL reachable + JWKS loaded. **Redis excluded** | Load balancer |
| `/diagnostics` | Dependency state, consumer lag, outbox depth. **Authenticated. No raw error text** | Humans |
| `/metrics` | Prometheus text format | Local development; optional collector |
| `/version` | Build SHA, image digest, schema version | Pipeline and smoke tests |

**MANDATORY:** `/readyz` excludes Redis. **Why:** I §0 C4 — a Redis outage must not pull every task
from rotation, and checkout does not depend on Redis (R §3.12 F8). Making it a dependency converts a
non-impacting outage into a total outage. **Enforcement:** CI — a test asserting `/readyz` returns
200 with Redis stopped.

**MANDATORY:** `/healthz` checks nothing external. **Enforcement:** the same test.

**MANDATORY:** `/diagnostics` is authenticated. **Why:** I §0 C4 — unauthenticated diagnostics are
an
information-disclosure surface. **Enforcement:** CI — unauthenticated access returns `401`.

**MANDATORY:** health endpoints are **never aggregated at the edge**. **Why:** I §10.2 — one
health-checking service would itself need to be healthy, and it becomes a single point of failure
for
the decision about everything. **Enforcement:** Review.

**MANDATORY:** `/version` reports the running digest and the expected schema version. **Why:** I
§11.4
and I §12.5 — the digest assertion is what distinguishes a real verification from a hopeful one.
**Enforcement:** CI — the deploy gate asserts `/version`.

### 6.10 Backwards compatibility

**MANDATORY:** an API change is additive unless it is a §18.1 breaking change. Allowed without a
version bump: a new endpoint; a new optional request field; a new response field; a new enum value
in
a tolerant position; a new optional query parameter.
**Why:** §6.10 — the SPA and backends release independently (I §12.2), so an additive change cannot
outrun a deployed consumer. **Enforcement:** contract test (§9.4).

**MANDATORY:** a version bump is required before removing or renaming a field, changing a field's
type, changing requiredness, changing a default, changing an error `code`, or changing status-code
semantics. **Why:** §18.1 defines these as breaking; a consumer coded against the old shape fails at
runtime, not at build. **Enforcement:** contract test against the previous version + ADR (§14.3).

**MANDATORY:** consumers must ignore unknown fields. **Why:** R §6.2's JWKS rotation and I §15.6's
"deploying producers before consumers" both depend on a consumer tolerating a superset.
**Enforcement:** Contract test with an extra field in the payload.

**MANDATORY:** a new response field is added before any consumer depends on it; the old field is
removed in a later release, never the same one. **Why:** I §16.4 expand/contract applied to APIs.
**Enforcement:** Review.

### 6.11 Documentation and deprecation

**MANDATORY:** every public endpoint has an OpenAPI definition in
`contracts/openapi/<service>.yaml`. **Enforcement:** CI — a route-registration test asserts every
registered route appears in the document.

**MANDATORY:** a deprecated endpoint carries `deprecated: true` and names its replacement for at
least
one release before removal. **Why:** the SPA deploys separately from the backends (I §12.2), so a
backend change can precede the frontend being ready. **Enforcement:** Review.

---

## 7. Database Standard

### 7.1 Ownership and access

| Rule | Value | Why |
|---|---|---|
| Databases | `identity`, `catalog`, `commerce`, `engagement`, `reporting` | R §4.2, R §8.6 |
| `outbox` | **Not a sixth database.** An `outbox` table owned by Commerce, in a schema Commerce alone can read | R §8.6 lists five; R §4.1 forbids an ownerless sixth |
| Ownership | **Every table has exactly one owning service. That service is the only writer** | R §4.1 |
| Cross-service reads | **PROHIBITED** | R §4.1 — "No service reads another service's tables. No cross-service foreign keys exist, ever" |
| Cross-service FKs | **PROHIBITED** | R §4.1, R §4.4, R §8.6's CI guard; I §12.1 job 22 |
| Same-database FKs | Allowed and expected for in-context references | R §3.4's tables are internally consistent |
| Schema ownership | Each service applies only its **own** migrations | I §16.2 |
| Credentials | One role per service per database. `commerce` has no grant on `catalog` | R §8.6 — enforcement "at the database level, not just by convention" |
| Schema search path | Per-role, so `commerce` never needs to know `catalog` exists | R §8.6 |
| Extensions | `pgcrypto` for `gen_random_uuid()`. **Nothing else** | R §8.6 |
| Pool sizing | Sized per role, below `max_connections` less reserved headroom | I §7.5 |

**MANDATORY:** one role per service, and the grant list is the isolation control. **Why:** R §8.6 —
per-role grants "[e]nforce §4.1 at the database level, not just by convention." **Enforcement:**
CI — assert each role's grants in `infra/`; I §4.4's security groups.

**MANDATORY:** the migration session sets `lock_timeout = 5s` and `statement_timeout = 60s`.
**Why:**
I §16.6 — a migration that must wait "fails fast rather than queueing behind a long transaction and
holding the queue behind it." **Enforcement:** CI lint asserting both are set.

**MANDATORY:** the schema search path is set per role in Terraform, not per connection string in
application code. **Why:** R §8.6. **Enforcement:** Review + CI — no `search_path` literal in Go or
Django settings.


### 7.2 Migrations

| Rule | Value | Why |
|---|---|---|
| Format | Plain `.sql`, in version order, with explicit `CREATE INDEX CONCURRENTLY` where applicable | R §8.3 — "Not a migration tool" |
| Tool | `psql` in a one-off task | I §16.2 |
| Image | The **same image digest** as the service | I §16.2 — "the task is guaranteed compatible with the schema it expects" |
| Atomicity | One migration per transaction, unless it contains `CREATE INDEX CONCURRENTLY` | — |
| Irreversibility | Additive only; never a destructive change in the same release as the code change that needs it | I §16.4 expand/contract |
| Locks | Every migration states the lock it takes and its expected duration | I §16.6 |
| Lock timeout | `lock_timeout` 5s, `statement_timeout` 60s — fail fast, never queue | I §16.6 |
| Rollback | A documented down path, or an explicit statement that the change is not reversible | — |

**MANDATORY:** every migration runs identically in dev, CI, and production. **Why:** I §16.3 — "the
same migration files must run identically in CI, dev, and prod, with no environment-specific
branches." **Enforcement:** CI + the dev and prod pipelines both execute the files.

**PROHIBITED:** migrations containing data backfills. **Why:** I §12.1 job 18 — schema migrations
only;
backfills are separate, resumable application changes. **Enforcement:** CI lint on
`migrations/*.sql`.

**PROHIBITED:** editing or renaming an applied migration. **Why:** environments at different
versions
would diverge permanently. **Enforcement:** Review + I §15.5, which detects applied-migration drift.

**MANDATORY:** the migration session sets `lock_timeout = 5s` and `statement_timeout = 60s`.
**Why:**
I §16.6 — a migration that must wait "fails fast rather than queueing behind a long transaction and
holding the queue behind it." **Enforcement:** CI lint asserting both are set.

### 7.3 Schema rules

| Rule | Value | Why |
|---|---|---|
| Naming | Per §3.6 — `snake_case` tables, `idx_`/`uq_`/`fk_`/`ck_` constraint prefixes | §3.6 |
| Primary key | Named `id`, **or** the natural key. **No surrogate `id`** where the natural key is composite | R §4.2's composite PKs; §3.6 |
| Surrogate key | `BIGSERIAL` where a surrogate is genuinely correct | §3.6 |
| Foreign keys | Within a database only, named `fk_<table>_<column>`, `ON DELETE` explicit | R §4.1, §3.4 |
| Timestamps | `created_at`, `updated_at`; `TIMESTAMPTZ` in UTC | R §4.1 fixes UTC |
| Money | `NUMERIC` with explicit precision. **Never** float, `real`, or `double precision` | §6.3 |
| Enums | Text columns with a `CHECK` constraint, not PostgreSQL `ENUM` types | `ENUM` needs `ALTER TYPE` to add a value, which cannot run in a transaction |
| Product deletion | **Soft delete** — `is_active = false` plus a deletion timestamp | R §7.2 step 0.5, R §14 R8, R Appendix A A30 |
| Migrations | Reversible, or forward-only with a stated reason | I §16.4 |
| Retention | Stated per PII table; see §10.8 | I §15.x, R §11.3 |

**MANDATORY:** `TIMESTAMPTZ`, never `TIMESTAMP`. **Why:** R §4.1 fixes UTC everywhere; a naive
timestamp makes that an application invariant rather than a database guarantee. **Enforcement:**
CI lint.

**MANDATORY:** product deletion is a **soft delete**, and a hard delete is **PROHIBITED**. **Why:**
R
Appendix A A30 — "Soft delete. Hard delete cannot destroy order history." R §7.2 step 0.5 makes soft
deletion part of the Phase 0 FK work, and R §14 R8 records that a stale availability projection
"misleads customers." **Enforcement:** CI — no `DELETE FROM products_product`; Review on any
hard-delete path.

**MANDATORY:** a foreign key names its `ON DELETE` behaviour explicitly. **Why:** an unspecified
cascade is a silent data-loss path, and R §3.4's idempotency table depends on deliberate retention.
**Enforcement:** CI lint.

**PROHIBITED:** text with no `CHECK` constraint standing in for an enum. **Why:** an unconstrained
status column accepts a value no code handles, and the failure surfaces in a consumer rather than at
the write. **Enforcement:** CI lint on `status`/`type` columns.


### 7.4 Indexing

**MANDATORY:** every foreign key has an index. **Why:** PostgreSQL does not create one
automatically, and an unindexed FK turns a parent-row update into a table scan. **Enforcement:**
CI lint.

**MANDATORY:** query patterns are indexed deliberately, and index names follow §3.6.
**Enforcement:**
CI lint + Review.

**MANDATORY:** production indexes are created with `CREATE INDEX CONCURRENTLY`. **Why:** I §16.6 —
"a
plain `CREATE INDEX` takes a write lock on the table." **Enforcement:** CI lint + I §16.6's rollback
note (`DROP INDEX CONCURRENTLY`).
**Enforcement:** CI lint.

**PROHIBITED:** an index added without a stated query it serves. **Why:** every index slows writes
and bloats the database. **Enforcement:** Review.

**PROHIBITED:** creating an index in the same migration that is expected to be fast. **Why:** the
`CONCURRENTLY` restriction makes it impossible; a separate migration is required. **Enforcement:**
CI lint.

### 7.5 Connections, pooling, and PgBouncer

**MANDATORY:** applications connect to PgBouncer, never directly. **Why:** I §7.5 — "PgBouncer is
the correct answer and it is what the system uses," reversing R §8.3's "not yet." **Enforcement:** I
§4.4 security groups — the database accepts the pooler port only, so a direct connection is not
merely discouraged, it is unreachable.

| Setting | Value | Why |
|---|---|---|
| `pool_mode` | **transaction** | I §7.5 — "Session mode holds it for the session and defeats the purpose" |
| `pool_size` | 16–25 per database/user pair, sized to instance CPU | I §7.5 |
| `max_client_conn` | 500+ | Absorbs task replicas |
| `reserve_pool_size` | 2–5 | Guarantees a connection for a burst that would otherwise queue |
| `server_lifetime` | Set | Bounds a connection-level failure's blast radius |
| `ignore_startup_parameters` | `extra_float_digits` | Standard compatibility requirement |
| Server-side total | ~100 across five databases, most well below cap | I §7.5 |

**MANDATORY:** local development runs through PgBouncer too. **Why:** I §7.5 names this the parity
gap it is trying to avoid — code "works in local Compose (no pooler) and fails in production (pooler
present)." **Enforcement:** §2.6's `make dev` starts the pooler; CI starts it for integration tests.

**MANDATORY:** migrations and break-glass access are the **only** documented exceptions, and they go
direct. **Why:** I §16.3 — DDL under a transaction pooler is "fragile: session-scoped operations
(`SET`, advisory locks, some `CREATE INDEX CONCURRENTLY` forms) misbehave." The exception is a
first-class entry in the security-group rule set, not a broad allowance. **Enforcement:** I §16.3;
§19.5's rollback checklist refers to it.

**MANDATORY:** every application DSN sets `default_query_exec_mode=exec`, so no protocol-level named
prepared statement can outlive a transaction. **Why:** transaction-mode pooling invalidates
session-scoped prepared statements (I §7.5), and the mitigation is version- and deployment-form-
independent (ADR-0003). **Enforcement:** CI — the parameter is asserted present in every DSN, and
`QueryExecModeDescribeExec` is asserted absent from the repository.

**PROHIBITED:** `QueryExecModeDescribeExec`; SQL-level `PREPARE`/`EXECUTE`/`DEALLOCATE`;
`db.Prepare`; `pgxpool`; any assumption of session state surviving a transaction; and any
reliance on
`max_prepared_statements` until a PgBouncer version is pinned. **Why:** ADR-0003 — PgBouncer
may
switch backends between a describe and its execute, SQL-level prepared statements are forwarded
straight to Postgres, and PgBouncer's own default for `max_prepared_statements` is `200`, so
silence would enable the feature. **Enforcement:** CI grep for the prohibited identifiers; Terraform
asserts `max_prepared_statements = 0` in `modules/database-proxy`.

**MANDATORY:** switching to pgx's native `pgxpool` requires a new ADR against R §9.5. **Why:**
ADR-0003 declined it on R's authority, not on merit. **Enforcement:** Review.


### 7.6 Migration ordering

Two distinct orderings apply, and they were previously conflated (C-8). Both are MANDATORY:

| Rule | Order | Why |
|---|---|---|
| Migration order across services | **`identity` first** (the others need its JWKS), then the remaining four | I §16.2 |
| Phase order | **One service per phase** | R §7.1 — "Never big-bang: no phase migrates more than one service's write path" |

**MANDATORY:** these are not alternatives. Identity's migration runs first *and* each service is
migrated in its own phase. **Why:** I §16.2 orders migrations within a phase; R §7.1 forbids a phase
taking more than one write path. **Enforcement:** CI — the pipeline asserts the per-database
advisory
lock and migration order (§7.2).

**MANDATORY:** during a phase, exactly one implementation writes a given table. **Why:** R §7.9 —
dual-write is allowed "only during a bounded window, never as a permanent state. A permanent
dual-write
is two sources of truth." **Enforcement:** Review + the golden-master comparison in §9.6.

**MANDATORY:** read paths cut over before write paths. **Why:** R §7.1 — "reads are easy to compare
and
easy to revert. Writes are neither." **Enforcement:** Review — a phase moving a write path before
its
read path fails review.

### 7.7 Data integrity

| Rule | Value | Why |
|---|---|---|
| Constraints | The database is the last line of defence. `CHECK`, `UNIQUE`, `NOT NULL` used | R §9.5 |
| Concurrency | Row locks where a read-modify-write must be serialised | R §3.4 |
| Idempotency | `ON CONFLICT DO NOTHING` or `DO UPDATE`, never check-then-insert | R §3.4 T3 |
| Oversell prevention | `SELECT … FOR UPDATE` on the stock row inside the transaction | R §3.4 T5, R §12.4 C1 |
| Transactions | One transaction per checkout, including its outbox insert | R §3.4 T2 |

**MANDATORY:** `CHECK (quantity > 0)`. **Why:** a negative quantity that is not in a transaction is
an
oversell (R §12.4 C1). **Enforcement:** CI lint + integration test.

**MANDATORY:** the outbox row is written in the **same transaction** as the domain change. **Why:**
R
§3.4 T2 and §10.2 — this is the only reason the event exists. **Enforcement:** integration test —
kill the relay and assert the event appears after restart.

**MANDATORY:** constraints are enforced in the database, not only in application code. **Why:** a
future service or a manual fix will not remember the application rule. **Enforcement:** CI lint +
a test that asserts the constraint rejects bad data.

---

## 8. Event and Contract Standard

### 8.1 The event set is fixed

R §3.6 defines it. **PROHIBITED:** adding, removing, or renaming an event outside this list.
**Why:** the
set is the integration surface; a new event needs an ADR (§0.7, §18 class 5). **Enforcement:**
Review +
a CI check that `contracts/events/` matches the registered list.

| Event | Emitted by | Consumed by |
|---|---|---|
| `OrderPlaced.v1` | commerce | engagement, reporting |
| `CheckoutCompleted.v1` | commerce | commerce (cart-clear consumer, self) |
| `OrderCancelled.v1` | commerce | engagement, reporting |
| `OrderStatusChanged.v1` | commerce | engagement, reporting |
| `StockAdjusted.v1` | commerce | reporting |
| `LowStockDetected.v1` | commerce | engagement |
| `StockChanged.v1` | commerce | catalog (availability cache, R §4.5) |
| `UserRegistered.v1` | identity | engagement, reporting |
| `ProductUpdated.v1` | catalog | commerce, search |
| `ProductDeleted.v1` | catalog | commerce, ordering |
| `PriceChanged.v1` | catalog | commerce (async cart repricing, R §3.5) |

**MANDATORY:** each event has a **single owning producer**. **Why:** R §10.2 — a second producer
makes
ownership of the fact unanswerable. **Enforcement:** Review + the CI check that `contracts/events/`
matches this table.

**PROHIBITED:** `InventoryReserved.v1` and `InventoryReserveFailed.v1`. **Why:** R §3.6 — "there is
no
`InventoryReserved.v1` and no `InventoryReserveFailed.v1` … reservation is not an observable event —
it
is an internal step of a transaction that either commits or does not. Emitting an event for a
transaction-internal step is noise." **Enforcement:** CI — `contracts/events/` matches this table.
Review.

### 8.2 Envelope

The envelope is fixed by ARCHITECTURE_ANALYSIS.md §7.2 rule 1. Neither R nor I restate it, so this
is a restatement, not an invention.

```json
{
  "event_id": "0193f6c2-7a41-7c3d-b0e2-5f8a1d4c6e90",
  "event_type": "OrderPlaced.v1",
  "event_version": 1,
  "occurred_at": "2026-10-05T14:23:01Z",
  "producer": "commerce",
  "correlation_id": "0193f6c2-11d4-7b8e-a3f5-90c2d4e6f812",
  "payload": {}
}
```

| Field | Rule | Why |
|---|---|---|
| `event_id` | UUIDv7. **The deduplication key** | R §2.5, R §3.6 |
| `event_type` | `Name.vN`, versioned | ARCHITECTURE_ANALYSIS.md §7.2 |
| `event_version` | Integer, monotonic | ARCHITECTURE_ANALYSIS.md §7.2 |
| `occurred_at` | RFC 3339 UTC | §6.3 |
| `producer` | The owning service, fixed per event type (§8.1) | ARCHITECTURE_ANALYSIS.md §7.2 |
| `correlation_id` | Same value as the request's (§6.8) | R §3.4 T6 |
| `payload` | Event-specific. **Only fields a consumer needs** | ARCHITECTURE_ANALYSIS.md §7.2 rule 4 |
| Redis stream entry ID | Not an event field. Redis assigns it | I §8.2 |

**MANDATORY:** `payload` carries the minimum, and **no PII beyond what a consumer needs**. **Why:**
ARCHITECTURE_ANALYSIS.md §7.2 rule 4 — `UserRegistered` carries `email` because the email consumer
needs it, "but it must not carry `address`." **Enforcement:** Review + a contract test asserting a
payload contains only declared fields.

**MANDATORY:** `event_id` is generated once, by the producer, inside the business transaction.
**Why:**
it is the deduplication key (R §2.5). **Enforcement:** Review.

**MANDATORY:** payloads describe **business facts, not ORM diffs**. **Why:**
ARCHITECTURE_ANALYSIS.md §7.2 rule 5 — "Publish `OrderPlaced`, not `order_row_updated`. Business
events survive refactors; ORM events do not." **Enforcement:** Review.


### 8.3 Outbox table

R §3.4 T6 fixes the columns. **Eight from R, plus `published_at` from I** (C-4, additive and
compatible).

```sql
-- Columns fixed by ARCHITECTURE_REVIEW.md §3.4 T6
CREATE TABLE outbox (
    event_id         UUID        NOT NULL UNIQUE,
    type             TEXT        NOT NULL,
    version          INT         NOT NULL,
    aggregate_type   TEXT        NOT NULL,
    aggregate_id     TEXT        NOT NULL,
    correlation_id   UUID        NOT NULL,
    payload          JSONB       NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Added by INFRASTRUCTURE_ARCHITECTURE.md: the pending predicate is published_at IS NULL
    published_at     TIMESTAMPTZ,

    -- Operational bookkeeping. NOT specified by R or I — see Appendix B, B26
    attempts         INT         NOT NULL DEFAULT 0,
    last_error       TEXT,
    next_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_outbox_unpublished ON outbox (next_attempt_at)
    WHERE published_at IS NULL;
```

| Rule | Value | Why |
|---|---|---|
| `event_id` | `UNIQUE` — this **is** the deduplication mechanism | R §2.5, §3.4 T6 |
| `type` / `version` | The event name and its version, per §8.2 | R §3.4 T6 |
| `aggregate_type` / `aggregate_id` | `'order'` and the order id for order events | R §3.4 T6 |
| `payload` | The complete serialised envelope (§8.2) | R §3.4 T6 |
| `published_at IS NULL` | **The** pending predicate. Not a status column | I §8.7 |
| Partial index | Indexes only unpublished rows | Supports I §8.7's recovery scan |
| No surrogate `id` | The natural key is `event_id` | §3.6 |
| Retention | **None.** The outbox is never pruned | I §8.8 |

**MANDATORY:** the outbox row and the business change share one transaction. **Why:** R §3.4 T2 —
this
is the only reason the event exists. **Enforcement:** integration test — kill the relay, assert the
event is present after restart.

**MANDATORY:** pending state is expressed by `published_at IS NULL`, not by a `status` column.
**Why:**
I §8.7 defines recovery as "Relay scans the outbox for rows where `published_at IS NULL`"; a
parallel
status column is a second source of truth for the same fact. **Enforcement:** CI — no `status`
column
in `outbox`.

**MANDATORY:** the same `event_id` is never reused across event types. **Why:** it is the global
deduplication key (R §2.5). **Enforcement:** CI + the `UNIQUE` constraint.

**MANDATORY:** `attempts`, `last_error`, and `next_attempt_at` are operational additions, not
architecture. **Why:** R §3.9 requires infinite retry with 1s → 60s backoff, which needs somewhere
to
record the attempt count. **Enforcement:** Appendix B records them as new decisions.


### 8.4 Schema evolution

| Rule | Value | Why |
|---|---|---|
| Version in the name | `OrderPlaced.v1` | R §3.6 |
| Additive only within a version | New optional field: allowed | I §15.6 |
| Breaking change | New version, e.g. `OrderPlaced.v2` | §8.4 |
| Publishing | Both versions during migration | I §15.6 — "deploying producers before consumers" |
| Removal | Only after every registered consumer has moved | B29 |
| Consumer registry | `contracts/events/consumers.yaml`, one line per consumer per event type | B29 |
| In-place edit | **PROHIBITED** | R §3.6, I §15.6 |

**MANDATORY:** a breaking payload change creates a new version; it never edits an existing schema in
place. **Why:** I §15.6. **Enforcement:** CI — schema files are versioned and immutable once
published; a change to a published file requires a new file.

**MANDATORY:** producers deploy before consumers for additive changes. **Why:** I §15.6 — this is
what makes a rolling deploy safe when the SPA and backends release independently (I §12.2).
**Enforcement:** Review + the release order in the deploy pipeline.

**MANDATORY:** removing a field from a published version requires every registered consumer to have
moved, and the registry is updated in the same PR that removes it. **Why:** neither R nor I states a
consumer registry, but I §15.6's producer-first ordering only makes removal safe if someone can
prove the consumers moved (B29). **Enforcement:** CI — a schema PR that removes a field fails unless
`contracts/events/consumers.yaml` shows no consumer on the old version.

**MANDATORY:** the registry names the consumer group that consumes each event type. **Why:** I §8.2
fixes four named groups, so the registry is a mapping from event type to group, not an abstract
owner (B29). **Enforcement:** CI — every registered event type appears in the registry.

### 8.5 Relay

**MANDATORY:** the relay is owned and run by **Commerce** (C-9). **Why:** I Appendix A.1 and I §1.1
—
Commerce owns the transactional outbox and its relay, and "`commerce-task-role`" is the only role
with
write access to the events stream. This is a deliberate revision of R §2.5's per-service relay.
**Enforcement:** Review + the task-role grants in `infra/` (I §4.5).

**MANDATORY:** publish by `XADD` to the single stream `sneakin:<env>:events`, where `<env>` is
`floci`, `staging`, or `production`. **Why:** ADR-0001 settled C-1 — the name is now fixed, and it
is hard-coded into ACLs, dashboards, and runbooks. **Enforcement:** CI asserts `sneakin:events`
appears nowhere in the repository, and the only stream-key literal under `infra/`, `deploy/`, and
`scripts/` is the pattern `sneakin:${env}:events`.

| Rule | Value | Why |
|---|---|---|
| Poll interval | **1s** | R §3.10 |
| Batch latency ceiling | **200ms** — events reach humans, not a hot path | R §3.10 |
| Claiming | `SELECT … FOR UPDATE SKIP LOCKED` | R §2.5, ARCHITECTURE_ANALYSIS.md §7.2 rule 6 |
| Acknowledgement | `XACK` **after** the database commit, never before | R §3.9, I §8.9 |
| Relay retry | **Forever**, exponential backoff 1s → 60s | R §3.9 — "No data loss is possible" |
| Unpublished marker | `published_at IS NULL` is the pending predicate | I §8.7 |
| Stream trimming | `MAXLEN ~ 50000`, approximate and deliberately non-exact | I §8.5, I §8.8, R §2.5 |
| Consumer groups | Four, named: `commerce-cart-clear`, `workers-engagement`, `workers-reporting`, `catalog-availability` | I §8.2 |
| Redis database | db 3, events only. Celery on db 1/2, Django cache on db 0 | I §8.10 |
| Redis settings | `appendonly yes`, `appendfsync everysec`, `maxmemory 256 MB`, **`maxmemory-policy noeviction`** | I §8.4, §8.5 |

**MANDATORY:** `XACK` happens after the consumer's database commit, never before. **Why:** R §3.9 —
"acking first and then failing loses the event permanently. This is the single most common mistake
in
stream-consuming systems." **Enforcement:** integration test — kill the consumer between read and
commit, then assert redelivery and no duplicate effect.

**MANDATORY:** the relay retries **forever**; it does not dead-letter a publish failure. **Why:** R
§3.9 — the row is not marked published until `XADD` succeeds, so retrying costs latency and not
correctness. **Enforcement:** integration test — stop Redis, publish, assert the row stays
unpublished
and publishes on recovery.

**MANDATORY:** `maxmemory-policy` is **`noeviction`**, set explicitly. **Why:** I §8.5 — the default
`allkeys-lru` "would silently evict stream entries under memory pressure — dropping domain events
with
no error. This is the single most important Redis setting in the system." **Enforcement:** CI config
assertion in `infra/`.

**MANDATORY:** the relay uses `FOR UPDATE SKIP LOCKED`, so a second relay instance is safe. **Why:**
R
§2.5 — "Simple, horizontally safe, no extra infra." **Enforcement:** integration test running two
relays concurrently.

**MANDATORY:** the outbox has **no retention limit**. **Why:** I §8.8 — the stream's 7-day retention
is
"a convenience window, not a durability boundary"; recovery beyond it comes from the outbox.
**Enforcement:** Review — no `DELETE` against `outbox` may be added without an ADR.

**MANDATORY:** the relay's recovery path republishes rows where `published_at IS NULL`, in
`created_at` order, **re-using the same `event_id`**. **Why:** I §8.7 — consumers that already
processed an event skip it via `processed_events`. **Enforcement:** integration test.

### 8.6 Consumption

| Rule | Value | Why |
|---|---|---|
| Consumer groups | **Four, fixed names**: `commerce-cart-clear`, `workers-engagement`, `workers-reporting`, `catalog-availability` | I §8.2 — "Four consumer groups on one stream"; I §8.7 |
| Fan-out | Each group receives every event independently | I §8.2 — "one group falling behind does not affect the others" |
| Credentials | **Per-consumer credentials** | I §8.11 — "a compromised service cannot read another consumer's pending events" |
| Network | `redis-sg` accepts the four service groups only. Not reachable from the edge | I §8.11, I §4.6 |
| Pending reclaim | `XAUTOCLAIM` after the **60s** visibility timeout | R §2.5, R §3.10, I §8.8 |
| Deduplication | `processed_events` PK `(event_id, consumer_name)`, **in PostgreSQL** | R §2.5, I §8.7 |
| Processing | Idempotent — the same event may arrive more than once | R §2.5, R §3.9 |
| Ack | Only after the consumer's own transaction commits | R §3.9 |
| Consumer retry | **5 attempts**, exponential backoff | R §3.9, I §8.9 |
| Dead letters | `dead_letters` table in the **owning service's** database, plus an alert | R §2.5, I §8.9 |
| Redrive | Manual replay, same `event_id`; redelivery is a no-op via `processed_events` | R §3.9, I §8.9 |
| Per-event deadline | 30s | R §3.10 |
| Ordering | **Not guaranteed.** Consumers must not depend on it | B27 (new decision) |
| One stream per event | **PROHIBITED** — a second stream per consumer type | I §8.2's four-group model; B27 |

**MANDATORY:** deduplication state lives in **PostgreSQL, not Redis**. **Why:** R §2.5 makes
`processed_events` the mechanism that "makes at-least-once delivery safe," and I §8.7 rules out
Redis
because wiping Redis would wipe the dedup state. **Enforcement:** CI — the `processed_events` table
lives in the consumer's own database, not in Redis.

**MANDATORY:** every consumer is idempotent by `event_id`. **Why:** R §2.5, and R §13.5's monthly
"consumer replay from a truncated outbox" rehearsal depends on it. **Enforcement:** a test
delivering the same event twice and asserting one effect.

**MANDATORY:** no consumer depends on message order. **Why:** B27. Redis Streams guarantees order
only
per stream for a single consumer at a time; the four consumer groups each read independently (I
§8.2),
and a retry or redrive reorders delivery within a group. **Enforcement:** Review + a consumer test
that
shuffles input.

**MANDATORY:** dead letters are a table, not a log line. **Why:** R §2.5 — Redis Streams has no
native DLX, and an app-level DLQ "is more reliable — it survives Redis restarts and is queryable."
**Enforcement:** CI — the `dead_letters` table exists in each consuming service's migrations.

**PROHIBITED:** a second stream, or a consumer group per event type. **Why:** I §8.2 fixes the group
count at four; each new stream is a new thing to provision, secure, ACL, and monitor for no gain.
**Enforcement:** Review + a CI check that the ACL list in `infra/` contains exactly four groups.

**MANDATORY:** consumer credentials are per-group. **Enforcement:** CI — I §4.4 and the `infra/` ACL
check.


## 9. Testing Standard

### 9.1 Test inventory and scale

**The counts are fixed by I §14.1 and are not a target to renegotiate.**

| Level | Count | Time | Gate | Lives in |
|---|---|---|---|---|
| Unit | ~450 | 25 s | Merge | `services/*/internal/**/*_test.go`, `services/identity/tests/` |
| Contract | ~40 | 5 s | Merge | `tests/contract/` |
| Service integration | ~180 | 90 s | Merge | `services/*/internal/**`, per package, real SQL |
| System integration | ~55 | 2 min | **Deploy** | `tests/system/` |
| Playwright E2E | ~61 | 8 min | **Deploy** / promotion | `tests/e2e/` |
| Smoke | 3 | 10 s | **Deploy** | `tests/smoke/` |
| Chaos | ~6 | 20 min | Nightly | `tests/chaos/` |

**MANDATORY:** the below-E2E to above-E2E ratio stays roughly **11:1**. **Why:** I §14.1 — "~700
tests
below E2E against ~61 above it — roughly 11:1. That ratio is what keeps feedback fast."
**Enforcement:**
CI reports both counts on every PR.

**MANDATORY:** a new endpoint ships with tests in the same PR. **Why:** I §12.1 — the counts
describe
the target state, and I §14.1's breakdown exists so coverage grows where risk is, not where it is
convenient. **Enforcement:** CI — a changed handler file without a changed test file fails the gate.

**MANDATORY:** unit tests have no I/O — no database, no HTTP, no network. **Why:** I §14.2. R §12.3
makes the same point from the other side: "Mocking `SELECT … FOR UPDATE` … tests your mock, not your
code." **Enforcement:** CI — the unit job runs with no service dependencies available.


### 9.2 Unit tests

**MANDATORY:** table-driven tests for state machines, validation, and calculations. **Why:** R §12.8
—
the order state machine is "a table; testing all of it is cheap." **Enforcement:** Review + §4.13.

**MANDATORY:** deterministic behaviour. Time is injected, randomness is seeded, map iteration is
sorted before comparison. **Why:** a test that fails 1 run in 20 is worse than no test, because it
teaches the team to re-run CI. **Enforcement:** CI — a flake-detection job re-runs failures once and
fails the PR if the second run passes.

**PROHIBITED:** a unit test that touches PostgreSQL, Redis, or the network. **Why:** that is an
integration test (R §12.3) and it belongs in a different directory with a different runtime.
**Enforcement:** CI — a unit-test job runs with no service dependencies available, so a network call
fails.

**MANDATORY:** pure functions are tested directly, without a service instance. **Why:** §4.3 —
business logic must be callable without the transport. **Enforcement:** Review.

### 9.3 Integration tests

**MANDATORY:** against **real PostgreSQL and Redis**, containerised per I §12.1. Not mocked, not
sqlite. **Why:** R §12.3 — "Mocking `SELECT … FOR UPDATE` or an `ON CONFLICT` clause tests your
mock, not your code." A sqlite-backed test proves nothing about row locks. **Enforcement:** CI — the
integration job requires a PostgreSQL service; there is no alternative path.

**MANDATORY:** each integration test applies migrations to an empty database, then exercises the
schema. **Why:** I §16.3 requires the same migration files everywhere, so the test must run them
too.
**Enforcement:** CI.

**MANDATORY:** each test runs in its own transaction, rolled back afterwards. **Why:** tests must
not
depend on each other's data, and a leaked row is a flaky test in disguise. **Enforcement:** CI —
a repeated run of the suite in a random order must pass.

**PROHIBITED:** shared mutable fixture data. **Why:** it is the source of order-dependent failures.
**Enforcement:** Review.

**MANDATORY:** the transaction-boundary tests from R §12.4 exist. **Why:** §17 #3 — the atomicity of
checkout is the property the whole system rests on. **Enforcement:** CI, as named tests:

| Test | Asserts |
|---|---|
| Rollback | Nothing is written if any step fails |
| Isolation | A failed checkout leaves stock unchanged |
| Concurrency | Two concurrent checkouts for the last item → one succeeds, one gets `409` |
| Idempotency | The same key replays the stored response, not a second order |
| Outbox atomicity | The event is present iff the domain change is committed |
| Relay recovery | A row stuck in `publishing` is retried after restart |

**Enforcement:** CI — these are named, individual tests, not assertions buried in a larger suite.

### 9.4 Contract tests

**MANDATORY:** every event payload in `contracts/events/` has a producer test and a consumer test.
**Why:** I §12.1 requires contract tests, and an event defined only in producer code has no
enforceable contract (§2.4). **Enforcement:** CI — a schema-change PR without matching contract test
changes fails.

**MANDATORY:** every endpoint in `contracts/openapi/<service>.yaml` is exercised for status codes,
error shape, and required fields. **Why:** §6.11. **Enforcement:** CI.

**MANDATORY:** the error shape test asserts **no internal detail** in any error body. **Why:** I §0
C4.
**Enforcement:** CI.

**MANDATORY:** backward-compatibility checks run against the previous contract version. **Why:**
§6.10;
R §12.8 requires compatibility guarantees to be real rather than assumed. **Enforcement:** CI.

### 9.5 End-to-end tests

**MANDATORY:** the critical user journeys, per R §12.7. **Why:** §9.5 — unit and integration tests
cannot prove the paths compose. **Enforcement:** CI E2E job against staging:

| Journey | Assertion |
|---|---|
| Register → verify → log in | Account usable end to end |
| Browse → filter → product detail | Catalog reads correct |
| **Add to cart → checkout → order confirmation** | Order placed, stock decremented, `OrderPlaced.v1` emitted, notification sent |
| Oversell | Second buyer is refused cleanly, not with a `500` |
| Cancel → restock | Stock restored, `OrderCancelled.v1` emitted |
| Admin: view order, transition status, broadcast | Authorization enforced |
| Cross-user access attempt | Returns `404`, not `403` (R §12.7) |

**MANDATORY:** E2E runs against a production-equivalent stack, not `make dev`. **Why:** I §14.4 —
the
staging environment exists so that the deployment method is tested, and an E2E pass against Compose
proves nothing about it. **Enforcement:** CI — the E2E job targets staging.

**MANDATORY:** E2E tests are the slowest gate and are allowed to be parallelised across shards. They
are not allowed to be skipped silently. **Enforcement:** CI — a skipped required E2E test fails the
job unless the PR carries a stated reason.

### 9.6 Migration-phase tests

**MANDATORY:** golden-master comparison runs continuously during any dual-run phase. **Why:** R
§12.6
— it converts "the migration looks fine" into a measurable claim, and it is the actual exit
criterion
for Phases 2, 3, and 4. **Enforcement:** CI + per-phase sign-off.

**MANDATORY:** the golden master captures real responses from the monolith, stored under
`docs/migration/` as fixtures. **Why:** §2.8. **Enforcement:** Review.

**MANDATORY:** cutover is feature flag → canary percentages → full, never a single irreversible
switch. **Why:** R §7.9 — "Never a single irreversible switch." This is a **migration-time**
technique for moving traffic between the monolith and a new service, and is distinct from the
deployment mechanism in I §6, which is digest promotion. **Enforcement:** Review + R §12.6's phase
exit criteria.

**PROHIBITED:** editing a golden-master fixture to make a comparison pass. **Why:** it destroys the
only evidence that the cutover is safe. **Enforcement:** CI — fixtures are immutable once recorded;
a change requires a Review note explaining the monolith's behaviour also changed.

### 9.7 Test data and determinism

| Rule | Value | Why |
|---|---|---|
| Seeding | Idempotent seed script under `scripts/seed/` | I §18.1 — every step is a Make target |
| Credentials | Test-only fixtures, never production-shaped secrets | I §10.1 |
| Personal data | Synthetic only. No real customer data in any environment | R §11.3 S8, I §10.1 |
| Time | Fixed clock in tests; `clock` interface in production code | §6.3 |
| PII in fixtures | Obfuscated | I §10.1 |
| Data volume | Smallest set that exercises the behaviour | R §12.8 |

**MANDATORY:** no production data is copied into any test or development environment. **Why:** R
§11.3 S8 and I §10.1. **Enforcement:** CI — a secret/PII scan over fixtures, plus a review rule.

### 9.8 Coverage policy

**MANDATORY:** per-area targets only (R §12.8), restated in §4.13 for Go. **PROHIBITED:** a flat
repository-wide coverage gate. **Why:** R §12.8 — "Chasing it produces low-value tests of
error-wrapping and struct literals." **Enforcement:** CI.

**MANDATORY:** coverage is reported, and the report is read. A coverage drop on a changed file
requires a reason. **Enforcement:** CI publishes the report; Review enforces the reason.

### 9.9 Test anti-patterns

**PROHIBITED:** a test that asserts a mock was called, where the mock stands in for behaviour the
system depends on. **Why:** R §12.3. **Enforcement:** Review.

**PROHIBITED:** `sleep` used to wait for async work. **Why:** a sleep is a guess; poll for the
condition with a timeout instead. **Enforcement:** Review + a lint for `time.Sleep` in tests.

**PROHIBITED:** a test with no assertions because the code "obviously" runs. **Enforcement:** CI.

**PROHIBITED:** weakening or skipping a test to make a pipeline pass. **Why:** §15.9 and §17.
**Enforcement:** CI — a skipped test or a raised threshold in the same PR as a production change
requires Review sign-off and a linked issue.

---

## 10. Security Standard

R §11 and I §10 are authoritative for the security posture. This section makes them repository
rules.

### 10.1 Secrets

**MANDATORY:** no secret value is ever committed, including in tests, fixtures, `.env` files, or
workflow definitions. **Why:** I §12.8 — the secret scan and push protection are blocking gates, and
I §3.6 permits only names and ARNs in code. **Enforcement:** CI — secret scan + push protection,
both
blocking.

**MANDATORY:** CI authenticates to cloud providers with **OIDC federation**. **PROHIBITED:**
long-lived cloud access keys. **Why:** I §9.6 — static credentials are rejected for the stated
reason. **Enforcement:** CI — a credential-use policy fails the workflow.

**MANDATORY:** credentials are injected at runtime by the platform, never read from a file in the
image. **Why:** a credential baked into an image layer survives every subsequent "fix".
**Enforcement:**
Review + I §12.2's image build review.

**MANDATORY:** Terraform stores only secret **names** and ARNs in state. **Why:** I §3.6.
**Enforcement:**
I §12.1's plan scan.

**PROHIBITED:** secrets in a log line, an error body, or a test fixture. **Why:** §6.4, §3.12.
**Enforcement:** CI + Review.

### 10.2 Input validation

**MANDATORY:** validate at the boundary, once, and reject unknown fields. **Why:** §6.3; R §11.3
names
unvalidated input the primary injection vector. **Enforcement:** Review + contract tests asserting
rejection.

**MANDATORY:** validate in Go by hand-written checks; in Django by a serializer. **Why:** R §9.3
rejects `go-playground/validator` as unnecessary; the stdlib covers it. **Enforcement:** CI import
ban.

**MANDATORY:** numeric and string inputs have explicit length and range bounds. **Enforcement:**
Review + a test asserting the bound.

**PROHIBITED:** passing raw user input into a shell, a file path, a redirect, or a log format
string.
**Why:** injection and log forging. **Enforcement:** Review.

### 10.3 SQL injection

**MANDATORY:** parameterised queries only. **Why:** R §11.3 — "Raw SQL interpolation of sort fields
is the named risk." **Enforcement:** Review + CI import/lint check.

**MANDATORY:** identifier interpolation — `ORDER BY`, table names, column names — uses an
**allowlist map**, never string concatenation. **Why:** R §11.3 names this specifically.
**Enforcement:** Review + a test asserting an unknown sort field is rejected.

**MANDATORY:** the existing `where` and `order_by` patterns in `backend/apps/*/admin_views.py` are
treated as a known finding to be fixed when that code is extracted. **Why:** R §11.3 identifies
them;
they are not to be copied into `services/`. **Enforcement:** Review — a pattern match in new Go or
Django code is rejected.

### 10.4 Authentication

**MANDATORY:** authentication is the JWT verification defined in §5.3. **Enforcement:** §5.3.

**MANDATORY:** the `Authorization` header is the only accepted credential for API calls.
**Enforcement:**
§6.5.

**MANDATORY:** the edge strips every client-supplied identity header. **Why:** R §11.4 — forging is
trivial if a service trusts a header. **Enforcement:** CI edge config check + a test.

**PROHIBITED:** a shared secret used to sign anything, including HS256 tokens. **Why:** R §6.2 and
R §11.3 — an HS256 compromise lets a holder mint tokens. **Enforcement:** §5.3.

### 10.5 Authorization

**MANDATORY:** ownership is a query filter. **Why:** R §11.3 — BOLA is "the most likely real-world
breach in this system." **Enforcement:** §5.3 + Review.

**MANDATORY:** every DRF view declares `permission_classes`. **Why:** R §11.2 S3's live finding.
**Enforcement:** CI.

**MANDATORY:** the role claim comes from the verified signature only. **Enforcement:** §5.3.

### 10.6 Transport and edge security

| Rule | Value | Why |
|---|---|---|
| TLS | Managed certificate, HTTP redirected to HTTPS | I §10.7 |
| Security headers | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, HSTS, CSP | I §10.7 |
| Rate limiting | Per IP on auth endpoints, per user on write endpoints | I §10.6 |
| Body size limit | Enforced at the edge; `client_max_body_size 1m` | R §8.8, I §23.1, I §10.6 |
| CORS | Explicit allowlist, never `*` with credentials | R §11.3 S6 |
| CSRF | Not applicable to API calls (header bearer tokens); required for the refresh cookie | R §11.3 |
| HSTS | Enabled in production | I §10.7 |
| Network | Database and Redis accept only the task security group; only the edge is public | I §4.4 |

**MANDATORY:** rate limits return `429`, not a dropped connection. **Why:** §6.1 — the client needs
a
distinguishable signal. **Enforcement:** contract test.

### 10.7 Dependency security

**MANDATORY:** `govulncheck` in the Go gate; pinned exact Python versions in
`requirements/base.txt`. **Why:** §4.12, §5.2. **Enforcement:** CI.

**MANDATORY:** base images pinned by digest, never by tag (§4.14). **Why:** I §23.7.
**Enforcement:** CI.

**RECOMMENDED:** refresh those digests on a fixed cadence even when nothing upstream changed.
**Why:** I §23.8 names a "rebuild cycle" among the mitigations for a compromised base image but
sets no interval; choosing one is this document's call, so the interval must appear explicitly in
the pipeline schedule. **Enforcement:** Review — a scheduled workflow in `.github/workflows/` names
the cadence.

**PROHIBITED:** adding a dependency outside the permitted set without an ADR (§4.2).
**Enforcement:**
CI + Review.

### 10.8 Production access

**MANDATORY:** access is via session-manager federation with OIDC and MFA. **Why:** I §9.6.
**Enforcement:** Review.

**MANDATORY:** break-glass database access exists, is logged, and is used only through the
documented
direct-connection exception. **Why:** I §16.3. **Enforcement:** §7.5 + §19.5.

**MANDATORY:** the production VPC is protected with `prevent_destroy`. **Why:** I §12.6.
**Enforcement:** CI `terraform plan` assertion.

---

## 11. Observability Standard

R §10 and I §11 are authoritative for the observability architecture: **logs, metrics, and traces**,
with no OpenTelemetry SDK in Go (§4.2) and no distributed tracing (I §22).

### 11.1 Logs

**MANDATORY:** structured JSON to stdout, via `log/slog` in Go. **Why:** §4.8; R §9.5.
**Enforcement:**
CI.

**MANDATORY:** every line carries the fields in §3.12. **Enforcement:** CI log-assertion helper.

**MANDATORY:** the `correlation_id` links the request, the order row, the outbox row, and every
event.
**Why:** R §10.2. **Enforcement:** §6.8.

**PROHIBITED:** logging a secret, a token, a full card number, or a raw internal error to a client.
**Why:** R §11.3 S8, §6.4. **Enforcement:** CI + Review.

**MANDATORY:** log levels are meaningful. An expected validation failure is not an `error`.
**Enforcement:** Review.

### 11.2 Metrics

**MANDATORY:** the metric vocabulary in §3.11 is fixed. **Why:** I §11.3. **Enforcement:** Review.

**MANDATORY:** metrics exposed at `/metrics`, with a documented scrape configuration.
**Enforcement:** §6.9.

**PROHIBITED:** high-cardinality labels. **Why:** a label containing a request ID or a user ID will
collapse the time-series store. **Enforcement:** Review + I §11.2.

### 11.3 Alerts

**MANDATORY:** exactly **nine** alerts, as fixed by I §11.6 (C-5). **Why:** R §10.5's "four" in
prose
and the five it lists are both superseded by I §11.6, which is the later document and the one that
owns
alerting. **Enforcement:** Review + I §12.1's alert-validation check.

| # | Alert | Threshold | Severity | Metric |
|---|---|---|---|---|
| 1 | Checkout failure rate | > 5% over 5m | **Page** | `checkout_attempts_total{result}` |
| 2 | Outbox unpublished growing | > 100 rows for 5m | **Page** | `outbox_unpublished_total` |
| 3 | Dead letters increased | Any increase | **Page** | `dead_letters_total{consumer,event_type}` |
| 4 | Task memory saturation | > 85% sustained | **Page** | Task memory utilisation |
| 5 | Consumer lag | > 1000 for 15m | Warn | `consumer_lag_entries` |
| 6 | Db pool saturation | > 90% of `pool_size` for 5m | Warn | `db_pool_in_use` |
| 7 | p99 latency over SLO | Two consecutive windows | Warn | `http_request_duration_seconds` |
| 8 | Redis memory near `maxmemory` | > 80% of 256 MB | Warn | `redis_up`, memory |
| 9 | TLS certificate expiry | < 14 days | Warn | Certificate metadata |

**MANDATORY:** every alert has a named runbook in `observability/runbooks/` and a receiver. **Why:**
I §11.7's
runbook workflow depends on it. **Enforcement:** CI — an alert without a runbook reference fails
validation.

**MANDATORY:** alert definitions live in `observability/alerts/`, not in application code. **Why:**
§2.2 — a definition duplicated in two places is one that drifts. **Enforcement:** Review.

**MANDATORY:** the set is not extended to "improve coverage". **Why:** I §11.6 states what is
deliberately **not** alerted — throughput changes, CPU on a burstable instance, a single-route 5xx
without volume, and Redis memory alone — because alert fatigue is how real pages stop being read.
**Enforcement:** Review + an ADR for any tenth alert.

**MANDATORY:** alert #8 exists specifically to get ahead of alert #2. **Why:** I §11.6 — with
`noeviction`, memory exhaustion produces write failures rather than evictions, so the relay starts
failing and #2 fires; #8 is the early warning for #2's cause. **Enforcement:** Review — the two must
be implemented together.


### 11.4 Dashboards

**MANDATORY:** dashboards live in `observability/dashboards/`, version-controlled. **Why:** §2.2.
**Enforcement:** Review.

**MANDATORY:** every metric on a dashboard exists in the §3.11 vocabulary. **Enforcement:** Review.

### 11.5 Health checks and verification

**MANDATORY:** `/healthz`, `/readyz`, `/diagnostics`, `/metrics`, `/version` per §6.9. **Why:** I
§11.4
replaces the monolith's `/api/health/` (C-3). **Enforcement:** CI.

**MANDATORY:** verification asserts the **running digest** matches the intended digest. **Why:** I
§12.5
and I §12.1 job 20 — a mutable tag in production makes "staging verification meaningless."
**Enforcement:** CI deploy
gate.

### 11.6 The debugging chain

**MANDATORY:** an incident is diagnosed along one path: `correlation_id` → the log line → the order
row
→ the outbox row → the event → the consumer. **Why:** R §10.2 and I §25.3 make this the documented
workflow. **Enforcement:** Review — an incident review that cannot follow this chain identifies the
missing field as a gap.

**MANDATORY:** the runbook for each alert starts from this chain. **Enforcement:** Review.

---

## 12. Git and Collaboration Standard

Naming per §3.14. This section adds the review and merge rules.

### 12.1 Branching

| Rule | Value | Why |
|---|---|---|
| Long-lived branches | `main` only | I Appendix A D25 |
| `develop` / `release/*` | **PROHIBITED** | D25 — "Two extra branches add ceremony without adding safety" |
| Feature branch | `<type>/<short-description>` from `main` | §3.14 |
| Push to `main` | **PROHIBITED** | Branch protection |
| Force-push to `main` | **PROHIBITED** | Branch protection |
| Force-push to a feature branch | Permitted; rebasing a feature branch is normal | — |
| Branch lifetime | Short. A branch older than a week is a signal to split the work | — |

**MANDATORY:** `main` is always deployable. **Why:** I §15.3 deploys by digest promotion and I §25
bisects in production; an undeployable `main` breaks both. **Enforcement:** CI — required status
checks.

### 12.2 Pull requests

**MANDATORY:** a PR is one logical change. **Why:** I §6.11 makes the release manifest per-commit;
a mixed commit makes "which digest introduced this" unanswerable. **Enforcement:** Review.

**MANDATORY:** the PR description states what changed, why, how it was verified, and which documents
or ADRs it is constrained by. **Enforcement:** PR template + Review.

**MANDATORY:** PR size is reviewed, not capped by a number. A reviewer asks for a split when the
change cannot be reviewed as a unit. **Enforcement:** Review.

**MANDATORY:** the author runs `make lint` and the relevant `make test` target before requesting
review. **Why:** §2.6 — the Makefile mirrors CI exactly, so this is the pre-flight. **Enforcement:**
Author discipline, verified by CI turnaround.

**MANDATORY:** draft PRs are used for work in progress. **Enforcement:** Review.

**PROHIBITED:** a self-merge without a second reviewer on a change touching checkout,
authentication,
schema, migrations, or infrastructure. **Enforcement:** CODEOWNERS (§12.5).

### 12.3 Commits and history

**MANDATORY:** Conventional Commits format per §3.14, squash-merged. **Why:** I §15.3 and I §25 rely
on linear history for `git bisect` during deploys and incidents. **Enforcement:** Review + a
commit-message lint.

**MANDATORY:** history is linear. **PROHIBITED:** merge commits on `main`. **Enforcement:** Review.

**MANDATORY:** a structural move lands as its own commit with no logic change (§2.8).
**Enforcement:**
Review.

**MANDATORY:** a revert is a new commit, not a history rewrite. **Why:** rewriting published history
invalidates every digest reference in a release manifest (I §6.11). **Enforcement:** branch
protection.

### 12.4 CODEOWNERS

**MANDATORY:** `CODEOWNERS` exists at `.github/CODEOWNERS` and covers, at minimum, `services/`,
`contracts/`, `infra/`, `deploy/`, `.github/workflows/`, and `docs/adr/`. **Why:** §12.4 — the
highest-risk paths need a named owner. **Enforcement:** branch protection requires the listed
owners.

**MANDATORY:** a change to `infra/` or `.github/workflows/` requires the platform owner. **Why:** I
§12.2 makes pipeline and infrastructure changes the highest-risk changes in the repository.
**Enforcement:** branch protection.

**MANDATORY:** a change to `contracts/` requires the owning service's reviewer, because a contract
is
a promise to a consumer. **Enforcement:** branch protection.

**RECOMMENDED:** `CODEOWNERS` mirrors the `Service` tag vocabulary in §3.8 — `identity`, `catalog`,
`commerce`, `workers`, `edge` — so an owner maps to a running service. **Enforcement:** Review.

**Note:** the roster is a human decision, not a technical one. It is listed in §21.

### 12.5 Review

**MANDATORY:** a reviewer verifies the enforcement column of every rule the change touches, not just
the diff's correctness. **Why:** §0.3 — a rule with no checkable enforcement is an opinion, and
review is the enforcement for those. **Enforcement:** Review.

**MANDATORY:** the reviewer resolves conflicts between documents by following §1.3 rather than
choosing a preferred document. **Enforcement:** Review.

**MANDATORY:** comments resolve to a rule or a stated reason. **Enforcement:** Review.

**PROHIBITED:** "nit" comments blocking a merge for a matter §3 or §4 does not cover.
**Enforcement:**
Review culture.

### 12.6 Issue discipline

**MANDATORY:** work that changes behaviour has an issue stating the governing section.
**Enforcement:**
Review.

**MANDATORY:** an ADR references the issue it resolves. **Enforcement:** Review + §14.

**RECOMMENDED:** label work with the service, so per-service workload is visible. **Enforcement:**
Review.

---

## 13. Documentation Standard

### 13.1 Documentation tiers

| Tier | Lives in | Audience | Update rule |
|---|---|---|---|
| Architecture | `ARCHITECTURE_REVIEW.md`, `INFRASTRUCTURE_ARCHITECTURE.md` | Everyone | By ADR only (§14) |
| Practice | `REPOSITORY_ENGINEERING_STANDARD.md` (this file) | Everyone | By ADR only |
| Decisions | `docs/adr/` | Everyone | Append-only |
| Contracts | `contracts/` | Producers and consumers | With the code that changes them |
| Runbooks | `observability/runbooks/` | On-call | With the alert |
| Operational guides | `docs/operational/` | Everyone | With the change that alters the procedure |
| Migration notes | `docs/migration/` | Phase participants | During dual-run |
| Code | Doc comments, package docs | Whoever reads it | With the code |

**MANDATORY:** a change to `contracts/`, a runbook, or a doc comment lands in the same commit as the
code it describes. **Enforcement:** Review.

**MANDATORY:** architecture and practice documents change only by ADR. **Why:** §1.2 — they are the
authoritative sources; an informal edit breaks the precedence chain. **Enforcement:** branch
protection on those paths.

### 13.2 README and service READMEs

**MANDATORY:** the repository `README.md` states what the system is, the layout (§2), how to run it
locally, and links to both architecture documents and this standard. **Enforcement:** Review.

**MANDATORY:** each service has a `README.md` covering its API base path, database, events produced
and consumed, local run command, and its owner. **Why:** §2.3 requires it, and it is the fastest way
to answer "what does this service own". **Enforcement:** Review.

**MANDATORY:** the root `README.md` contains **no** manual setup sequence that is not a Make target.
**Why:** §2.6 — I §18.9 makes "no manual steps" an acceptance criterion. **Enforcement:** Review +
a CI check for shell command blocks in the README.

### 13.3 Code documentation

**MANDATORY:** exported Go identifiers have doc comments. `revive` enforces it (§4.12).
**Enforcement:** CI.

**MANDATORY:** a comment explains **why**, not what. **Why:** the code says what. **Enforcement:**
Review.

**MANDATORY:** a comment citing a rule carries its document prefix — `R §3.4`, not `§3.4`. **Why:**
§0.2 — a bare reference is ambiguous. **Enforcement:** Review.

**PROHIBITED:** a comment asserting behaviour that contradicts R or I. **Enforcement:** Review.

### 13.4 Doc comments and generated artefacts

**PROHIBITED:** committing generated API clients (§2.4). **Why:** R §9.3 rejects code generation; a
generated file also obscures what is hand-written. **Enforcement:** CI + `.gitignore`.

**PROHIBITED:** committing generated Terraform state, plan files, or provider caches.
**Enforcement:**
`.gitignore` + CI.

### 13.5 Cross-references

**MANDATORY:** a section reference is always prefixed (§0.2). **Enforcement:** Review.

**MANDATORY:** a rule that states an enforcement mechanism names it in the same sentence.
**Enforcement:**
Review.

**MANDATORY:** a rule that states a "why" cites R or I when the reason comes from there, or names
the
live finding when it comes from the current codebase. **Enforcement:** Review.

---

## 14. Architecture Decision Record Standard

### 14.1 Why ADRs exist

**MANDATORY:** every decision that changes architecture, adds a dependency, service, or platform,
changes the repository structure, or resolves a known conflict is recorded as an ADR before the work
begins. **Why:** §0.7, §18 class 7. **Enforcement:** CI `adr-check` job + Review.

**MANDATORY:** ADRs are **append-only**. A changed decision is a new ADR that supersedes the old
one;
the old file is annotated, never rewritten. **Why:** §1.2 — a superseded decision that disappears
loses the reason it was reversed. **Enforcement:** Review + CI diff check.

### 14.2 Location and format

`docs/adr/NNNN-short-title.md`, zero-padded, monotonically increasing.

```markdown
# ADR-NNNN: <Title>

- Status: Proposed | Accepted | Superseded by ADR-MMMM | Deprecated
- Date: YYYY-MM-DD
- Deciders: <names or roles>
- Supersedes: ADR-XXXX        (if applicable)
- Superseded by: ADR-MMMM     (if applicable)
- Governing sections: R §N, I §N
- Refs: #<issue>

## Context
What is true today. Facts, with references. No opinions.

## Decision
What will be done, in one or two sentences.

## Alternatives considered
Each with the reason it was rejected. Cite the rejection if R or I already has one.

## Consequences
What becomes easier, what becomes harder, what must now be true.

## Verification
How it will be checked. The CI job, the test, or the measurement.
```

**MANDATORY:** `Verification` is not optional. A decision with no way to check it has no enforcement
mechanism (§0.3). **Enforcement:** Review + CI template check.

**MANDATORY:** `Alternatives considered` is not optional, and "none" is not an acceptable entry.
**Enforcement:** Review.

### 14.3 What requires an ADR

| Trigger | Example |
|---|---|
| New dependency outside the permitted set | Adding `chi` (§4.2) |
| New service or platform | A message broker (§0.7) |
| Repository structure change | A new top-level directory (§2.1) |
| API or event contract break | Removing a field (§6.10) |
| A rule in this document changed | Any §4–§13 rule |
| A resolved conflict | C-1, C-7, C-11 (ADR-0001, ADR-0002, ADR-0003) |
| Anything I §22 rejected | Kubernetes, Kafka, and the rest |

**MANDATORY:** an ADR whose `Governing sections` are absent from R and I is a practice decision; it
may not change architecture. **Why:** §1.2. **Enforcement:** Review.

### 14.4 Lifecycle

**Proposed → Accepted → (Superseded | Deprecated).** **MANDATORY:** a proposed ADR may not be
implemented. **Enforcement:** Review.

ADR-0001 through ADR-0004 are `Accepted`, owner-approved on 2026-10-06. ADR-0001, ADR-0002, and
ADR-0003 closed C-1, C-7, and C-11, and R and I are corrected to match them. ADR-0004 resolved this
document's own disagreement about where `CODEOWNERS` lives (§12.4 against §2.1 and §2.2, §1.3 step
4), and §12.4 is corrected to match it. **MANDATORY:** an agent must not revert a
corrected section to its pre-ADR wording. Reversal requires superseding the ADR, not editing the
section. **Why:** the open-conflict prohibition in §1.3 step 2 no longer applies, so reverting would
reintroduce a conflict that an accepted ADR closed. **Enforcement:** Review — reverting a section
whose ADR is `Accepted` without a superseding ADR is rejected.

**MANDATORY:** an ADR that resolves an open question in §21 updates §21 in the same PR. **Why:**
§1.3
step 6. **Enforcement:** Review.

**MANDATORY:** the ADR index in `docs/adr/README.md` lists every ADR with its status.
**Enforcement:**
CI index check.

### 14.5 Recorded rejections

**MANDATORY:** an ADR proposing something I §22 rejected must address that rejection's **named
trigger**. **Why:** I §22 gives each rejection a specific condition that would change the answer.
"I might need it later" is not a trigger. **Enforcement:** Review.

| Not used | Its named revisit trigger (I §22) |
|---|---|
| Kubernetes | >20 services, or a requirement for multi-cluster/region scheduling ECS cannot express |
| Kafka | >100 events/s sustained, or a requirement for long-term replay the outbox cannot serve |
| NATS | I §2.7 — Redis operational burden becomes real, or built-in dead-letter and ack semantics justify a second service |
| RabbitMQ | Per-message routing, priorities, or native DLX become requirements |
| Service mesh | Only if synchronous service-to-service calls are reintroduced |
| gRPC | Measured edge latency becomes a problem **and** a browser-compatible gRPC gateway is acceptable |
| API Gateway | Per-consumer attribution, cross-service transformation, or backend key management |
| ELK | Log volume or query complexity exceeding what the existing log service can serve |
| Loki | Never, unless Kubernetes is adopted |
| Full OpenTelemetry stack | Any trigger in I §11.9 |
| Redis Cluster | Events >10k/s, **or if the outbox is ever removed** — at which point single-node Redis becomes a data-loss risk |
| VPC endpoints / PrivateLink | An audit requirement that the datastores cannot use the public network path |
| NAT Gateway | A dependency that must reach an arbitrary external host |
| Read replicas | Read load on the primary sustained above capacity |
| Aurora | An I §7.2 split trigger, or exceeding a single node's connection or storage ceiling |
| Lambda | A genuinely event-triggered, short-lived task — of which there are currently none |
| Step Functions | Multi-branch, long-running, human-in-the-loop workflows with resumable state |
| Terraform Cloud | >10 contributors to the same environment, or a governance requirement |
| Full browser matrix in Playwright | A customer complaint about a specific browser |

**PgBouncer is not on this list.** I §22 marks it **Adopted**, explicitly reversing R §8.3 (C-12).


**MANDATORY:** an ADR citing one of these triggers must include the measurement that satisfies it.
**Enforcement:** Review.

---

## 15. AI Agent Engineering Rules

**The rules in this section apply to every AI agent working in this repository, including the one
that wrote this document.** They are not advisory; they are the same class of rule as §4–§13.

### 15.1 The single most important rule

> **Code never outranks a document.** (§0.6, §1.2)

An agent that finds code contradicting R or I has one obligation: **stop and report it**. Writing
code
that matches the code instead of the document is the failure this repository cannot afford, because
the documents are what the rewrite is being measured against.

### 15.2 Read before writing

**MANDATORY:** an agent reads the governing section before editing the corresponding area, and cites
the section in the PR description or commit body. **Enforcement:** Review.

| If the change touches | Read first |
|---|---|
| A service's behaviour | R's section for that service |
| Infrastructure, CI, or deployment | I's section for it |
| Repository practice | This document, the specific § |
| A dependency or platform | §0.7, then I §22 |

**MANDATORY:** an agent does not guess when a document is silent. It either proposes an ADR (§14) or
asks. **Why:** §1.3 step 5 — "Silence is not permission to improvise." **Enforcement:** Review.

### 15.3 Scope discipline

**MANDATORY:** an agent changes only what the task requires. No opportunistic refactoring, no
"while I was here", no reformatting unrelated code, no renaming for style. **Enforcement:** Review;
the PR diff is the evidence.

**MANDATORY:** an agent does not modify R, I, or this standard to make a task easier. **Why:** §1.2
—
these are the authority chain; an agent editing them removes the check. **Enforcement:** branch
protection; only a human may change them, and only by ADR.

**MANDATORY:** an agent does not create files outside the structure in §2.1. A new top-level
directory requires an ADR. **Enforcement:** Review.

**MANDATORY:** an agent does not install dependencies without an ADR (§4.2, §10.7). **Enforcement:**
CI + Review.

### 15.4 Precedence discipline

**MANDATORY:** when documents conflict, the agent applies §1.3 in order and records the resolution.
It does not choose the document it prefers. **Enforcement:** Review.

**MANDATORY:** when a conflict is unresolved, the agent does not pick a side. It implements neither
and reports it. **Why:** §1.3 step 2, and §1.4 records which conflicts are open. Q1, Q2, and Q3 are
no longer among them. **Enforcement:** Review.

**MANDATORY:** the agent treats R as authoritative for domain behaviour and I for platform, without
exception or negotiation. **Enforcement:** Review.

### 15.5 Refusal to hide uncertainty

**MANDATORY:** an agent states what it did not do and why, in the PR description. **Why:** §0.5 and
§21 — the value of this repository's documentation is that its gaps are recorded rather than papered
over. **Enforcement:** PR template.

**MANDATORY:** an agent does not leave a placeholder, a stub, a commented-out block, or a `TODO` in
merged code. **Why:** §9.9 — silent incompleteness is how a pipeline goes green without the work
being done. **Enforcement:** CI grep for `TODO`, `FIXME`, `XXX` in changed files; Review.

**MANDATORY:** an agent that cannot complete a requirement says so rather than narrowing the stated
requirement to something it can complete. **Enforcement:** Review.

### 15.6 Honesty about verification

**MANDATORY:** an agent reports only the verification it actually ran. **Enforcement:** Review.

**PROHIBITED:** reporting a test as passing when it was not run; describing a command as run when it
was not; reporting a count as verified when it was estimated. **Enforcement:** Review. This is
individually and collectively the most damaging failure mode, because every downstream decision
depends
on it.

**MANDATORY:** an agent reports a failing verification as a failure, with the output, rather than
summarising it away. **Enforcement:** Review.

**MANDATORY:** an agent distinguishes "the architecture documents say X" from "the code currently
does
Y" and never merges the two. **Enforcement:** Review.

### 15.7 No self-issued approvals

**PROHIBITED:** an agent marks its own CI check as passed, disables a failing job, weakens a test,
or
raises a threshold to get a green build (§9.9). **Enforcement:** CI — workflow files are
branch-protected and every change to them requires the platform owner (§12.4).

**PROHIBITED:** an agent edits `.github/workflows/` to remove a check the task made inconvenient.
**Enforcement:** branch protection + CODEOWNERS.

**MANDATORY:** when a gate fails, the agent fixes the cause or reports the failure. Never the gate.
**Enforcement:** Review.

### 15.8 Change-scope discipline for agents

**MANDATORY:** an agent classifies its change per §18 and states the class in the PR description.
**Enforcement:** PR template.

**MANDATORY:** an agent that finds itself making an architecture change — not a practice change —
stops and writes an ADR proposal. **Why:** §18 class 9. **Enforcement:** Review.

**MANDATORY:** an agent does not refactor across service boundaries. Domain logic stays in its
owning
package or service (§4.3, §5.1). **Enforcement:** Review.

### 15.9 Agents do not weaken tests

**PROHIBITED:** deleting, skipping, or weakening a test, lowering a coverage target, or adding a
conditional bypass, to make a build pass. **Why:** §9.9 and §17 — the test suite is the only
evidence
that the rewrite preserved behaviour, and R §12.6 makes the golden-master comparison the exit
criterion for the migration. **Enforcement:** CI + Review + CODEOWNERS on test paths.

**MANDATORY:** an agent that believes a test is wrong reports it with the reasoning, and the test
changes only through review. **Enforcement:** Review.

### 15.10 Prompt and context discipline

**MANDATORY:** an agent working in this repository receives the governing section for the area it
will
touch, and the precedence rules in §0.2 and §1.1, before it starts. **Why:** §0.2 — the failure mode
this prevents is an agent citing the wrong document and confidently implementing it.
**Enforcement:**
Review of the PR's cited references.

**MANDATORY:** an agent does not rely on memory of this repository across sessions; it re-reads the
documents. **Why:** §1.3 step 5. **Enforcement:** Review.

**RECOMMENDED:** `AGENTS.md` at the repository root points to this document and states §15 in full,
so
an agent's first read is the rule set rather than the code. **Enforcement:** Review.

---

## 16. Definition of Done

### 16.1 For any change

- [ ] `make lint` passes (§2.6)
- [ ] `make fmt` produces no diff (§4.12)
- [ ] The relevant `make test` target passes (§2.6)
- [ ] Tests are added or updated for the behaviour (§9.1)
- [ ] No secret, token, or credential is committed (§10.1)
- [ ] No dependency was added outside §4.2 without an ADR
- [ ] Governing sections are cited in the commit body (§3.14)
- [ ] Change class is stated per §18
- [ ] The PR description states what was not done and why (§15.5)

### 16.2 For an API change

- [ ] OpenAPI updated in `contracts/openapi/<service>.yaml` (§6.11)
- [ ] Contract tests updated (`tests/contract/`) (§9.4)
- [ ] Compatibility checked against the previous version (§6.10)
- [ ] A breaking change carries a version bump and an ADR (§18.1)
- [ ] Error codes added to the closed set, or an existing one reused (§6.4)
- [ ] Deprecation announced with a replacement if a field is removed (§6.11)

### 16.3 For an event change

- [ ] Schema added to `contracts/events/` (§2.4)
- [ ] The event is on the registered list in §8.1; adding one is an ADR (§8.1)
- [ ] Producer and consumer contract tests updated (§9.4)
- [ ] Version bumped rather than edited in place (§8.4)
- [ ] Change is additive within the version (§8.4)
- [ ] Producer deployed before consumer (§8.4)

### 16.4 For a schema or migration change

- [ ] Migration is additive (§7.2)
- [ ] `lock_timeout` and `statement_timeout` are set (§7.2)
- [ ] Lock and expected duration documented (§7.2)
- [ ] Every new FK is indexed (§7.4)
- [ ] Indexes created `CONCURRENTLY` (§7.4)
- [ ] No data backfill in the migration (§7.2)
- [ ] Rollback path documented, or irreversibility stated (§7.2)
- [ ] The migration runs unchanged in dev, CI, and production (§7.2)

### 16.5 For an infrastructure change

- [ ] Terraform formatted (`make fmt` equivalent for HCL) (§2.6)
- [ ] `tflint` and `validate-terraform` pass (§2.6)
- [ ] `terraform plan` reviewed; no unexpected destroy (§2.5)
- [ ] `prevent_destroy` intact on stateful resources (§10.8)
- [ ] No secret **value** in state or code (§10.1)
- [ ] No manual step introduced — everything is a Make target or a pipeline step (§2.6)
- [ ] ADR if this changes architecture (§18 class 9)

### 16.6 For a change during a migration phase

- [ ] Exactly one implementation writes each table: the monolith or the new service (§7.6)
- [ ] Dual-write, where the phase needs one, is bounded by a deletion date (§7.6)
- [ ] Golden-master comparison passes (§9.6)
- [ ] Cutover follows feature flag → canary → full (§9.6)
- [ ] The phase's exit criteria are measurable, not asserted (R §12.6)

### 16.7 For an AI-agent change

- [ ] The governing section was read first and is cited (§15.2)
- [ ] No unrelated file was touched (§15.3)
- [ ] No document was edited to unblock the task (§15.3)
- [ ] Only verification actually run is reported (§15.6)
- [ ] Nothing is left stubbed, commented out, or `TODO` (§15.5)
- [ ] No failing gate was disabled (§15.7)
- [ ] Unresolved conflicts were reported, not decided (§15.4)

---

## 17. Engineering Invariants

**These hold regardless of task, tool, or agent. A change that breaks one is wrong, not "a different
approach."**

| # | Invariant | Source |
|---|---|---|
| 1 | Zero synchronous service-to-service calls | R §5.2, I §4.4 |
| 2 | One owner per database; no cross-service reads; no cross-service FKs | R §4.1, R §4.4 |
| 3 | The checkout transaction is atomic, including its outbox insert | R §3.4 T2 |
| 4 | PostgreSQL is the source of truth; the outbox is durable | R §2.5, R §2.6 |
| 5 | Events are delivered at least once; consumers are idempotent by `event_id` | R §2.5, R §3.9 |
| 6 | `XACK` happens only after the consumer's database commit | R §3.9 |
| 7 | No event is ever published before its transaction commits | R §3.4 T2 |
| 8 | JWT signature is the only identity assertion; no header is trusted | R §11.4, R §11.3 |
| 9 | Ownership is a query filter, never fetch-then-compare | R §11.3 |
| 10 | Go's dependency set stays at exactly three | R §9.2 |
| 11 | CI runs against production-equivalent images with digests | I §12.5 |
| 12 | Terraform is the only way cloud resources are created | I §3.1 |
| 13 | Migrations run from the same image as the service | I §16.2 |
| 14 | No test is weakened to make a pipeline pass | §9.9, §15.9 |
| 15 | Code never outranks a document | §0.6, §1.2 |
| 16 | Every rule states its enforcement mechanism | §0.3 |
| 17 | An unresolved conflict is reported, never guessed | §15.4 |
| 18 | Secrets are never committed; CI uses OIDC | I §9.6, I §12.8 |
| 19 | Every event carries `correlation_id` back to the originating request | R §3.4 T6 |
| 20 | Production images are immutable, digest-pinned | I §6.2, §12.1 |

**MANDATORY:** a change that breaks an invariant requires an ADR, not a code review.
**Enforcement:**
Review, and §19's gates for the subset that is automatable.

---

## 18. Change Classification

**Every change is classified before review.** The class determines the required evidence.

| Class | What it is | Requires |
|---|---|---|
| **1. Typo / formatting** | No behaviour change | Nothing beyond CI |
| **2. Implementation** | Same behaviour, different code, within one service | Tests pass (§16.1) |
| **3. Behaviour change** | A service's observable behaviour changes | Tests added; API/event/contract impact assessed (§16.2, §16.3) |
| **4. Schema change** | Migration, table, column, index | §16.4 + ADR if breaking |
| **5. API or contract change** | Endpoint, payload, error code | §16.2 or §16.3 + ADR if breaking |
| **6. Repository structure change** | Directory layout, Makefile, tooling location | ADR (§18 class 6) |
| **7. Dependency, service, or platform addition** | Anything outside §4.2, or any I §22 rejection | ADR (§18 class 7, §14.5) |
| **8. Practice change** | A rule in this document changes | ADR (§14.3) |
| **9. Architecture change** | R or I changes | ADR **and** both documents updated in the same PR |
| **10. Emergency change** | Production incident mitigation | ADR afterwards within 24h, retrospective mandatory |

**MANDATORY:** the class is stated in the PR description. **Enforcement:** PR template + Review.

**MANDATORY:** class 9 changes to R and I land in one PR with the ADR, so the documents never
disagree with the code. **Why:** §1.2. **Enforcement:** Review.

### 18.1 What counts as breaking

For APIs (§6.10): removing or renaming a field; changing a type; changing requiredness; changing a
default; changing an error `code`; changing status-code semantics.

For events (§8.4): removing or renaming a field; changing a type; making an optional field required;
reusing an existing `event_type` for different content.

For database consumers: renaming a column or table that another service reads — which §7.1 already
prohibits.

**MANDATORY:** a breaking change is additive-first: add, migrate consumers, then remove in a later
release. **Why:** I §15.6 and §16.4. **Enforcement:** Review.

### 18.2 Emergency changes

**MANDATORY:** an emergency change is minimal, reversible, and recorded. **Why:** class 10 — the
temptation in an incident is to fix several things at once. **Enforcement:** retrospective.

**MANDATORY:** an emergency change that changes architecture requires an ADR afterwards, and it is
reviewed more strictly than a planned one, not less. **Enforcement:** Review.


## 19. Repository Quality Gates

**CI is where this document is enforced.** Gates below mirror the CI jobs in I §12.1; §2.6 keeps the
Makefile aligned with them.

### 19.1 Pre-merge, every PR

**The gate list is fixed by I §12.1** (26 jobs). Target wall time under 8 minutes.

| # | Gate | Tool | Rule | Blocks |
|---|---|---|---|---|
| 1 | `lint-terraform-fmt` | `terraform fmt -check -recursive` | Empty diff | Yes |
| 2 | `validate-terraform` | `terraform init -backend=false && terraform validate` | — | Yes |
| 3 | `lint-terraform` | `tflint` | — | Yes |
| 4 | `scan-terraform` | `checkov` or `tfsec` | No HIGH/CRITICAL | Yes |
| 5 | `infra-plan` | `terraform plan` against Floci | Plan only; fail on an unguarded destroy | Yes |
| 6 | `fmt` | `gofmt -l` | Empty output | Yes |
| 7 | `vet` | `go vet ./...` | — | Yes |
| 8 | `lint-go` | `golangci-lint` (staticcheck, revive, govet) | — | Yes |
| 9 | `test-go` | `go test -race ./...` | **The race detector is non-negotiable** | Yes |
| 10 | `lint-django` | `flake8` + `black --check` | — | Yes |
| 11 | `test-django` | `pytest` against an ephemeral PostgreSQL service | — | Yes |
| 12 | `lint-frontend` | `eslint` | — | Yes |
| 13 | `typecheck-frontend` | `tsc --noEmit` | — | Yes |
| 14 | `test-frontend` | Vitest + React Testing Library | — | Yes |
| 15 | `dependency-check` | OSV/Dependabot for Python, JS, Go; `govulncheck` (I §23.7) | Block on known-exploitable | Yes |
| 16 | `secret-scan` | `gitleaks` | **Always** | Yes |
| 17 | `build-images` | Each image builds, starts, and `/healthz` responds | — | Yes |
| 18 | `lint-dockerfile` | Hadolint | No HIGH | Yes |
| 19 | `dockerignore-check` | No `.env*`, `*.pem`, `*.key`, `terraform.tfstate*` in the image | I §6.5 | Yes |
| 20 | `digest-pin-check` | No task definition carries a tag without `@sha256:` | I §6.3 | Yes |
| 21 | `migration-lint` | No `DROP`/`RENAME` without a matching expand/contract pair | I §16.4 | Warn |
| 22 | `fk-boundary-check` | No `commerce` migration declares an FK into `catalog` or `identity` | R §4.4 | Yes |
| 23 | `e2e-config-check` | Typecheck the Playwright suite and list tests without running them | — | Yes |
| 24 | `contract-test` | Event schemas, JWT claim shape, error shapes | §9.4 | Yes |
| 25 | `decision-guard` | `sneakin:events` appears nowhere; the only stream-key literal is `sneakin:${env}:events`; `default_query_exec_mode=exec` is present in every assembled DSN; `QueryExecModeDescribeExec` and `pgxpool` are absent | ADR-0001, ADR-0003 | Yes |
| 26 | `module-tree-check` | Every module directory named in I §3.1 exists under `infra/terraform/modules/` | ADR-0002 | Yes |

**MANDATORY:** jobs 19, 20, and 22 are the controls that make the architecture enforceable rather
than aspirational. **Why:** I §12.1 — their absence means secrets in image layers, unreproducible
promotion, and silent erosion of the five-database model respectively. **Enforcement:** CI; removing
one requires an ADR.

**MANDATORY:** job 5 plans and never applies. **Why:** I §12.1 — asserting on the plan "turns
'someone
deleted the database' from a production incident into a failed pull request." **Enforcement:** CI.

**MANDATORY:** jobs run in parallel groups by language. **Why:** I §12.1 — wall time is bounded by
the
slowest group, not the sum. **Enforcement:** CI workflow structure.


### 19.2 Pre-deploy

Runs once per merge to `main`. I §12.2 is authoritative for the sequence.

| Gate | Rule | Blocks |
|---|---|---|
| `e2e` | Full user journeys against a reconciled staging environment (§9.5) | Yes |
| `infra-plan` | Reviewed; no unexpected destroy (§2.5) | Yes |
| `alert-validation` | Nine alerts present, each with a runbook (§11.3) | Yes |
| `migration-check` | Migrations applied to a scratch database by the one-off task (§7.2) | Yes |
| `schema-version-assert` | Exit code 0 **and** the expected schema version (I §16.2) | Yes |
| `playwright` | ~61 specs on staging | Yes — I §14.1 |

**MANDATORY:** migrations run as a **one-off task between `apply` and the service update**, never at
container start. **Why:** I §16.2 lists five distinct failures of migrate-on-start, including "the
task reports healthy, the migration failed, and the service runs against a wrong schema."
**Enforcement:**
CI — pipeline stage order is asserted.

**MANDATORY:** a migration failure stops the deploy before the service update. **Why:** I §16.2 —
the
success criteria are exit code 0 *and* a schema-version assertion, "a tool exiting 0 while the
schema
is wrong is possible." **Enforcement:** CI.


### 19.3 Post-deploy

| Gate | Rule | Blocks |
|---|---|---|
| `readiness-gate` | Poll `/readyz` every 5s up to 180s; require 200 **and** `healthy == true` | Yes — I §12.5 |
| `version-assertion` | `/version` returns the expected SHA on every service | Yes — I §12.5 |
| `workers-verification` | Outbox lag decreasing; the four consumer groups exist | Yes — I §12.5 |
| `smoke` | 3 post-deploy assertions (I §14.1) | Yes |

### 19.4 Gates that block everything

**MANDATORY:** these failing means stop: the secret scan, the dependency check, `prevent_destroy` on
the production VPC, and the `/version` digest assertion. **Why:** each is a gate whose failure is
invisible after the fact — a 200 from `/readyz` proves *a* healthy task exists, not that *this*
build
is running (I §12.5). **Enforcement:** CI + §10.8.

### 19.5 The rollback checklist

**MANDATORY:** the following exist before a deployment, and are exercised at least once per quarter.
**Why:** §19.5 — a rollback path that has never been rehearsed is a hypothesis. **Enforcement:**
Review, plus a quarterly exercise record in `observability/runbooks/`:**

1. The previous image digest is identified and retained (§4.14, I §6.2)
2. Traffic returns to the previous digest, and the promotion is repeated in reverse
3. Schema rollback follows the documented down path, or is declared irreversible in advance (§7.2)
4. Database access for investigation goes direct, through the documented break-glass path (§7.5)
5. Events published by the failed version are accounted for, using `correlation_id` (§11.6)

**MANDATORY:** a rollback is a digest promotion, not a rebuild. **Why:** I §12.5 — rebuilding
produces a different artifact than the one that was verified. **Enforcement:** Review + the
quarterly
exercise.

### 19.6 What CI does not gate

**Stated explicitly, because a gate that does not exist is often assumed to.**

| Not gated | Why not | What covers it |
|---|---|---|
| Repository-wide coverage | R §12.8 rejects it | Per-area targets (§4.13, §9.8) |
| Code style beyond the linters | Subjective | Review (§12.5) |
| Test quality | Cannot be automated | Review, plus §9.9's anti-patterns |
| Document accuracy | Cannot be automated | Review (§13) |
| Whether an ADR was the *right* decision | A judgement | §14.5's recorded rejections + human review |

---

## 20. Implementation Roadmap

**This section orders the repository work.** It does not change any architecture decision; R §7 and
I §16.2 remain authoritative for migration-phase content.

**These numbers are not R's phases.** R §7.2–7.7 defines six *migration* phases, keyed to which
domain moves out of the monolith. The phases below are *repository* phases — the order in which
directories, contracts, services, and infrastructure get built. The two sequences run in parallel
and
are mapped in §2.8.

| Phase | Repository work | Gates that must exist first |
|---|---|---|
| **0. Structure** | Create `services/`, `contracts/`, `infra/`, `deploy/`, `tests/`, `observability/`, `docs/`, `scripts/`. Add `Makefile`, `CODEOWNERS`, PR template, `AGENTS.md` | ADR-0001, ADR-0002, ADR-0003 (§21.1) |
| **1. Contracts first** | `contracts/events/*.json`, `contracts/openapi/*.yaml`, event and API schemas before any producer exists | §2.4 |
| **2. Identity** | Django stays Django; `services/identity/` created; JWT, JWKS, refresh rotation implemented | §5.3 |
| **3. Commerce** | Go service; the checkout transaction; the outbox relay | §7.5 and ADR-0003's DSN rules |
| **4. Catalog** | Go service; product reads behind a feature flag | R §12.6 golden master |
| **5. Engagement** | Go service; notifications; Celery database separated | R §7.3, I §8.10 |
| **6. Reporting** | Go service; `OrderPlaced.v1` consumption | §8.6 |
| **7. Infrastructure** | Terraform modules; staging; CI on production-equivalent images | §2.5, §19.1 |
| **8. Cutover** | Per-phase dual-run with golden-master comparison; one service per phase | §7.6, §9.6 |

**MANDATORY:** a phase does not begin until the gates in its row exist and pass. **Why:** I §12.1
treats production-equivalent CI and the identity-first dependency as blocking, not aspirational.
**Enforcement:** Review.

**MANDATORY:** phases are sequential per service (R §7.1), while identity is built first (I §16.2).
These are distinct rules and both apply (§7.6). **Enforcement:** CI pipeline structure.

**MANDATORY:** the SPA's `Idempotency-Key` change (§6.7) ships before, or with, the first order
write.
**Why:** R §3.8 identifies it as a frontend change on the checkout critical path. **Enforcement:**
Review.

---

## 21. Open Questions and Decisions Still Requiring Confirmation

**Every entry in §21.2 is unresolved. Silence is not permission to pick a side (§1.3, §15.4).** Work
that depends on one should not start. §21.1 records questions that have since been answered by an
ADR; §21.3 records those this document answered directly.

**DEFERRED:** every entry in §21.2 carries the `DEFERRED` label from §0.3, which means a decision is
required before the work it blocks begins — not that the work may proceed with a guess. §21.1 and
§21.3 are registers of questions that are answered and carry no label.
**Enforcement:** Review — a PR touching a blocked area must cite its resolution.

### 21.1 Resolved by ADR — no longer blocking

Q1, Q2, and Q3 were blocking until the following ADRs were raised and accepted. Their decisions are
settled, the ADRs are `Accepted` as of 2026-10-06, and implementation may proceed (§1.4, §14.4).

| ID | Decision | ADR | Governing sections corrected |
|---|---|---|---|
| **Q1** | Redis stream key is `sneakin:<env>:events` in logical database `3`, one stream per environment | `docs/adr/0001-redis-stream-key.md` | R §2.5 pseudocode and Transport row; I §8.2 diagram label |
| **Q2** | Data tier is three modules: `modules/database`, `modules/database-proxy`, `modules/redis` | `docs/adr/0002-data-tier-terraform-modules.md` | I §3.1 L3 Data row; I Appendix C Phase 0 checklist |
| **Q3** | `database/sql` + `jackc/pgx/v5/stdlib` with `default_query_exec_mode=exec`; `max_prepared_statements = 0` until a PgBouncer version is pinned | `docs/adr/0003-go-postgres-layer-and-prepared-statements.md` | I §7.5 Go row and mitigation table; R §9.2/§9.5 stand unmodified |

### 21.2 Non-blocking — resolve during the phase named

| ID | Question | Default if unanswered | Resolve by |
|---|---|---|---|
| **Q4** | `CODEOWNERS` roster — actual people, not roles | No owner; branch protection defaults | Phase 0 |
| **Q5** | Local development path: full `make dev` Compose vs direct service runs | `make dev` fast path (I §18.5) | Phase 0 |
| **Q6** | Registry alias names, since I §6.2 needs `<registry>` values | Document the pattern; values supplied per environment | Phase 0 |
| **Q7** | Local metrics/log transport: where `/metrics` is scraped in `make dev` | None scraped locally; the endpoint exists for integration with the collector | Phase 0 |
| **Q8** | What triggers the deferred decisions in I §22 | The stated trigger; no action while untriggered | Ongoing |
| **Q9** | Floci capability checklist — which items actually exist before adoption | Verify before relying on any capability; I §6.8 is a checklist, not a guarantee | Phase 7 |
| **Q10** | Schema-version tracker: the tool that enforces the `/version` expectation | `SCHEMA_VERSION` per service, asserted in CI | Phase 7 |
| **Q11** | Whether `commerce` also exposes the reporting read model | No; `reporting` owns its own consumption of `OrderPlaced.v1` (R §4.2) | Phase 6 |
| **Q12** | Changelog format | Generated from Conventional Commits at release time | Phase 0 |

### 21.3 Resolved by this document

| Conflict | Resolution | Section |
|---|---|---|
| C-1 stream key | `sneakin:<env>:events` in Redis DB 3 (ADR-0001) | §1.4, §7, §8.5 |
| C-2 image naming | I §6.2 | §3.9 |
| C-3 health endpoints | I §11.4 | §6.9 |
| C-4 outbox columns | Additive; `published_at` included | §8.3 |
| C-5 alert count | Nine, per I §11.6 | §11.3 |
| C-6 test counts | I §14.1's pyramid (~450 unit, ~180 service integration, ~55 system, ~61 E2E) | §9.1 |
| C-7 Terraform data-tier modules | Three modules: `database`, `database-proxy`, `redis` (ADR-0002) | §2.5 |
| C-8 migration ordering | I §16.2's per-database order and R §7.1's one-phase-per-service rule both apply, distinctly | §7.6 |
| C-9 relay owner | Commerce | §8.5 |
| C-10 hosting | Task platform | §2.8, I §5.2 |
| C-11 Go Postgres layer | `database/sql` + pgx stdlib with `default_query_exec_mode=exec` (ADR-0003) | §4.10, §7.5 |
| C-12 PgBouncer | Required, transaction mode; I §7.5's arithmetic supersedes R §8.3 | §7.5 |

---

## Appendix A — Decisions Explicitly Derived from the Architecture Documents

**No new judgement. Each entry restates a decision already recorded in R or I.**

| # | Decision | Source | Section here |
|---|---|---|---|
| A1 | Three Go dependencies: pgx, go-redis, jwt-go | R §9.2 | §4.2 |
| A2 | Every listed ORM, router, logger, config, DI, and assertion library is rejected | R §9.3 | §4.2 |
| A3 | All code under `internal/` | R §9.4 | §4.3 |
| A4 | `database/sql` pool, not a hand-rolled one | R §9.5 | §4.10 |
| A5 | Context threading; no context in a struct | R §9.5 | §4.5 |
| A6 | No retry inside a handler | R §9.5 | §4.6 |
| A7 | `log/slog` JSON to stdout | R §9.5 | §4.8 |
| A8 | 10s checkout timeout ceiling; 5s on reads | R §3.10, R §9.5 | §4.6 |
| A9 | `CGO_ENABLED=0`, distroless, nonroot | R §9.6 | §4.14 |
| A10 | Ed25519 signing; HS256 not fixable by configuration | R §6.2 | §5.3 |
| A11 | 30-minute access tokens; rotating opaque refresh tokens | R §6.1, R §6.2 | §5.3 |
| A12 | Ownership as a query filter; 404 not 403 | R §11.3, R §12.7 | §5.3 |
| A13 | Explicit DTOs; no mass assignment | R §11.3 | §5.3 |
| A14 | CSRF does not apply to bearer-token API calls | R §11.3 | §10.6 |
| A15 | Argon2id as the password hash target | R §6.2 | §5.2 |
| A16 | `Idempotency-Key` on order creation; `idempotency_keys` 7-day, `processed_events` 30-day retention | R §3.8 | §6.7 |
| A17 | Nine alerts | I §11.6 | §11.3 |
| A18 | `correlation_id` propagated end to end | R §3.4 T6, R §10.2 | §6.8 |
| A19 | Additive-only schema evolution; new version for a break | R §3.6, I §15.6 | §8.4 |
| A20 | `XACK` only after the consumer's database commit; at-least-once; idempotent consumers | R §2.5, R §3.9, I §8.9 | §8.5, §8.6 |
| A21 | Relay polls every 1s with a 200ms batch-latency ceiling; retries forever, backoff 1s → 60s | R §3.10, §3.9 | §8.5 |
| A22 | `MAXLEN ~ 50000` approximate trimming; four named consumer groups; `maxmemory-policy noeviction` | I §8.5, I §8.2 | §8.5, §8.6 |
| A23 | Per-consumer-group Redis ACLs; `processed_events` dedup in PostgreSQL, not Redis | R §2.5, I §8.7, I §8.11 | §8.6 |
| A24 | PgBouncer in transaction mode; migrations direct | I §7.5 | §7.5 |
| A25 | Digest-pinned images; staging verification asserts the digest | I §6.2, I §12.5 | §4.14, §11.5 |
| A26 | OIDC CI auth; no static cloud credentials | I §9.6 | §10.1 |
| A27 | `prevent_destroy` on stateful resources | I §12.6 | §10.8 |
| A28 | Terraform is the only cloud-provisioning path | I §3.1 | §2.5 |
| A29 | `make dev` remains as a local fast path, deprioritised | I §18.5 | §2.8 |
| A30 | No manual steps; every operation is a Make target | I §18.1, I §18.9 | §2.6 |
| A31 | Identity first; then one service per phase | I §16.2, R §8.6 | §7.6 |
| A32 | Golden-master comparison is the phase exit criterion | R §12.6 | §9.6 |
| A33 | Redis excluded from readiness | I §0 C4 | §6.9 |
| A34 | Edge performs no authorization | I §10.9 | §6.6 |
| A35 | Per-area coverage targets, no repository-wide gate | R §12.8 | §9.8 |
| A36 | Race-enabled Go tests in CI | I §12.1, I §12.2 | §4.13 |

---

## Appendix B — Genuinely New Decisions Introduced by This Document

**Nothing in R or I required these. They are practice choices made to close a gap, and each is
reversible by ADR.**

| # | New decision | Rationale | Section |
|---|---|---|---|
| B1 | Target directory layout `services/`, `contracts/`, `infra/`, `deploy/`, `tests/`, `observability/`, `docs/`, `scripts/` | Neither document specifies a repository layout | §2.1 |
| B2 | `Makefile` as the sole operator interface | Extends I §18.1's "no manual steps" to a single entry point | §2.6 |
| B3 | `UPPER_SNAKE_CASE` env vars with no service or environment prefix | Neither document specifies naming | §3.10 |
| B4 | Conventional Commits with squash-only linear history | Neither document specifies commit format | §3.14 |
| B5 | `docs/adr/` structure and ADR template | Neither document contains an ADR process | §14.2 |
| B6 | JSON Schema in `contracts/`, hand-written, no checked-in generated client | R §9.3 rejects code generation; a versioned home is still needed | §2.4, §13.4 |
| B7 | `floci`/`staging`/`production` database, role, and stream naming | Neither document specifies the local-environment identifier set; ADR-0001 fixes the stream key to `sneakin:<env>:events` | §3.6, §3.7 |
| B8 | `Rule classification` — MANDATORY / PROHIBITED / RECOMMENDED / DEFERRED | Neither document labels rules or their consequences | §0.3 |
| B9 | Enforcement column on every rule | Rules without a checkable mechanism are opinions | §0.3, §0.4 |
| B10 | Reference-prefix requirement (`R §`, `I §`, bare `§`) | Prevents an agent citing the wrong document | §0.2 |
| B11 | Change classification classes 1–10 | Neither document defines what evidence a change needs | §18 |
| B12 | AI-agent rules as a first-class section | No document constrains agent behaviour, and an agent is the main implementer | §15 |
| B13 | CODEOWNERS requirement | Neither document requires code ownership | §12.4 |
| B14 | `scripts/` limited to maintenance, with deployment logic prohibited | Neither document says where deployment logic lives | §2.7 |
| B15 | Alert and dashboard definitions version-controlled in `observability/`, not in code | I §11 defines the alerts but not their source of truth | §11.3, §11.4 |
| B16 | Per-area Go coverage targets restated in this document | R §12.8 gives the intent; the concrete numbers needed a home | §4.13 |
| B17 | §19's gate-to-rule mapping, mirroring I §12.1's job list | I §12.1 lists jobs; it does not say which rule each enforces | §19 |
| B18 | Named rollback checklist with a quarterly exercise | I §12.5 defines promotion; it does not define the rollback rehearsal | §19.5 |
| B19 | Unit tests run with no service dependencies available, so a network call fails | Enforces R §12.3's "no mocking" rule mechanically | §9.2 |
| B20 | §19.6 stating what is *not* gated | Prevents assumed gates and re-litigating R §12.8's coverage decision | §19.6 |
| B21 | Open-question register with a blocking/non-blocking distinction | I §22 lists triggers but not unresolved internal contradictions | §21 |
| B22 | Structural moves land as isolated commits | Not stated in R or I; required by I §15.3's bisect reliance | §2.8 |
| B23 | `X-Request-ID` edge generation plus a documented propagation chain | R §10.2 requires the field; I §10.4 requires edge generation; the full chain needed a single statement | §6.8 |
| B24 | Error-body contract test asserting no internal detail | I §0 C4 identifies the exposure; no document requires a test for it | §9.4 |
| B25 | Idempotency behaviour must be stated explicitly per endpoint, including "none" | R §3.8 covers orders only; silence elsewhere would be ambiguous | §6.7 |
| B26 | `attempts`, `last_error`, `next_attempt_at` on the outbox; `schema_version` column name | R §3.4 T6's eight columns and I §11.4's `/version` report need storage, but neither document names the columns | §3.6, §8.3 |
| B27 | Message order is not a guarantee; consumers are order-independent | Neither R nor I states the delivery-order contract, and I §8.2's independent groups imply it | §8.6 |
| B28 | No second stream and no consumer group per event type | I §8.2 fixes four groups; the prohibition needed stating to be enforceable | §8.6 |
| B29 | `contracts/events/consumers.yaml` maps each event type to the consuming group | I §15.6 orders producers before consumers but neither document records who has consumed what, which removal needs | §8.4, §16.3 |

---

## Appendix C — Quick Reference

**What to read for what.**

| I need to | Read |
|---|---|
| Add a Go endpoint | R §9, then §4, §6 |
| Write checkout code | R §3.4, then §4.10, §7.3, §8.3 |
| Add an event | R §3.6, then §8.1–§8.4 |
| Change a migration | §7.2, §7.4, §16.4 |
| Add a dependency | §4.2, §0.7, §14.5 |
| Change Terraform | I §3, then §2.5, §16.5 |
| Change the pipeline | I §12, then §19 |
| Add an alert | I §11.6, then §11.3 |
| Change the repo layout | §2.1, §18 class 6 |
| Add a field to an API | §6.10, §16.2 |
| Make a service call another service | R §5.2 — do not |
| Rename a column another service reads | §7.1 — do not |
| Write an ADR | §14.2 |
| Add an open question | §21 |
| Resolve an open question | §14.4, then update §21 |

**The three rules that catch the most mistakes:**

1. Code never outranks a document (§17 #15).
2. An unresolved conflict is reported, never guessed (§15.4).
3. Only verification actually run is reported (§15.6).
