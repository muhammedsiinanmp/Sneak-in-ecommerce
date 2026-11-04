# Infrastructure Architecture — SneakIn

**Role:** Principal Platform Engineer
**Status:** Design only. Nothing in this document has been implemented.
**Supersedes:** the infrastructure sections of `ARCHITECTURE_REVIEW.md` (§8) where they conflict.
**Respects:** the domain and application decisions in `ARCHITECTURE_REVIEW.md` and
`ARCHITECTURE_ANALYSIS.md`, which remain authoritative for everything outside this document.

---

## Scope and Ground Rules

This document designs the **infrastructure and delivery platform**. It does not redesign the
application. Where the two meet, the application's decisions win, and this document absorbs the cost.

| Constraint | Status |
|---|---|
| No application code, Go, Django, Terraform, Dockerfiles, CI workflows, or manifests were written | Confirmed. This is a design document |
| Domain architecture unchanged | Confirmed. All 30 decisions in `ARCHITECTURE_REVIEW.md` Appendix A stand |
| Terraform is the IaC layer | Adopted (§3) |
| Floci is the local AWS-compatible environment | Adopted (§2) |
| Previous AWS infrastructure no longer exists | No AWS resource is assumed to exist. Everything is created by `terraform apply` (§3.8) |

**How to read this document.** §0 is the most important section — it lists the six places where the
infrastructure mandate contradicts the existing architecture review, and how each is resolved. If you
read one section, read §0.

**A note on Floci.** This design is written against the **AWS API contract** — the service names,
resource shapes, and semantics in the AWS APIs — because that is what "AWS-compatible" means and
because it is the only stable interface to design against. §2.7 contains an explicit **capability
matrix** listing every AWS service this design depends on, flagged as *required*, *optional*, or
*degraded*, together with the fallback. **Verify that matrix against your installed Floci version
before committing to it.** Where a service may be unsupported, the design isolates the dependency
behind a module interface so the fallback is a variable change, not a redesign. I have not invented
Floci CLI syntax or assumed unverified capabilities.

---

## 0. Contradiction Register

The mandate to build a Terraform-managed, cloud-native platform conflicts with
`ARCHITECTURE_REVIEW.md` in six places. Each is resolved explicitly rather than silently.

### C1 — Compose-on-a-single-host versus Terraform-managed platform

| | |
|---|---|
| **Review says** | §8.1–8.4: one EC2 host, seven Docker Compose containers, Nginx on the host, `t3.medium`, "Docker Compose on one host. Not Kubernetes" |
| **Mandate says** | Terraform provisions infrastructure; deployment is a pipeline stage; the environment is cloud-native |
| **Contradiction** | Compose cannot be the deployment target. It is imperatively mutated by SSH, has no declarative service identity, no resource limits, no health-gated rollout, and cannot be reconciled by Terraform. §7 phasing of the review assumes a deploy pipeline that does not exist |

**Resolution:** the **deployment target becomes a task-based compute platform** (§5). Docker Compose is
**retained for exactly two purposes** and no others:

1. The *transitional* bridge while Phase 0–2 of the review's migration run inside the monolith
2. An **optional** fast inner-loop for developers who skip `make infra-up`

Terraform provisions the network, registry, datastores, IAM, and load balancer. The deploy pipeline
registers task definitions and updates services. **Compose is never the thing Terraform manages, and
never the thing CD deploys to.** The review's memory budget (§8.1) becomes per-task sizing (§5.6)
rather than host sizing, and the `t3.medium` recommendation becomes the *aggregate* sizing input.

### C2 — Connection pooling: PgBouncer rejected, but required on a task platform

| | |
|---|---|
| **Review says** | §8.3: "PgBouncer: **not yet**. With 5 services, pool counts are ~25 connections. Postgres's default `max_connections=100` is sufficient" |
| **Problem** | That arithmetic assumed **one instance of each service**. A task platform runs N replicas, and replicas scale horizontally on load. Connection count becomes `replicas × pool_size`, which scales with traffic |

The arithmetic in §7.3 shows this crosses `max_connections` at realistic autoscaling levels.

**Resolution: PgBouncer IS adopted** — transaction-mode, one instance, in front of PostgreSQL,
fronted by a Terraform-managed security group. Only reachable from the service subnets (§4.4).

This is a genuine reversal of a prior decision, and it is worth being explicit about why the prior
decision was correct *for the model it assumed*. On a single host with five processes, 25 connections
into 100 available is genuinely fine and a pooler would have been unjustified. **The architecture did
not change; the deployment model did, and the arithmetic followed.** This is the correct time to
reverse it, and reversing it late would have caused a production connection exhaustion incident.

### C3 — Static and media files served from a container volume

| | |
|---|---|
| **Repo says** | `nginx/nginx.conf`: `location /static/ { alias /app/staticfiles/; }` and `location /media/ { alias /app/media/; }` — served from volumes mounted into the app container (`static_volume`, `media_volume`) |
| **Problem** | This requires the edge and the application to **share a filesystem**. A task-based runtime gives each task an isolated filesystem. There is no volume to share, and no host Nginx to mount it |

This is not a contradiction of the review — the review's §8 treated Compose volumes as unremarkable
because Compose *does* support shared volumes. It becomes a contradiction the moment the deployment
model changes.

**Resolution: object storage (§4.7, §7.6).** Django admin static files and user media move to S3; the
SPA and its built assets are served by a static origin. The edge serves content from object storage
rather than proxying to a task. This is a *consequence* of the mandated runtime change, and it is the
reason §7.6 of this document introduces object storage — **not** for speculative scale.

### C4 — The existing `/api/health/` endpoint is a restart-loop generator

| | |
|---|---|
| **Repo says** | `backend/apps/accounts/health_views.py` — `AllowAny`, checks **both** Postgres **and** Redis**, returns **503** if either is down, and embeds the raw exception text: `f"down: {str(e)}"` |
| **Conflict** | R §3.12 **F8** and R §8.9 establish that Redis failure must **not** affect checkout, and that `/healthz` must **never** check a dependency. If this endpoint were wired to a load-balancer health check, a Redis blip would pull **every task** out of rotation and restart it — turning a non-impacting dependency outage into a total outage |

The review's §8.9 prescribed a `/healthz` + `/readyz` split but did not notice that an endpoint
implementing the *opposite* of that split already exists and is currently the deployment's health
target (`cd.yml` curls it).

**Resolution: split into three endpoints** (§11.5), and Redis is excluded from readiness:

| Endpoint | Checks | Redis included | Wired to |
|---|---|---|---|
| `/healthz` | Process is alive. **No dependencies** | No | Container health check |
| `/readyz` | Postgres reachable, JWKS loaded | **No** | Load-balancer target health |
| `/diagnostics` | Postgres, Redis, outbox lag, consumer lag — authenticated, no raw errors | Yes, reported not gating | Humans only |

The raw-exception disclosure is removed; failures return a boolean and a correlation ID.

### C5 — OIDC in a local environment that may not implement token exchange

| | |
|---|---|
| **Mandate says** | "Use GitHub Actions OIDC for cloud authentication rather than long-lived AWS credentials" |
| **Problem** | GitHub Actions → AWS OIDC token exchange is an AWS IAM feature. A local AWS-compatible environment may implement the IAM surface without implementing the OIDC provider endpoint |

**Resolution:** OIDC is **mandatory and non-negotiable for the production environment** (§9.6,
§12.6) — it is the only long-lived-credential-free path to real AWS, and it is designed in full.
For Floci, CI uses a **short-lived, runner-scoped registry + API credential minted at job start by
`floci`** (§19.3), stored only in the runner environment and never in a workflow file. The workflow
**structure is identical** in both cases; only the credential-acquisition step differs. This is stated
as a known parity gap in §20.3 with a mitigation, not glossed over.

### C6 — Ephemeral per-job environments versus a locally-running cloud

| | |
|---|---|
| **Mandate says** | "Prefer deterministic, disposable test environments where practical" |
| **Problem** | Floci is a local, single-instance, long-lived environment. GitHub-hosted runners have no Floci. Ten parallel PR jobs cannot each have their own full environment on one machine |

**Resolution: a two-tier model** (§19).

| Tier | Environment | Used by | Rationale |
|---|---|---|---|
| **Fast** | Ephemeral Compose test stack on a GitHub-hosted runner | PR CI unit + integration + contract tests | Seconds to create, fully parallel, no IaC. Covers the lower 3 test levels, which are where 95% of tests live |
| **Full** | Dedicated Floci environment on a **self-hosted runner** | Post-merge CD, integration suite, Playwright E2E, staging verification | Full IaC parity. One environment per *deployment*, not per job — it is reconciled by Terraform rather than created and destroyed, which is both faster and more deterministic |

**Honest statement of the trade:** per-job ephemeral Floci environments are not practical. They would
require serialising jobs on one machine and would make CI *slower* than the deployment it verifies.
The mitigation is that the Fast tier still gives per-job isolation for the tests that dominate in
count and duration, and the Full tier gives full parity for the tests that need it. This is recorded
in §20.3 as the largest deliberate parity gap.

### C7 — Incidental contradictions found in existing configuration

Not conflicts with the review, but contradictions between the review's requirements and what exists.
Listed so the platform work has a scope.

| # | Existing | Required by review | Infra resolution |
|---|---|---|---|
| C7a | `nginx.conf` has **no `location /api/`**; everything proxies to `backend:8000` | §5.2: edge routes per-service | §10.2 path-based routing |
| C7b | `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for` **appends** client-supplied values | §8.8, §11.4: strip, then set | §10.4 edge must **replace**, not append |
| C7c | `proxy_read_timeout 60s` | §3.10: 10s on checkout | §10.5 per-path timeout budget |
| C7d | No `limit_req` | §11.2 S7 | §10.6 rate limiting |
| C7e | No `X-Request-ID` generation | §10.2, §13 | §10.4 |
| C7f | HSTS is set in **Django** (`prod.py:38-40`), but `/static/` and `/media/` are served by **Nginx** and never reach Django → **no HSTS on static responses** | §11.4 | HSTS moves to the edge, which is the only place that sees every response |
| C7g | No `Content-Security-Policy` anywhere | §11.4 | §10.7 |
| C7h | `X-XSS-Protection` set | — | Dead header, removed from modern browsers. Delete; it signals false confidence |
| C7i | `cd.yml` uses a long-lived EC2 SSH key with `StrictHostKeyChecking no` and `UserKnownHostsFile /dev/null` | §9: no long-lived credentials, §23 CI security | **Entirely replaced** (§12) |
| C7j | `cd.yml` runs `docker compose build` **on the host at deploy time** | §6: build once, promote the same image | Replaced. No rebuild on deploy |
| C7k | `cd.yml` runs `up -d` **before** `migrate` — the new code is live before its schema exists | §16 | Replaced by the ordered pipeline in §16.2 |
| C7l | `cd.yml` health check is `sleep 15` then one `curl` | §12.5, §15.3: poll readiness, verify each service | Replaced by a gated readiness probe |
| C7m | No `concurrency:` group on either workflow | §12.6: deployment concurrency | Added |
| C7n | No `permissions:` block on either workflow | §23 least privilege | Added |
| C7o | Actions pinned to mutable tags (`actions/checkout@v4`) | §23 supply chain: pin to SHA | Replaced |
| C7p | Frontend CI builds only — no lint, no typecheck, no tests. **No `test` script exists in `package.json`** | §13, §14 | Added |
| C7q | No Go tests, no `go vet`, no Go linting — the Go services do not exist yet in the tree | §12.1 | Added |
| C7r | `.pre-commit-config.yaml` has black/flake8 only — **no Go or Terraform hooks**; and the hook is **not installed** (`.git/hooks/pre-commit` absent) | §12.1 | Extended and enforced in CI |
| C7s | `ci.yml` triggers on a `develop` branch that **does not exist** | §12.6 branch model | Branch model simplified to `main` + PR |
| C7t | Pre-deploy backup written to `~/backups` **on the same host**, best-effort, `\|\| true` | §7.5, §17 DR | Replaced: managed backups + verified restore drill |
| C7u | DNS is `sneakin.duckdns.org` (free dynamic DNS) | §10.1: managed DNS with real certificates | Replaced |

**None of these are application-architecture changes.** They are delivery-platform defects, and
fixing them is squarely within this document's scope.

---

## 1. Infrastructure Architecture

### 1.1 Application architecture (restated, unchanged)

From `ARCHITECTURE_REVIEW.md`. This document must not alter it.

| Component | Runtime | Owns | Scale driver |
|---|---|---|---|
| **Identity** | Django + Gunicorn | Users, JWT issuance, JWKS, token blacklist | Login rate |
| **Catalog** | Go | Brands, categories, subcategories, products, images, size catalog | **Read** traffic (hottest path) |
| **Commerce** | Go | Cart, wishlist, orders, **inventory**, checkout, **transactional outbox** | Checkout + cart traffic |
| **Workers** | Go | Engagement + Reporting consumers. Two consumer groups, two DB credentials, **no cross-DB access**. Does **not** own the relay — Commerce does | Event rate (~0.25/s) |
| **Edge** | Load balancer | TLS, routing, WAF-adjacent controls, correlation IDs | Request rate |

Five logical databases: `identity`, `catalog`, `commerce`, `engagement`, `reporting`.

**The property that shapes all infrastructure decisions: there are zero synchronous
service-to-service calls.** Consequences that recur throughout this document:

| Consequence | Infrastructure effect |
|---|---|
| No east-west application traffic | Network design needs edge→service and service→datastore only. **No service mesh, no service-to-service auth, no internal load balancing** (§22) |
| No cross-service FKs | Five logical databases can share one PostgreSQL instance with **no distributed joins** (§7.3) |
| Workers are the only async path | Worker autoscaling is decoupled from request scaling (§5.8) |
| Data plane is narrow | Egress is almost entirely managed-service traffic (§4.8) |

### 1.2 Deployment architecture

```
                        ┌──────────────────────────────────────────────┐
                        │           Developer workstation              │
                        │  git clone · Docker · Floci CLI · Terraform  │
                        └───────────────────┬──────────────────────────┘
                                            │ HTTP (AWS API compatible)
                                            ▼
  ═══════════════════════════════════════ FLOci (local cloud) ═══════════════════════════════════════
                                                                                               
  ┌──────────────────────────────── VPC-equivalent ──────────────────────────────────────────────┐
  │                                                                                             │
  │  PUBLIC SUBNETS ────────────────────────────────────────────────────────────────────────────  │
  │                                                                                             │
  │    ┌────────────────────┐                                                                  │
  │    │  Edge / LB (TLS)   │  terminates TLS, routes by path, adds X-Request-ID,               │
  │    │  health-gated      │  strips spoofable headers, rate limits, HSTS/CSP                   │
  │    └─────────┬──────────┘                                                                  │
  │              │  /api/v1/products/*      → catalog                                          │
  │              │  /api/v1/{cart,orders,wishlist} → commerce                                   │
  │              │  /api/v1/auth/*           → identity                                        │
  │              │  /                        → SPA static origin (object storage)              │
  │              │  /static/, /media/        → object storage                                  │
  │              ▼                                                                              │
  │  ┌───────────────────────────────────────────────────────────────────────────────────────┐  │
  │  │  PRIVATE SUBNETS — application tasks (no public IPs, no ingress)                     │  │
  │  │                                                                                       │  │
  │  │   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌────────────────────┐  │  │
  │  │   │  identity    │    │   catalog    │    │  commerce    │    │      workers       │  │  │
  │  │   │  Django      │    │   Go         │    │  Go          │    │  Go (engagement    │  │  │
  │  │   │  N tasks     │    │   N tasks    │    │  N tasks     │    │  + reporting)      │  │  │
  │  │   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    └─────────┬──────────┘  │  │
  │  └──────────┼───────────────────┼───────────────────┼─────────────────────┼───────────────┘  │
  │             │                   │                   │                     │                   │
  │             ▼                   ▼                   ▼                     ▼                   │
  │  ┌─────────────────────┐  ┌────────────────────────────────────────────────────────────────┐  │
  │  │  DATA SUBNET        │  │  Redis (Streams, AOF, noeviction, AUTH)                        │  │
  │  │  ┌───────────────┐  │  │  Streams: 1 (Celery broker, transitional)                     │  │
  │  │  │  PostgreSQL   │  │  │           2 (Celery results, transitional)                     │  │
  │  │  │  PgBouncer    │  │  │           3 (domain events)                                   │  │
  │  │  │      ↓        │  │  └────────────────────────────────────────────────────────────────┘  │
  │  │  │  1 instance   │  │  ┌────────────────────────────────────────────────────────────────┐  │
  │  │  │  5 logical DBs│  │  │  Object storage: SPA bundle, /static/, /media/, SBOMs, reports   │  │
  │  │  │  5 roles      │  │  └────────────────────────────────────────────────────────────────┘  │
  │  │  └───────────────┘  │  ┌────────────────────────────────────────────────────────────────┐  │
  │  └─────────────────────┘  │  Registry (ECR-compatible): immutable images by digest        │  │
  │                           └────────────────────────────────────────────────────────────────┘  │
  │                           ┌────────────────────────────────────────────────────────────────┐  │
  │                           │  Secrets (Secrets Manager-compatible): DB creds, Redis AUTH,      │  │
  │                           │  JWT private key, DSN, third-party keys. Never in images or git.│  │
  │                           └────────────────────────────────────────────────────────────────┘  │
  └─────────────────────────────────────────────────────────────────────────────────────────────┘
                                                                                                │
  ══════════════════════════════════════════════════════════════════════════════════════════════
```

**Note the shape of the data path.** One directional arrow set: edge → tasks → datastores, plus
tasks ↔ Redis for events, plus tasks → object storage. There is no arrow between application tasks.
That is not a simplification for its own sake — it is the direct consequence of the zero-synchronous-
calls decision, and it removes an entire category of network and security design work.

### 1.3 Infrastructure architecture

The layers Terraform manages, bottom to top:

| Layer | Managed resources | Provisioned by |
|---|---|---|
| **L6 Observability** | Log groups, metric collection, alarm definitions, dead-letter queue, trace storage | `modules/observability` |
| **L5 Delivery** | Registry, artifact bucket, GitHub OIDC role trust, runner registration | `modules/delivery` |
| **L4 Compute** | Task definitions, services, scaling policies, migration tasks | `modules/compute` |
| **L3 Data** | PostgreSQL instance + 5 databases + 5 roles, PgBouncer, Redis, object storage | `modules/database`, `modules/database-proxy`, `modules/redis`, `modules/storage` |
| **L2 Platform** | VPC, subnets, route tables, security groups, edge listener/rules, ACM certificate | `modules/network`, `modules/edge` |
| **L1 Identity** | Roles, policies, service-specific least-privilege, OIDC trust | `modules/iam`, `modules/secrets` |
| **L0 Environment** | Environment settings, state backend, common tags, feature flags | `environments/{floci,staging,production}` |

**Terraform owns L0–L6. It does not own application releases.** A service is running because a
pipeline registered a task definition and updated a service — not because someone ran
`terraform apply`. This boundary is deliberate (§3.4) and is what allows the same infrastructure
definition to outlive any particular application version.

### 1.4 Testing architecture

| Layer | Environment | Created by | Isolated? | Duration |
|---|---|---|---|---|
| Unit | In-process, no I/O | CI runner | Per job | Seconds |
| Service integration | Ephemeral Compose stack (Postgres + Redis), per job | CI runner | **Yes, per job** | ~2 min |
| Contract | Fixture-based, in-process | CI runner | Per job | Seconds |
| System integration | Full stack on a **Floci environment** (Terraform-provisioned) | `terraform apply` in CI | Per environment, reconciled | ~5 min |
| Playwright E2E | Same full stack, through the **edge only** | Pipeline stage | Per environment | ~8 min |
| Smoke | Same full stack, 3 assertions | Pipeline post-deploy gate | Per environment | Seconds |
| Chaos / nightly | Full stack + fault injection | Scheduled workflow | Dedicated environment | ~20 min |

The E2E and smoke layers run against **the same deployed environment**, reached through the load
balancer, never by mocking a backend. That is the only arrangement in which an E2E result means
anything about the deployed system (§13.2).

### 1.5 Deployment architecture

```
  commit → PR
      │
      ├─ Tier 1: FAST CI (GitHub-hosted runner, ephemeral Compose stack)   §12.1
      │     fmt · lint · vet · unit · integration · contract · tf fmt/validate/lint/scan
      │     build images (validate) · Playwright build check
      │
      └─ on merge to main
            │
            ├─ Tier 2: BUILD  (§12.2)                                   ── once
            │     build image by commit SHA → SBOM → vuln scan → provenance
            │     push to registry → RECORD DIGEST  ← the artifact of record
            │
            ├─ Tier 3: DEPLOY (self-hosted runner + Floci)             §12.3
            │     terraform plan/apply (infra)  →  migration task  →  service update
            │     →  readiness gate  →  smoke  →  system integration  →  Playwright E2E
            │
            ├─ Tier 4: PROMOTE (§12.4)   floci → staging → production
            │     same digests; no rebuild; approval gates; concurrency=1
            │
            └─ on gate failure: automatic rollback to previous digest  §12.7
```

**The single invariant that makes this reproducible: an image is built exactly once, identified by
digest, and promoted by reference.** Nothing rebuilds per environment (§6.9).

---

## 2. Floci Architecture

### 2.1 Division of responsibility

| | **Floci** | **Terraform** |
|---|---|---|
| Provides | An AWS-compatible control plane: API endpoints, resource lifecycle, IAM evaluation, state storage, identity | Declarative intent: what should exist, with what configuration |
| Owns | The actual resources — instances, networks, databases, registries | The *definition* of those resources |
| Decides | How to schedule, place, replicate | How many, how sized, how wired, how secured, how tagged |
| Does **not** own | Terraform code, application code, image contents | The application, the data, business logic |
| Drift | Detects and reports; Terraform reconciles | Detects via `plan`, resolves via `apply` |

**The boundary test:** if deleting the Terraform code and re-running it from a clean state reproduces
the environment, the boundary is correct. Anything that cannot be reconstructed by Terraform is
**out of band and a defect** — no manually created resources, no console clicks, no hand-edited
security groups.

### 2.2 Required AWS-compatible services

Ordered by how hard they are to substitute.

| Service | Used for | Required? | If unavailable |
|---|---|---|---|
| **ECR** | Image registry, digest addressing, lifecycle policies | **Required** | Substitute a private registry. §6.4 defines digest pinning, which is portable |
| **ECS (task + service)** | Task definitions, services, health-gated rolling deploy, service identity | **Required** | See §5.7 — the fallback is ECS-on-EC2 or a Compose-equivalent, isolated behind `modules/compute` |
| **RDS (PostgreSQL 16)** | One instance, 5 logical databases | **Required** | Self-managed Postgres in the data subnet. Degraded: no automated backups or PITR (§7.7) |
| **ElastiCache (Redis 7)** | Streams, AOF, consumer groups | **Required** | Self-managed Redis container. Retains AOF + `noeviction` because those are config, not features |
| **VPC** | Subnets, route tables, security groups | **Required** | Hard to substitute. See §4.1 for the reduced-topology fallback |
| **IAM** | Roles, policies, OIDC trust | **Required** | Static credentials per environment — a documented parity gap (§20.3) |
| **Secrets Manager** | DB creds, Redis AUTH, JWT key, DSN | **Required** | Encrypted-at-rest file per environment, mounted read-only. **Never** environment variables in the image |
| **S3** | SPA bundle, `/static/`, `/media/`, SBOMs, backups, test artifacts | **Required** | Local filesystem. C3 becomes unresolvable — see §4.7 |
| **CloudWatch Logs** | Log aggregation, log-based metrics | **Required** | Local file sink + a scraper. §11.7 |
| **Elastic Load Balancing** | TLS termination, path routing, health gating | **Required** | Nginx/HAProxy container. §10.8 |
| **ACM** | TLS certificates | **Recommended** | Self-signed + host-trusted CA. Documented gap in §10.1 |
| **EC2** | Only if ECS-on-EC2 is the compute model | **Conditional** | — |
| **Lambda** | Not used | No | See §22 |
| **CloudFront** | SPA/CDN | **Optional** | Edge serves the SPA directly from S3. Deployable-first is preferred (§10.3) |

**Nine required services.** For a four-service application, that is close to the floor, and each one
maps to a real requirement established in the review.

### 2.3 Intentionally not used

| Not used | Reason |
|---|---|
| API Gateway | §22 (API Gateway row) |
| VPC endpoints / PrivateLink | Nothing routes on a fixed interface. Only 3 datastores, reached by private IP |
| NAT Gateway | §4.8. Egress is almost entirely to managed services over the provider network |
| AWS Organizations / Control Tower | Single-account, single-region by design |
| Route 53 | Floci DNS or the edge's own routing. Reintroduce for real DNS (§10.1) |
| SQS / SNS | Redis Streams is the event backbone by decision (§8 of the review) |
| Step Functions | No multi-step orchestration. The pipeline is a linear job graph |
| EKS / Kubernetes | §22 (Kubernetes row) |
| AWS Config / GuardDuty | Real-AWS production hardening, deferred to §25.6 with a named trigger |

### 2.4 Bootstrap

```
git clone <repo>
  ↓
make bootstrap                      # §18.2
  ├─ verify prerequisites           # docker, floci CLI, terraform ≥1.6, jq, make
  ├─ pull Floci container images    # one-time, ~2 GB
  ├─ start Floci daemon             # local, single instance
  ├─ initialise the registry        # ECR-compatible, empty
  └─ write .env.local from .env.example with generated local-only values
  ↓
make infra-up                       # terraform init + apply, environment = floci
  ↓
working environment
```

| Requirement | How it is met |
|---|---|
| No manual resource creation | Every resource is in a module. `bootstrap` only starts the cloud |
| Deterministic | Terraform is declarative. Same inputs → same resources |
| Idempotent | `bootstrap` is safe to re-run; `apply` is a no-op when converged |
| Fast | Cold start dominated by image pulls, not by resource creation |
| Offline-capable after first run | Images cached locally; Terraform providers cached in `.terraform/` |

### 2.5 State handling

| Concern | Design |
|---|---|
| Backend type | **Local state file for Floci.** A remote backend adds a credential dependency to the very first command a developer runs, and a local cloud has no compelling reason for a remote state service |
| Location | `infra/terraform/environments/floci/terraform.tfstate` — **gitignored**, per §3.5 |
| Encryption | Not required at rest for a local environment that contains no real secrets — **but state still contains secret ARNs and outputs**, so it is `chmod 600` and gitignored |
| Locking | Local backend locks via `.terraform.tfstate.lock.info` on the filesystem. Adequate for a single-developer local cloud |
| Production backend | **S3 + DynamoDB lock table, server-side encryption, versioned, bucket policy denying non-TLS** (§3.5). Never a committed `.tfstate`, ever |
| State hygiene | Secrets Manager values are referenced by ARN, **never written as values** into outputs (§3.7). A `sensitive = true` output still lands in state in plaintext, so the design avoids creating such outputs |
| `plan` file | Written to a gitignored path, never committed. A committed plan leaks secret values |

**Why not Terraform Cloud:** the mandate says it is not required, and for a 4-service application it
would add a vendor dependency, a network dependency, and a per-seat cost for features (remote
execution, policy sets, cost estimation) that this project does not use. Production state belongs in
S3 where it is auditable with the rest of the account. Revisit if the team grows past a handful of
contributors to the same environment.

### 2.6 Environment isolation

| Isolation dimension | Floci / dev | Staging | Production |
|---|---|---|---|
| Network | Own VPC, own subnet CIDR | Own VPC, own CIDR | Own VPC, own CIDR |
| Registry | Registry path prefix `dev/` | `staging/` | `prod/` |
| Databases | Own instance, own databases | Own | Own |
| Secrets | Own secret namespace | Own | Own |
| IAM roles | Own role set, own trust | Own | Own |
| State | Own state file | Own S3 key + lock row | Own |
| Concurrency | Unrestricted | 1 deployment | 1 deployment, approval-gated |

**Registry path prefixes, not separate registries**, within one environment. Separating them means
managing registries and IAM policies for each; path prefixes give the same isolation for promotion
flows because the promotion pipeline, not a human, controls which prefix an environment reads.

**CI environments are namespaced within the Fast-tier Compose stack** (§19.1): unique database name,
unique ports, unique Compose project name — so parallel jobs cannot collide.

### 2.7 Floci capability matrix — verify before committing

The honest engineering position: this design targets the AWS API contract. Whether Floci implements
each service to that contract **must be verified against the installed version**. This table is the
verification checklist and the fallback plan.

| # | Dependency | Verify | If missing or partial | Impact |
|---|---|---|---|---|
| 1 | ECR-compatible registry | Push by tag, retrieve manifest **by digest** | Use a private registry; keep digest pinning | Low — §6.4 is portable |
| 2 | ECS **Fargate** task launch | Launch a task with a task role, health check, and env/secret injection | ECS-on-EC2: Terraform launches container hosts; ECS registers tasks on them | Medium — one module, one variable (§5.7) |
| 3 | ECS **services + rolling update + target health** | Can a service gate rollout on a container health check? | Deploy with an explicit pipeline-driven health gate that reverts on failure (§15.2) | Medium — loses automatic self-healing; gains explicit control |
| 4 | RDS Postgres 16 | Multi-database, per-role grants, `pg_dump`, PITR | Self-managed container + host-level backup script | **High** — no PITR. Requires §7.7 external backups |
| 5 | ElastiCache Redis 7 | `appendonly`, `maxmemory-policy noeviction`, `XAUTOCLAIM` | Self-managed Redis container — **all four are config flags, so all four survive** | Low |
| 6 | VPC with ≥2 AZs | Subnet per AZ, security group referencing | Single-AZ. Security groups and route tables still work | Low in local; **production must be multi-AZ** (§7.4) |
| 7 | IAM role assumption | Can a task assume a role and receive credentials? | Inject scoped credentials from the secret store at task start | Medium — loses automatic rotation; §9.4 mitigation |
| 8 | Secrets Manager | Create/read secret, version, rotation | Encrypted file store, mounted read-only | Low |
| 9 | S3 | Versioning, lifecycle, server-side encryption | Local filesystem; SPA served by a static task | Low; C3 unresolvable |
| 10 | ELB listener + target group | Path-based rules, HTTPS, health check per target group | Nginx/HAProxy container with the same routing rules | Low — §10.2 routing is portable |
| 11 | CloudWatch Logs | PutLogEvents, EMF metric extraction | Local log sink; `docker logs` + a collector | Low |
| 12 | GitHub OIDC token exchange | `GetWebIdentityToken` from a GitHub-issued JWT | **Floci CI uses short-lived runner-minted credentials** (§19.3). Production on AWS uses OIDC (§12.6) | Medium — the C5 gap |

**Items 4 and 7 are the two that matter.** Item 4 is the only one where a missing feature causes
genuine data risk, because it removes point-in-time recovery. §7.7 specifies a non-negotiable
external backup path that works with or without RDS-managed PITR. Item 7 affects credential
rotation cadence, which §9.4 makes explicit.

### 2.8 Communication inside Floci

| From | To | Mechanism | Encrypted |
|---|---|---|---|
| Terraform → Floci | AWS API over HTTPS | Provider endpoints | Yes |
| Edge → services | Private IP within VPC | HTTP | **No** — see below |
| Services → PostgreSQL | Private IP, via PgBouncer | PostgreSQL wire | No in dev; **TLS required in production** (§7.8) |
| Services → Redis | Private IP | RESP | No in dev; **TLS in production** (§8.6) |
| Services ↔ Redis Streams | Async, one stream | Redis protocol | Inherits above |
| Services → S3 | Private endpoint or signed URL | HTTPS | Yes |
| Developer → edge | HTTPS | TLS | Yes |
| CI runner → Floci | HTTPS, short-lived credential | AWS API + registry | Yes |

**Why service-to-edge traffic is plain HTTP inside the VPC.** TLS termination happens at the load
balancer. The traffic between the load balancer and a task in the same VPC never leaves the host
network, so it is not exposed on any network path an attacker can reach. Encrypting it would add
certificate distribution and rotation to every task for no threat-model benefit — the classic case of
transport security applied past the trust boundary. **Postgres and Redis connections are different**:
they are the components most likely to be reached by a broader blast radius, and they carry
credentials and personal data, so they are TLS-encrypted in production (§7.8, §8.6).

### 2.9 Persistence and recovery inside Floci

| Resource | Persistence mechanism | Survives | Lost on | Recovery |
|---|---|---|---|---|
| PostgreSQL data volume | Named volume | Container restart, `docker compose` recreate | Volume deletion | Automated backup + restore (§7.7) |
| Redis AOF | Append-only file in named volume | Redis restart | Volume deletion | **Outbox replay** — events re-derived from Postgres (§8.7). Redis holds no unique data |
| Container images | Local registry | Everything | Registry prune | Rebuild from source; digests pinned in Terraform state |
| SPA bundle | Object storage | Everything | Bucket deletion | Rebuild from source |
| Terraform state | State file | Everything | File deletion | **Backup the state file. Without state, Terraform cannot reconcile existing resources** (§25.4) |
| Secrets | Secret store | Everything | Store deletion | Re-apply from a documented source; see §9.7 |

**Redis deserves specific attention** because it participates in the event backbone. It is the only
datastore here whose loss is *tolerable by design* — the outbox is the source of truth, so a wiped
Redis costs redelivery, not data. That property is what makes Redis an acceptable
single-node-without-replication choice, and it is why no Redis HA is designed (§8.9).

**Terraform state is the one genuinely irreplaceable artifact.** Losing it does not lose
application data, but it does lose the ability to manage the infrastructure — Terraform would try to
create resources that already exist and fail, or worse, orphan resources it can no longer see. It is
backed up (§25.4) and its loss is a named incident (§17.15).

### 2.10 Destroy and recreate

```
make infra-destroy        # terraform destroy, then Floci volume prune
make infra-reset          # destroy + prune volumes + registry + state → truly clean
```

| Command | Removes | Keeps | Use when |
|---|---|---|---|
| `infra-destroy` | All Terraform-managed resources | Volumes, state file, registry | Recreating infra, not data |
| `infra-destroy-full` | Resources + data volumes | State file | Resetting data |
| `infra-reset` | Everything including state and registry images | Nothing | Verifying clean-clone reproducibility (§18.9) |

**`infra-reset` is the reproducibility test.** If a clean clone plus `make bootstrap && make infra-reset
&& make infra-up` does not produce a working environment, then the environment is not reproducible
from a clean clone, which is the mandate's primary objective. That command is the acceptance test for
the whole platform design (§26).

---
## 3. Terraform Architecture

### 3.1 Structure

```
infra/
  terraform/
    modules/
      network/            VPC, subnets, route tables, security groups, egress rules
      edge/               Load balancer, listeners, target groups, path rules, ACM/CA
      compute/            Task definitions, services, autoscaling, migration jobs
      database/           PostgreSQL instance, 5 logical databases, 5 roles, backups
      database-proxy/     PgBouncer instance + instance-role grants
      redis/              Redis instance, parameter group, security group
      storage/            S3 buckets + lifecycle + CORS for the SPA
      registry/           ECR repositories + lifecycle policies
      iam/                Roles, policies, per-service least privilege, OIDC trust
      secrets/            Secret creation, versioning, rotation wiring
      observability/      Log groups, metric filters, alarms, dashboards
      delivery/           Artifact bucket, runner role, deployment role

    environments/
      floci/              root module; .tfvars for the local AWS-compatible cloud
      staging/            root module; future-facing
      production/         root module; S3 backend, approval-gated

    shared/               provider versions, common tags, naming helpers

Makefile                  targets: bootstrap, infra-up, infra-plan, infra-destroy, ...
```

**Modules are capability-scoped, not resource-scoped.** `database/` knows how to build a PostgreSQL
instance with logical databases and roles; it does not know that `commerce` exists. That separation
is what allows the same module to serve all five logical databases by being called five times with
different inputs (§7.3).

### 3.2 Module boundary rules

| Rule | Reason |
|---|---|
| A module has no hardcoded environment names | `production` must not be inferable from a module. Environment comes from variables |
| A module never reads another module's internals | Modules compose through their declared outputs |
| A module has no `provider` block | Providers are declared only in root modules. A module provider block forces explicit provider aliasing and is a common source of confusing errors |
| A module exposes outputs for everything a parent needs | Including data-store endpoints, ARNs, and IDs |
| Sensitive values are inputs, never module constants | A secret created inside a module is invisible to the environment's rotation policy |
| No module reads the data plane | Terraform provisions infrastructure. It does not create application tables, seed data, or run migrations (§3.4) |

### 3.3 Environment root module

Each `environments/*` root module:

1. Declares the required providers (with pinned versions via `required_version` and provider version constraints)
2. Calls the capability modules it needs, passing environment-derived values
3. Holds **no resource definitions of its own**
4. Emits a single `environment_output` map consumed by the deploy pipeline

| Environment | Terraform drives | Deployment target |
|---|---|---|
| `floci` | Everything | Local Floci |
| `staging` | Everything | Future Floci-hosted staging or a real AWS staging account |
| `production` | Everything | Real AWS. Not provisioned by this exercise |

**Staging and production are future-facing by design.** They are defined as root modules with real
inputs (region, CIDRs, instance classes, domain names) so that the migration to AWS is a matter of
supplying values, not writing new configuration (§21.2).

### 3.4 The IaC / application-release boundary

The single most important structural decision in this section.

> **Terraform provisions and configures infrastructure. It does not deploy application releases.**

| Terraform owns | The deploy pipeline owns |
|---|---|
| VPC, subnets, security groups | The image digest a service runs |
| Load balancer, listeners, target groups, routing | Task definition contents beyond shape |
| PostgreSQL instance, logical databases, **roles** | Which schema version each database is at |
| Redis instance and its parameter group | Which task revisions are live |
| Object storage buckets and lifecycle | Seed data, fixtures, admin bootstrap |
| Registry and lifecycle policies | |
| IAM roles, policies, OIDC trust | |
| Log groups, alarms, dashboards | |
| **Database schemas** (via the migration job's declared ownership, §16.2) | **Migration execution** |

**Why migrations are not Terraform.** Three reasons, each sufficient:

1. **Terraform state would hold application schema.** Every `terraform plan` on every subsequent
   change would diff database structure. Diffs become unreviewable and state grows without bound.
2. **Expand/contract requires interleaving with application rollout.** A migration that adds a
   nullable column must deploy, then the application must deploy, then a later release must drop the
   column. Terraform has no representation for "deploy, wait, verify, deploy again" within a single
   apply, and forcing it produces the *worst* possible pattern — a migration coupled to a deploy,
   unable to be rolled back independently.
3. **Rollback asymmetry.** `terraform apply` can be reverted. A destructive migration cannot. Keeping
   them in one transaction would falsely imply they share a rollback model.

**What Terraform does own for data:** the *existence* of the five logical databases and their roles
(§7.3), so that a database cannot be created ad hoc without the corresponding grants. **It owns the
empty database. It does not own the schema.**

### 3.5 State isolation

| Concern | Floci / dev | Staging | Production |
|---|---|---|---|
| Backend | Local file | S3 + DynamoDB lock | S3 + DynamoDB lock |
| Key | `environments/floci/terraform.tfstate` | `env/staging/terraform.tfstate` | `env/production/terraform.tfstate` |
| Locking | Filesystem | DynamoDB table | DynamoDB table |
| Encryption at rest | Filesystem `chmod 600` | SSE-S3 + bucket policy | SSE-KMS + bucket policy |
| Versioning | Disabled (disposable) | Enabled | Enabled |
| In git | **No — gitignored** | No | No |
| Access control | Filesystem | IAM, CI role only | IAM, break-glass role only |

**State isolation per environment is mandatory** because a single state file shared by two
environments would let `apply` for staging destroy production resources. Separate backends make that
class of mistake structurally impossible rather than procedurally prevented.

**Never commit `*.tfstate`, `*.tfstate.*`, or `*.tfplan`.** Enforced by `.gitignore` and by a CI
secret-scan rule (§23.7).

### 3.6 Variables and naming

| Variable class | Examples | Notes |
|---|---|---|
| Environment identity | `environment`, `region`, `domain_name` | Required in every environment |
| Network | `vpc_cidr`, `public_subnet_cidrs`, `private_subnet_cidrs` | Different per environment; **never overlapping**, so environments can be peered later |
| Compute | `catalog_desired_count`, `catalog_cpu`, `catalog_memory` | Per service, per environment (§5.6) |
| Data | `postgres_instance_class`, `redis_node_type`, `db_max_connections` | Production values larger than dev |
| Feature flags | `enable_waf`, `enable_multi_az`, `enable_pitr` | Lets one module definition serve dev and prod |
| Secrets | `jwt_private_key_secret_name`, `db_password_secret_name` | **Names/ARNs only — never values** |

**Naming convention** — one scheme, applied everywhere:

```
<env>-<region>-<service>-<resource>-<qualifier>
sneakin-prod-eu-west-1-commerce-sg-01
sneakin-prod-eu-west-1-postgres-primary
sneakin-floci-local-catalog-task-role
```

| Property | Value | Reason |
|---|---|---|
| Lowercase, hyphen-separated | Yes | Readable in log lines, dashboards, and shell |
| Environment prefix | Always | Makes an accidental cross-environment reference visible at a glance |
| Region in name | Yes | Cross-region operations and resource import are unambiguous |
| Random suffixes | **Avoided**; Terraform `name_prefix`/explicit indices instead | Deterministic names mean a diff shows a rename, not a churn storm |
| Everything tagged | Yes (§3.8) | Cost attribution and ownership are not derivable from a name |

### 3.7 Outputs and secret handling

| Output | Sensitive | Consumers |
|---|---|---|
| `edge_dns_name`, `edge_https_url` | No | Deploy pipeline, Playwright target |
| `service_endpoint_<name>` | No | Debugging, pipeline smoke tests |
| `registry_url` | No | `docker push` |
| `db_host`, `db_port`, `db_names` | No | Migration job, test harness |
| `db_role_names` | No | Migration job grants |
| `redis_endpoint`, `redis_stream_db` | No | Worker config, chaos tests |
| `spa_bucket`, `media_bucket` | No | SPA deployment, Django settings |
| `log_group_names` | No | Log-based alarm wiring |
| `oidc_provider_arn` | No | GitHub OIDC trust setup |
| `*_secret_arn` | No — **ARN only** | Runtime secret injection |

**Rule: Terraform never outputs a secret *value*.** It outputs the *ARN* of the secret, and the
runtime retrieves the value. This means:

- No secret value ever enters `terraform plan` output
- No secret value ever enters CI logs
- Terraform state contains ARNs and non-secret configuration — acceptable, and still gitignored

`sensitive = true` is **not** a substitute: sensitive values still land in the state file in
plaintext. The architecture avoids the problem rather than hiding it.

### 3.8 Tagging and metadata

Every taggable resource receives:

| Tag | Value | Purpose |
|---|---|---|
| `Project` | `sneakin` | Ownership |
| `Environment` | `floci` / `staging` / `production` | Blast-radius containment |
| `Service` | `identity` / `catalog` / `commerce` / `workers` / `edge` | Cost attribution by service |
| `ManagedBy` | `terraform` | Detects resources created outside Terraform (§25.4) |
| `Component` | module name | Blast-radius and ownership queries |
| `CostCenter` | inherited from environment variable | Cost allocation |
| `Criticality` | `tier-1` / `tier-2` | Prioritises alerting and recovery (§25.2) |

`Environment` and `Service` tags are **enforced in CI**, not merely applied — a PR that adds a
resource without the required tags fails validation (§12.1). This is the difference between tagging
as documentation and tagging as a control.

### 3.9 Provider configuration

| Provider | Version handling | Notes |
|---|---|---|
| `aws` | `required_version` on Terraform plus a provider version constraint | No floating providers. A provider upgrade is a reviewed PR, not a surprise |
| Provider aliases | Declared only in root modules | Per §3.2 |
| Endpoints | **Variable-driven** | The AWS provider supports endpoint overrides per service, which is how the same code targets Floci or real AWS by changing one variable per service rather than a different provider |
| Credentials | Environment, never a provider block | Standard credential chain; OIDC in CI (§9.6) |
| Retry/timeout | Explicit | Default provider timeouts are tuned for real AWS and can be wrong for a local API; set per-service |

The **endpoint-variable pattern** is what makes local/production parity real rather than aspirational:
each service has an endpoint input that defaults to empty (meaning "use the real AWS endpoint") and is
set to the Floci endpoint only in `environments/floci`. No conditional logic, no second provider
configuration, no code path that only runs locally.

### 3.10 Dependency management

| Mechanism | Use |
|---|---|
| Module inputs/outputs | Inter-module ordering |
| `depends_on` | Only where an implicit dependency is not expressible via references. Overuse is a smell |
| Explicit references over `depends_on` | Preferred — Terraform's graph then reflects real data flow |
| Remote module sources | Versioned and referenced by release tag once there is more than one consumer |
| Provider lock file | Committed. Provider version changes become reviewed diffs |

**The ordering Terraform must express, and does:**

```
network → (security groups) → database (+ roles) → database-proxy → redis
       → storage → registry → edge (needs SG + cert)
       → observability → compute (needs SG, secrets ARNs, db/redis endpoints)
       → iam (needs nothing; everything needs iam)
```

Note that `compute` depends on almost everything, which is correct — a task definition cannot be
registered without its network, secrets, and datastore endpoints.

### 3.11 Provider plugin cache

Set `TF_PLUGIN_CACHE_DIR` in `.env.local` (created by bootstrap). First `init` downloads plugins;
subsequent ones symlink from cache. On a local cloud where everything runs repeatedly, this removes
the slowest step in the Terraform loop.

---

## 4. Networking

### 4.1 Topology

```
  Internet
     │
     │ 443
     ▼
 ┌───────────────────────────────────────────────────────────────────────────┐
 │ PUBLIC SUBNET A (10.0.0.0/24)          PUBLIC SUBNET B (10.0.1.0/24)     │
 │                                                                            │
 │   ┌──────────────────────────────────────────────────┐                    │
 │   │ Edge load balancer — TLS :443                    │                    │
 │   │  • path rules (§10.2)                             │                    │
 │   │  • health-gated target groups                    │                    │
 │   │  • strip spoofable headers, add X-Request-ID      │                    │
 │   │  • rate limits, HSTS, CSP (§10.4–10.7)            │                    │
 │   └──────────────────────────────────────────────────┘                    │
 └───────────────────────────────────────────────────────────────────────────┘
        │                        │                        │
        │ /api/v1/products/*      │ /api/v1/{cart,orders,  │ /api/v1/auth/*
        ▼                        │ wishlist}*              ▼
 ┌───────────────────────────────────────────────────────────────────────────┐
 │ PRIVATE SUBNET A (10.0.10.0/24)         PRIVATE SUBNET B (10.0.11.0/24)    │
 │                                                                            │
 │   catalog tasks          commerce tasks          identity tasks             │
 │   (port 8080)            (port 8080)             (port 8000)                 │
 │   10.0.10.10–.19         10.0.10.30–.59         10.0.10.70–.89              │
 │                                                                            │
 │   workers task (port 0 — no inbound listener)                               │
 │   10.0.10.100                                                        │
 └───────────────────────────────────────────────────────────────────────────┘
        │                    │                    │              │
        │ all via PgBouncer  │                    │              │
        ▼                    ▼                    ▼              ▼
 ┌───────────────────────────────────────────────────────────────────────────┐
 │ DATA SUBNET A (10.0.20.0/24)           DATA SUBNET B (10.0.21.0/24)       │
 │                                                                            │
 │   PgBouncer :6432        Redis :6379        S3 endpoint (via service)     │
 │   10.0.20.10             10.0.20.20                                          │
 │        │                                                                    │
 │        ▼                                                                    │
 │   PostgreSQL :5432 (no SG ingress from anywhere but PgBouncer)             │
 │   10.0.20.30                                                                 │
 └───────────────────────────────────────────────────────────────────────────┘
```

**One-way flow only:** Internet → edge → tasks → data. No return path into a public subnet, no
lateral path between tiers, and **no path between application tasks at all** (§1.1).

### 4.2 Subnet design

| Subnet tier | Count | CIDRs | Contains | Internet-routable |
|---|---|---|---|---|
| Public | 2 (one per AZ) | `10.0.0.0/24`, `10.0.1.0/24` | Edge LB only | Yes |
| Private (application) | 2 | `10.0.10.0/24`, `10.0.11.0/24` | All four service task sets | No |
| Private (data) | 2 | `10.0.20.0/24`, `10.0.21.0/24` | Postgres, PgBouncer, Redis | No |

**Why two subnets per tier rather than one.** Two AZs is the minimum for a real AWS deployment to
survive an AZ failure, and subnet-per-AZ is what makes that possible without re-architecting.
In Floci, if only one AZ exists, the second subnet is still created and still has working rules —
so the topology is identical in local and production, which is the point of parity (§20).

**Why a separate data tier.** It is the boundary that makes "PostgreSQL is never public" a structural
property rather than a rule. Data subnets have no route to the internet at all (§4.8), so even a
misconfigured security group cannot produce an internet-exposed database.

### 4.3 Security groups

Every security group is **deny-by-default**; only explicit ingress rules exist. There is no outbound
restriction (§4.8 justifies this).

| Security group | Ingress from | Port | Rationale |
|---|---|---|---|
| `edge-sg` | `0.0.0.0/0` | 443 | The only internet-facing component |
| `catalog-sg` | `edge-sg` | 8080 | Only the edge may reach catalog |
| `commerce-sg` | `edge-sg` | 8080 | Only the edge may reach commerce |
| `identity-sg` | `edge-sg` | 8000 | Only the edge may reach identity |
| `workers-sg` | **none** | — | Workers have no inbound listener at all |
| `pgbouncer-sg` | `catalog-sg`, `commerce-sg`, `identity-sg`, `workers-sg` | 6432 | Explicit per-service allowlist |
| `postgres-sg` | `pgbouncer-sg` + `migration-sg` | 5432 | Applications reach the database **only through the pooler**; the migration group is the one scoped exception (§16.3) |
| `redis-sg` | `catalog-sg`, `commerce-sg`, `identity-sg`, `workers-sg` | 6379 | Events + transitional Celery |
| `migration-sg` | `edge-sg` (inbound for task start) | 5432 to `postgres-sg` | One-off migration tasks (§16.2, §16.3) |

**Three properties worth stating explicitly:**

1. **`postgres-sg` accepts from `pgbouncer-sg` plus one scoped migration exception.** An operator
   debugging a connection problem cannot reach the database directly — they go through the pooler. The
   migration group is allowed through because DDL under a transaction pooler is unreliable (§16.3), and
   the exception is enumerated here so a reviewer sees it rather than inferring it.
2. **`workers-sg` has no ingress rules.** It has no listener to protect. Modelling it with an empty
   rule set makes the absence of an attack surface explicit and reviewable.
3. **Rules reference security groups, not CIDRs.** `edge-sg` → `catalog-sg`, never
   `10.0.10.0/24` → `catalog-sg`. Group references survive IP reassignment, and a rule that can only
   be satisfied by another managed security group cannot be opened by a routing change.

### 4.4 Service-to-service network access

There is none, because there are no synchronous service-to-service calls. The consequences:

| Question | Answer |
|---|---|
| Does catalog need to reach commerce? | No. Availability arrives by event (§5.4 of the review) |
| Does commerce need to reach catalog? | No. Cart snapshots carry price |
| Does commerce need to reach identity? | No. `user_id` comes from the JWT |
| Does anything need to reach workers? | No. Workers are consumers; they initiate outward |
| Is there an internal load balancer? | **No.** There is nothing to load-balance between |

**This is the single largest simplification the application architecture buys the network design.**
A four-service system with synchronous calls would need east-west security groups, an internal
discovery mechanism, per-call mTLS or token exchange, and network policies for every pair. All of
that work is unnecessary here, and §22's Kubernetes, Service mesh, and gRPC rows explain why those
options are dismissed rather than merely unused.

### 4.5 Database isolation

| Layer | Mechanism |
|---|---|
| Network | `postgres-sg` ← `pgbouncer-sg` **and** the migration task's group (§16.3). No route to internet from the data subnet |
| Proxy | All **application** connections via PgBouncer transaction mode (§7.5). Migrations connect directly |
| Authentication | Per-database role with a distinct password; the `commerce` role has **no grant** on the `catalog` database |
| Schema | Per-role `search_path` so a role cannot address another service's schema by qualifying it |
| Connection | TLS required in production (§7.8) |

The role model is the control that actually enforces "no cross-service database access." Network
rules prevent a *network* path; grants prevent an *authorization* path. Both are needed: a service
that legitimately holds a connection could otherwise `SELECT` from a table it does not own, and no
amount of network policy prevents that.

The migration group's direct access to `postgres-sg` is the single documented exception to this table
(§16.3). It is scoped to the migration role and called out there rather than left implicit.

### 4.6 Redis isolation

| Property | Value | Reason |
|---|---|---|
| Network | `redis-sg` ← the four service groups only | Not reachable from the edge |
| Authentication | `requirepass` + a service-specific credential per logical consumer | A compromised service cannot read another consumer's pending events |
| Logical databases | `0` = app cache, `1` = Celery broker *(transitional)*, `2` = Celery results *(transitional)*, `3` = **domain events** | Separating streams from Celery means decommissioning Celery cannot affect event delivery |
| Public access | **None, ever** | Contains authentication material and in-flight events |

### 4.7 Object storage exposure

| Bucket | Public? | Access |
|---|---|---|
| `sneakin-{env}-spa` | No | Read by the edge/static origin. CloudFront-style signed access in production |
| `sneakin-{env}-static` | No | Django admin CSS/JS, read via the edge |
| `sneakin-{env}-media` | **Read-only public via the edge** | Product images are public content. Upload is credentialed |
| `sneakin-{env}-artifacts` | No | SBOMs, scan reports, test artifacts. CI only |
| `sneakin-{env}-backups` | No | `terraform state` and database dumps. Never web-accessible |

**Why object storage exists here** is C3: `/static/` and `/media/` are currently served from a volume
shared with the app container, which a task-based runtime cannot provide. This is the concrete reason,
and it is the only reason. Object storage is not introduced for scale.

### 4.8 Routing and egress

| Route | Destination | Notes |
|---|---|---|
| Public subnet → internet | Edge only | For certificate validation and health checks |
| Private subnet → data subnet | Local route | The only inter-tier traffic |
| Data subnet → internet | **No route** | Databases and Redis have no outbound internet path |
| Private subnet → internet | **Filtered egress** | Needed for managed-service endpoints (S3, secrets, logs, JWKS). Restricted to those endpoints by security group, not open |
| Private subnet → public subnet | No route | Cannot use the edge as a proxy |

**No NAT gateway.** Conventional AWS designs put a NAT gateway in the public subnet so private
subnets can reach the internet. The cost is hourly charges plus data processing, and the
architectural downside is that **every private task gets unrestricted outbound internet access** —
a meaningful exfiltration path if a task is compromised.

Instead, egress from the private subnet is allowed **only to the managed-service endpoints the system
actually uses**: object storage, secret store, log service, and the JWKS host. This is narrower, free,
and produces a much better answer to "what could a compromised task reach?" §4.8's constraint is why
NAT appears in §22's unused list.

### 4.9 DNS

| Record | Points to | Purpose |
|---|---|---|
| `sneakin.example.com` | Edge LB | SPA + API |
| `api.sneakin.example.com` | Edge LB | Optional API-only hostname |
| `admin.sneakin.example.com` | Edge LB | Optional admin separation |
| Internal service names | Task private IPs | Within a single environment only; no cross-environment DNS |

In Floci, DNS is provided by the local cloud's resolver or by the load balancer's host rules. For real
AWS, Route 53 with an alias record to the LB (§10.1). **The `sneakin.duckdns.org` endpoint currently
in `cd.yml` is not a production DNS design** and is replaced (§10.1).

### 4.10 TLS summary

| Hop | Local / Floci | Staging | Production |
|---|---|---|---|
| Client → edge | Self-signed, host-trusted | ACM | ACM + HSTS preload |
| Edge → task | Plain HTTP (same VPC) | Plain HTTP | Plain HTTP — §2.8 |
| Task → PostgreSQL | Plain | TLS | **TLS required** |
| Task → Redis | Plain | TLS | **TLS required** |
| Task → object storage | N/A | HTTPS | HTTPS |
| CI → cloud API | HTTPS | HTTPS | HTTPS + OIDC |

The asymmetry is intentional and is the whole point of the table: **encryption is applied at trust
boundaries, not uniformly.** Encrypting everything would add certificate distribution to every task
for no threat reduction; leaving the datastores unencrypted in production would expose credentials
and personal data on a wider blast radius.

---

## 5. Compute and Runtime

### 5.1 Runtime evaluation

| Option | Fit | Operational cost | AWS mapping | Verdict |
|---|---|---|---|---|
| **Kubernetes (EKS or k3s)** | Poor | Control plane + etcd + CNI + ingress + metrics; ~1 GB overhead before any app | Native | **Reject** — §22 |
| **ECS on EC2** | Good | Must size, patch, and drain container hosts; capacity planning per host | Native | Fallback only (§5.7) |
| **ECS on Fargate** | **Best fit** | None for hosts; per-task isolation and IAM roles built in | Native | **Choose** |
| **Plain containers on a host** | Poor | No declarative identity, no health-gated rollout, no per-task resource limits, no autoscaling, no IAM role per service | Manual | **Reject as the deployment target.** Retained only as a local inner-loop shortcut (§18.5) |

### 5.2 Why Fargate-style serverless tasks

| Reason | Detail |
|---|---|
| **Per-task IAM roles** | Each service gets its own role with its own permissions. This is the mechanism that enforces "commerce has no access to the catalog database" (§4.5). On plain containers you have one shared set of environment variables and no per-service identity |
| **Per-task resource limits** | CPU and memory are declared per task. The `t3.micro` overcommitment problem from `ARCHITECTURE_REVIEW.md` §8.1 is *structurally impossible* when each task has a memory limit and the scheduler enforces it |
| **No host to patch** | The EC2 fleet that motivated C1 disappears. No AMI, no SSH, no security updates on hosts |
| **Health-gated rolling updates** | The platform refuses to route to a task that has not passed its health check, which is exactly the deployment gate the review requires (§15.3) |
| **Granular scaling** | Catalog scales on read traffic; commerce on checkout traffic. `ARCHITECTURE_REVIEW.md` §8.1 rejected splitting them — but that was about *service boundaries*. Scaling the *same service* horizontally is orthogonal and free here |
| **Statelessness is enforced** | No host-local state persists between tasks. That is what makes the image in §6 promotable |
| **Boot-from-digest** | A task definition references an image digest. Promotion is a task-definition edit, not a rebuild (§6.4) |

### 5.3 Service deployment model

| Service | Task type | Desired count (prod) | Port | Notes |
|---|---|---|---|---|
| `identity` | Web | 2 | 8000 | Django + Gunicorn. Multiple workers in-task; keep task count modest |
| `catalog` | Web | 2–4 | 8080 | Scales on read traffic — the hot path |
| `commerce` | Web | 2–4 | 8080 | Scales on checkout traffic |
| `workers` | **Worker** | 1–2 | **none** | No listener. No target group. No load balancer |
| `migrate-<service>` | One-off | 0 | none | Exists only during a deployment (§16.2) |

**`workers` is modelled as a task with no port and no target group.** It has no inbound path in the
network at all (§4.3). This is worth being explicit about because a worker service without a health
check is a common source of deploy ambiguity — the solution is a **liveness check based on consumer
progress**, not an HTTP probe (§5.5).

### 5.4 Autoscaling

| Service | Metric | Target | Min / Max | Rationale |
|---|---|---|---|---|
| `catalog` | CPU + ALB request count per target | 60% CPU / 1000 rpm | 2 / 8 | Read traffic is the hot path and is cheap per request |
| `commerce` | CPU + request count | 60% CPU / 200 rpm | 2 / 8 | Checkout is low-volume but memory-holding |
| `identity` | CPU | 60% CPU | 2 / 4 | Login rate is low; DB-bound more than CPU-bound |
| `workers` | **Outbox unpublished count + consumer lag** | Scale on backlog | 1 / 4 | **Not CPU.** Idle workers are nearly free; lag is the real signal |

**`workers` scales on queue depth, not utilisation, and that is deliberate.** At 0.25 events/second
the workers are idle ~100% of the time. A CPU-based policy would never scale them out because they
are never busy. The signal that matters is *backlog*: if consumers fall behind, outbox lag grows, and
that is when another worker helps. `ARCHITECTURE_REVIEW.md` §3.9 already specified
`outbox_unpublished_total` and `consumer_lag_entries` as gauge metrics — this is the autoscaling
consumer of those exact metrics.

**No autoscaling on the migration tasks.** They are one-off and must not be duplicated (§16.5).

### 5.5 Health checks

Applying C4 — three endpoints, Redis excluded from readiness:

| Task type | Container health check | Load-balancer target health | Worker health |
|---|---|---|---|
| `identity` | `/healthz` | `/readyz` | n/a |
| `catalog` | `/healthz` | `/readyz` | n/a |
| `commerce` | `/healthz` | `/readyz` | n/a |
| `workers` | Process check + **`outbox_unpublished_total == 0`** (startup only) | **None — no target group** | Liveness: process alive. Progress: lag gauge (§11.4) |

| Property | Requirement | Why |
|---|---|---|
| `/healthz` latency | < 500 ms | It runs on a container-health timer. A slow check kills healthy tasks |
| `/healthz` dependencies | **None** | §0 C4. A liveness check that fails on Redis restarts the world during a Redis outage |
| `/readyz` dependencies | Postgres only | A task that cannot reach Postgres cannot serve traffic. A task that cannot reach Redis **still can serve traffic** — checkout does not need Redis (§8.2) |
| Startup grace period | 30s (Go), 60s (Django: migrations + static manifest) | Django's first request is slow. Without this, the health check kills it during warm-up |
| Interval | 30s | Balances detection latency against check load |
| Failures before unhealthy | 3 | Avoids a single slow response causing a restart |
| `workers` startup gate | `outbox_unpublished_total` reaching 0 within 120s | A worker that starts before its database is reachable would fail every message and fill the dead-letter table |

**The `workers` startup gate deserves emphasis.** It is the one place a slow dependency could cause a
restart loop, and the fix is a readiness-style gate rather than a liveness check: allow up to 120
seconds to reach the database before declaring the task unhealthy.

### 5.6 Resource requests, limits, and sizing

Task sizing is derived from `ARCHITECTURE_REVIEW.md` §8.2, which measured the monolith's real
footprint and extrapolated to Go services.

| Service | CPU request | CPU limit | Memory request | Memory limit | Derivation |
|---|---|---|---|---|---|
| `identity` | 512 mCPU | 1024 | 768 MB | 1024 MB | Django + Gunicorn. The heaviest task |
| `catalog` | 256 mCPU | 1024 | 256 MB | 512 MB | ~30 MB idle per `ARCHITECTURE_REVIEW.md` §8.2; headroom for bursts |
| `commerce` | 512 mCPU | 1024 | 512 MB | 1024 MB | Higher: holds DB connections, checkout transactions |
| `workers` | 256 mCPU | 1024 | 512 MB | 1024 MB | Buffers batches in memory |
| `migrate-*` | 512 mCPU | 1024 | 512 MB | 1024 MB | Django migrations are the expensive case |

| Rule | Value | Reason |
|---|---|---|
| Memory limit = request × 2 | Yes | Allows a 2× burst headroom |
| **CPU limit may exceed request** | Yes | Throttling a CPU-limited task causes latency spikes and cascading health-check failures. Memory limits are hard because the OOM killer is worse than throttling |
| Never set memory request = limit | — | A tight request makes the scheduler over-provision. A hard limit with headroom is the safer combination |
| Derive from measurement, then adjust | — | These are starting points from the review's measurements, not eternal constants. §25.7 defines the review cadence |

**Aggregate production envelope:**

```
identity    2 × (512,  768 MB)  = 1024 mCPU,  1536 MB
catalog     2 × (256,  256 MB)  =  512 mCPU,   512 MB
commerce    2 × (512,  512 MB)  = 1024 mCPU,  1024 MB
workers     1 × (256,  512 MB)  =  256 mCPU,   512 MB
                             ─────────────────────────────
steady state                   2816 mCPU,  3584 MB   (≈3.5 vCPU, 3.5 GB)
at max scale (8/8/8/4)      ≈ 9.6 vCPU,  ~9 GB
```

For comparison, `ARCHITECTURE_REVIEW.md` §8.1 found the **current single-host system** running 7
containers against 1 GB of RAM with no limits. The steady-state envelope above is roughly 3.5 GB
across **seven containers with hard limits**. That is not cost growth — it is the same workload with
boundaries, and it is why the review's OOM concern is resolved structurally rather than by picking a
larger VM.

### 5.7 Compute fallback if Floci lacks Fargate

If `ARCHITECTURE_REVIEW.md` is followed but Floci cannot launch Fargate tasks (§2.7 item 2), the
fallback is **ECS on EC2 with container hosts managed by Terraform**:

| Property | Fargate | ECS on EC2 fallback |
|---|---|---|
| Host management | None | Terraform launches container hosts; ECS registers tasks |
| Task IAM roles | Native | Task role via instance profile, or credential injection (§2.7 item 7 fallback) |
| Isolation | Per-task microVM | Per-task container on a shared host |
| Patching | N/A | Terraform-driven AMI and container-instance replacement |
| Capacity planning | Per task | Per host, then bin-packing |
| Parity with production | **Exact** | Diverges — see §20.3 |
| Terraform change | — | **One variable in `modules/compute`. No module rewrite** |

**The fallback is isolated behind `modules/compute` precisely so that choosing it is a configuration
decision rather than a redesign.** Everything above this layer — image lifecycle, CI/CD, deployment
strategy, migration jobs — is unchanged. This is the practical test of whether a module boundary is
real: if swapping the compute substrate requires edits above the module, the boundary is wrong.

### 5.8 Graceful shutdown

`ARCHITECTURE_REVIEW.md` §9.5 requires `signal.NotifyContext` plus `server.Shutdown(ctx)` on `SIGTERM`,
and §8.9 a 30-second stop grace period. Infrastructure must honour both or in-flight requests are
cut:

```
SIGTERM ──▶ deregister from load balancer    (10s)  ← stop receiving NEW requests
         ──▶ finish in-flight requests       (20s)  ← complete transactions
         ──▶ drain consumer, flush outbox    (10s)
         ──▶ exit                                    ← orchestrator may SIGKILL after 40s
```

| Requirement | Value | Why |
|---|---|---|
| Load-balancer deregistration delay | 10s | Must exceed the target health-check interval so the LB stops sending traffic **before** the process stops accepting |
| Stop grace period | **40s** | > the 30s drain in `ARCHITECTURE_REVIEW.md` §8.9 |
| `SIGKILL` backstop | Orchestrator default | Without it, a hung task would never exit and a deployment would stall |

The ordering is the part that is easy to get wrong: if the process stops accepting connections
*before* the load balancer stops sending, in-flight requests get connection-refused instead of
completing. Ten seconds of deregistration before a twenty-second drain is the standard correction.

**For `commerce` this matters more than for the others**, because a `SIGTERM` mid-checkout leaves the
transaction to be resolved by PostgreSQL's in-doubt mechanism. Draining properly means the
transaction either commits or rolls back cleanly, and the client's idempotency key (§3.8) makes either
retry safe.

### 5.9 Deployment strategy

Chosen in §15. Summary: **rolling, with an automatic health gate that reverts to the previous task
definition revision.** Blue/green and full canary are evaluated and rejected in §15.2. Each service is
deployed independently and sequentially (§15.6).

---

## 6. Container and Image Architecture

### 6.1 Lifecycle

```
  source (git)
     │
     ▼
  build            multi-stage (§6.5), deterministic (pinned base digests)
     │
     ▼
  test             unit + integration run against the BUILT image, not the source tree
     │
     ▼
  immutable image  tagged <service>:<commit-sha>, digest recorded
     │
     ├── SBOM        generated from the image, not the manifest
     ├── vuln scan   blocks on HIGH/CRITICAL with a fix available
     └── provenance  attestation binding digest → source commit → builder
     │
     ▼
  push             registry, under <env>/ namespace on promotion
     │
     ▼
  deploy           task definition references the DIGEST, never a tag
     │
     ▼
  promote          same digest, new environment. No rebuild. Ever.
```

### 6.2 Naming

```
<registry-host>/<env>/<service>:<commit-sha>

sneakin-floci.local:5000/dev/catalog:4f2a9c1
sneakin-floci.local:5000/prod/commerce:4f2a9c1
```

| Rule | Value | Reason |
|---|---|---|
| Repository | `<env>/<service>` | One repository per service, environment-scoped paths (§2.6) |
| Environment in the path | Yes | Promotion is a copy of the same digest between paths, auditable in the registry log |
| Never `<service>:latest` | Banned | `latest` is not a version. Rolling back to it means rolling back to whatever happened to be pushed |
| Never a mutable environment tag alone | Banned | An environment-only tag defeats digest pinning. The environment is in the **path**; the **tag** is immutable |

### 6.3 Tags

| Tag | Applied at | Mutable | Purpose |
|---|---|---|---|
| `<commit-sha>` full (40 chars) | Build | **No** | The canonical tag |
| `<commit-sha>` short (7) | Build | No | Human convenience in logs |
| `<git-describe>` | Build | No | Human-readable, e.g. `v1.4.2-3-g4f2a9c1` |
| `staging`, `production` | **Promotion** | Yes | **Convenience pointer only.** Never used by a task definition |
| `latest` | **Never** | — | Banned |

**The distinction that makes promotion work.** Deployment configs reference **digests**; the
`staging` and `production` tags exist purely so a human running `docker pull sneakin/production/catalog`
gets something sensible. If a mutable tag ever appeared in a task definition, promotion would no longer
be reproducible. A CI check rejects any task definition containing a tag without a digest (§12.1).

### 6.4 Digest pinning

```
image = "<registry>/prod/catalog@sha256:9f2c1a…"
        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
        The task definition references THIS. Nothing re-resolves a tag at runtime.
```

| Property | Consequence |
|---|---|
| A tag can be moved; a digest cannot | The same bytes are guaranteed in every environment |
| Promotion copies a digest | Staging and production provably run the same artifact (§6.9) |
| Rollback is a task-definition edit to a known digest | No rebuild, no rebuild-time drift (§6.10) |
| Digests recorded outside Terraform | The deploy pipeline records each environment's digest in a release manifest (§6.11) |

**Go services are `distroless/static`**, so the Go binary is the whole image (`ARCHITECTURE_REVIEW.md`
§9.6). Identity is Python, so its image carries the interpreter and wheels — larger, and therefore
more worth pinning its base by digest.

### 6.5 Build

| Property | Requirement | Reason |
|---|---|---|
| Multi-stage | Mandatory | Build tools, Go module cache, and pip wheels must not reach the runtime image |
| **Base image pinned by digest** | Mandatory | A tag like `golang:1.26-alpine` can change contents between the build that passed CI and the build that deploys. Digest pinning makes the build reproducible |
| Dependency layer cached separately | Yes | `go mod download` / `pip install` in an early layer keyed only on the lockfile, so source changes do not invalidate dependencies |
| Non-root user | Mandatory | `ARCHITECTURE_REVIEW.md` §9.6 specifies `USER nonroot` for Go. Same for Django |
| **No secrets in build context** | Mandatory | `.dockerignore` excludes `.env*`, `*.pem`, `*.key`, `terraform.tfstate*` |
| Reproducibility flags | `-trimpath`, `SOURCE_DATE_EPOCH` | Identical source → identical image |

**`.dockerignore` is a security control, not an optimisation.** Without it, `COPY . .` puts
`.env.prod` and the Terraform state file — both of which reference secret ARNs and may contain values
— into an image layer, where anyone who can pull it can extract them, and where they **persist in the
registry even after a later "fixed" image**. §12.1 asserts on this in CI.

### 6.6 Vulnerability scanning

| Stage | Tool class | Gate | Rationale |
|---|---|---|---|
| Source dependencies | Python/JS/Go dependency scanner | **Block** on known-exploitable | Catches CVEs before an image exists. Cheapest place to fail |
| Image, post-build | Container image scanner | **Block** on CRITICAL; **warn** on HIGH | Scans the actual artifact including OS packages |
| At deploy | Same scanner against the digest | **Block** on CRITICAL | Catches a CVE disclosed between build and deploy |
| Scheduled | Same scanner over retained images | **Report** | Newly disclosed CVEs affect already-built images |

**Why two scans rather than one.** The source scan knows which package is vulnerable and supports
documented, expiring suppressions. The image scan sees the flattened result — including base-image
CVEs no source scanner knows about. Image-only produces unactionable findings ("a library in
`/usr/lib` is vulnerable"); source-only misses the OS layer entirely. Both, with different gates.

**Exception handling is mandatory, or the gate becomes theatre.** Every suppression requires a
justification and an expiry date, enforced as a review checklist item. A gate with no exception path
gets disabled within a month.

### 6.7 SBOM

| Property | Design |
|---|---|
| Generated from | **The image**, after build. Not the source tree |
| Format | SPDX or CycloneDX |
| Stored in | `sneakin-{env}-artifacts/sbom/<service>-<sha>.json` |
| Retention | 90 days minimum. Must outlive the images it describes |
| Used for | Impact analysis: when a CVE lands, "which images and which running tasks contain it?" becomes a query rather than an archaeology exercise |

The SBOM's real value is **incident response**, not compliance. A Redis CVE published on a Friday
should be answerable with a query, not by rebuilding every image and diffing.

### 6.8 Provenance and signing

| Control | Adopted | Notes |
|---|---|---|
| **Provenance attestation** | **Yes** | Binds image digest → source commit → builder workflow run. This is the artefact that makes §6.9's promotion claim verifiable |
| **Image signing (cosign)** | **Deferred**, with a trigger | Requires a transparency log and a key-distribution decision. Trigger: images are consumed outside this trust boundary, or a customer requires signature verification |
| **Base image provenance** | **Yes, via digest pinning** | Cheaper and sufficient for the base-layer risk (§6.5) |

Provenance adopted, signing deferred — a deliberate split. Provenance answers "where did this image
come from" using infrastructure that already exists. Signing answers "should I trust the signer",
which requires a key-distribution architecture a single-team project does not yet need.

### 6.9 Retention and promotion

| Policy | Setting | Reason |
|---|---|---|
| Untagged images | 7 days | Debugging window without unbounded growth |
| Tagged, non-production | 30 days | Enough to roll back a staging deploy |
| Tagged, production | **90 days** | Production rollback needs a longer horizon than staging |
| Digest manifests | Indefinite | Tiny, and they are the record of what ran |

**Promotion carries the digest and never rebuilds:**

```
build (once)  →  digest sha256:9f2c1a…
     │
     ├── push dev/catalog      @sha256:9f2c1a
     ├── push staging/catalog  @sha256:9f2c1a   ← same digest
     └── push prod/catalog     @sha256:9f2c1a   ← same digest
```

The reason this matters, concretely: if `prod` were rebuilt separately, a floating base-image tag, a
`pip install` of a dependency whose upstream released a patch, or a build-time `git describe` would
produce **different bytes** in production from what staging verified. Promotion would then be testing
a different artifact from the one that ships — defeating the entire purpose of a staging environment.
A CI assertion compares digests across environments and fails the promotion on a mismatch (§12.4).

### 6.10 Rollback

| Property | Value | Reason |
|---|---|---|
| Mechanism | Update the service to the previous task definition revision | A near no-op if the previous revision is still registered |
| Requires rebuild | **No** | The image already exists in the registry |
| Time to rollback | ~2 minutes | One service update plus health verification |
| Database interaction | **None** | *Provided* migrations were expand/contract (§16.4). This is why §16 is not optional |
| Trigger | Health gate failure, or an alarm breach (§12.7) | Automated, not a human noticing |

**Rollback works without touching the database, and that is entirely a function of §16's
expand/contract discipline.** A destructive migration — a dropped column, a renamed table — makes
image rollback a one-way door. The interaction between image rollback and schema compatibility is the
most important cross-section in this document, and §16 exists to guarantee the answer is "these are
independent".

### 6.11 Release manifest

Every deployment publishes an immutable record of **exactly what is running**. Without it, "which digest
is live in production?" requires querying four services individually, and an incident investigation
starts by guessing.

| Field | Source | Example |
|---|---|---|
| Release ID | Git commit SHA | `a1b2c3d` |
| Git tag | Tag, if any | `v0.8.0` |
| Build start / end | CI timestamps | — |
| Image digests | Build stage, one per service | `sha256:…` |
| SBOMs | Build stage | Per-digest URIs |
| Scanner results | Build stage | Pass/fail + counts |
| Terraform commit | CI | The exact config that produced the environment |
| Migration versions | Before and after | `commerce 0042 → 0043` |
| Task definition revisions | Deploy stage | Per service |
| Readiness result | Deploy stage | Per service |
| Deployed-by | CI identity (OIDC principal) | — |
| Environment | Target | `staging` / `production` |

**The manifest is the audit trail that makes §25.6 and §25.7 possible.** "Restore the database to a
point in time" only works if you know which release introduced the bad data, and "roll back to the last
known-good version" only works if you know what that version's digests were. The manifest is also what
lets a future operator answer "why is this table shaped like this?" without reading git history.

**Terraform commit is in the manifest because infrastructure is part of the release.** A digest alone
does not say whether the change was purely application code or also altered the network, the database
instance class, or a security group rule.

---

## 7. Database Architecture

### 7.1 Topology

```
  ┌──────────────────────────────────────────────────────────────────┐
  │  ONE PostgreSQL 16 instance                                      │
  │  ┌────────────────────────────────────────────────────────────┐  │
  │  │  Template / infrastructure databases                       │  │
  │  │    postgres · template0 · template1                        │  │
  │  ├────────────────────────────────────────────────────────────┤  │
  │  │  LOGICAL DATABASES — five, each with one owning role        │  │
  │  │                                                            │  │
  │  │    identity      role: sneakin_identity                    │  │
  │  │    catalog       role: sneakin_catalog                     │  │
  │  │    commerce      role: sneakin_commerce                    │  │
  │  │    engagement    role: sneakin_engagement                  │  │
  │  │    reporting     role: sneakin_reporting                   │  │
  │  │                                                            │  │
  │  │    Extensions: pgcrypto only (gen_random_uuid)            │  │
  │  │    No cross-database grants. No FDWs. No dblink.            │  │
  │  └────────────────────────────────────────────────────────────┘  │
  └──────────────────────────────────────────────────────────────────┘
            ▲
            │  :6432 (transaction pooling)
   ┌────────┴─────────┐
   │   PgBouncer      │   10.0.20.10, port 6432
   │   pool_mode = transaction
   └──────────────────┘
            ▲
            │  :6432
   ┌────────┴───────────────────────────────────────────────────────┐
   │  consumers: identity · catalog · commerce · workers · migrate  │
   └────────────────────────────────────────────────────────────────┘
```

### 7.2 Why one instance for five logical databases

| Reason | Detail |
|---|---|
| **Zero cross-database queries** | Because there are zero synchronous service-to-service calls, no query ever joins two logical databases. Five databases on one instance are five **isolated namespaces**, not five **distributed participants** |
| **No distributed transaction coordinator** | All transactional work happens inside one database (checkout is one local ACID transaction). One instance is not a constraint on correctness |
| **Cost** | Five managed instances is ~5× the cost for zero benefit. Peak load is roughly 8 concurrent checkouts |
| **Backup simplicity** | One backup policy, one restore procedure, one PITR window. Five instances mean five windows that drift apart |
| **Operational load** | One instance to patch, monitor, and failover |
| **Isolation is real at the logical level** | Separate databases + separate roles + no grants means a compromised service genuinely cannot read another service's tables (§4.5) |

**The honest counterpoint — what one instance gives up:**

| Property | One instance | Five instances | Verdict |
|---|---|---|---|
| Data isolation | Strong | Strong | **Equal.** Isolation is a grant property, not a topology property |
| Blast radius | A failure affects all five | Affects one | **Worse.** Accepted knowingly; mitigated by fast restore (§7.7) |
| Per-service contention | Possible | Eliminated | **Worse, accepted.** At 8 concurrent checkouts, contention is not measurable |
| Independent maintenance | No | Yes | **Worse, accepted.** An 8-minute patch touches everything; mitigated by multi-AZ (§7.4) |

**Triggers that would reverse this decision** — each specific and measurable, not "at scale":

| Trigger | Would move |
|---|---|
| One database exceeds ~70% of instance memory *persistently*, not at peak | Split the largest out |
| `commerce` becomes the bottleneck and vertical scaling hits its class ceiling | Split `commerce` |
| Regulatory or contractual requirement for physical data separation | Split the affected database |
| Multi-region deployment | All of them |

**What must NOT be a trigger:** "we are growing." Growth is already handled by PgBouncer plus a larger
instance class. Splitting for growth reasons would pay a distributed-systems tax for a problem that
does not exist.

### 7.3 Roles and credentials

| Role | Owns | Explicitly denied |
|---|---|---|
| `sneakin_identity` | `identity` | All others |
| `sneakin_catalog` | `catalog` | All others |
| `sneakin_commerce` | `commerce` | All others |
| `sneakin_engagement` | `engagement` | All others |
| `sneakin_reporting` | `reporting` | All others |
| `sneakin_migrate` | Schema DDL on all five | Data access outside migrations |
| `sneakin_admin` (break-glass) | Operational queries | Never used by an application |

| Rule | Enforcement |
|---|---|
| One role per service | Terraform generates them from one declaration, so a sixth service forces a sixth role |
| **No application role has privileges in two databases** | Revocation is a loop over five grants; a grant can only exist in one place. The two exceptions are deliberate and both are narrow: `sneakin_migrate` needs DDL everywhere (§7.3), and `workers` holds **two separate credentials** — `sneakin_engagement` and `sneakin_reporting` — not one credential with access to both. Each consumer opens its own pool against its own database and neither can address the other's schema, so the isolation guarantee holds |
| Distinct password per role | A leaked `commerce` password does not open `identity` |
| Passwords generated by Terraform, never authored | A hand-written password in a `.tfvars` is a committed secret |
| Passwords stored in the secret store | Terraform writes the secret and reads it back to set the role password; the value never passes through a module output (§3.7) |
| `search_path` per role | A role cannot address another schema by qualifying it |
| Application connects as its own role | Not as `postgres`, ever. Superuser only for migrations and break-glass |
| `statement_timeout` per role | A runaway query in one service cannot pin the instance and starve the others |

**Two roles inside one process is not the same as one role with two databases.** The `workers` binary
hosts two consumers in a single task for operational reasons, so it receives both credentials. What
preserves the isolation model is that each credential is used only for its own pool: the Engagement
consumer connects with `sneakin_engagement`, the Reporting consumer with `sneakin_reporting`, and neither
credential carries privileges in the other's database. A compromised Engagement code path cannot query
`reporting` even though it shares a process with a credential that can.

**`sneakin_migrate` as a separate role has a large effect for a small cost.** Application processes
receive only their own role, which has DML privileges but not DDL. Schema changes are therefore
*structurally impossible* from a running service — the only path is the migration task, which is
auditable, gated, and runs once (§16).

### 7.4 Availability

| Environment | Topology | Recovery |
|---|---|---|
| Floci | Single instance, single named volume. Survives container recreation | Restore from backup |
| Staging | Single instance | Restore |
| Production | **Multi-AZ managed instance**, automatic failover, standby in a second AZ | Minutes, automatic |

Multi-AZ is correct for exactly one reason: PostgreSQL cannot survive the loss of its storage volume,
so a single-AZ instance means any volume-level failure is a full outage of the whole store. §7.2
accepted the shared blast radius for cost and simplicity; multi-AZ is the mitigation for the part of
it that matters.

**Local/production gap:** Floci cannot demonstrate AZ failover. §20 lists this as an intentional,
acknowledged difference. The topology is identical; only the redundancy differs.

### 7.5 Connection pooling — the reversal (C2)

This is the arithmetic that overturns `ARCHITECTURE_REVIEW.md` §8.3's "PgBouncer: not yet".

**Without a pooler**, connections scale with replicas. Using the autoscaling maxima from §5.4:

```
catalog    8 tasks ×  8 conns =  64
commerce   8 tasks × 12 conns =  96      ← commerce needs a deeper pool:
identity   4 tasks × 10 conns =  40         it runs multi-statement transactions
workers    4 tasks ×  4 conns =  16
migrate    2 tasks ×  4 conns =   8
                                     ─────
                            worst case = 224 connections
```

PostgreSQL's default `max_connections` is **100**. Commerce alone at 8 replicas reaches 96; catalog
plus commerce exceed the limit at 4 replicas. Each connection is a forked OS process on the server, so
224 connections also means substantial memory overhead beyond the count.

Raising `max_connections` instead is the naive fix and the wrong one: server memory then forces
sharing, so raising the count degrades everyone under load. The correct fix caps **server-side**
connections regardless of client count.

**With PgBouncer in transaction mode:**

```
Each logical database: a server-side pool of ~16–25 connections.
Total server-side:  5 databases × ~20 = ~100, and most sit far below their cap.
Client-side:        unbounded — each task may open many; the pooler multiplexes
```

| Setting | Value | Reason |
|---|---|---|
| `pool_mode` | **transaction** | Returns the connection at transaction end. Session mode holds it for the session and defeats the purpose |
| `pool_size` | 16–25 per database/user pair | Sized to instance CPU, not client count |
| `max_client_conn` | 500+ | Absorbs task replicas |
| `reserve_pool_size` | 2–5 | Guarantees a connection for a burst that would otherwise queue |
| `server_lifetime` | Set | Recycles server connections, bounding a connection-level failure's blast radius |
| `ignore_startup_parameters` | `extra_float_digits` | Standard compatibility requirement |

**Operational consequence that must be known before adoption: prepared statements.**
Transaction-mode pooling is incompatible with *session-level* prepared statements, because a
transaction may be served by a different server connection than the previous one.

| Client | Impact | Mitigation |
|---|---|---|
| Django + psycopg2 | None | Unaffected |
| Go + `pgx` via `database/sql` + `jackc/pgx/v5/stdlib` | Prepared statements break unless handled | Set `default_query_exec_mode=exec` in every application DSN. `QueryExecModeSimpleProtocol` is **not** the choice — it sends parameters as interpolated SQL text, and pgx recommends against it. `QueryExecModeDescribeExec` is **prohibited**: PgBouncer may switch backends between the describe and the execute. Set `max_prepared_statements = 0` until a PgBouncer version is pinned. **Decided in ADR-0003** |
| Migration tooling | Possible session-affecting flags | Run migrations with `pool_mode=session` via a separate pool, or connect directly (§16.3). Per ADR-0003, `sneakin_migrate` connects straight to PostgreSQL on 5432 |

**This is exactly the kind of consequence that justifies a design document.** PgBouncer is correct, and
it is also a decision that must be communicated to whoever writes `commerce` — otherwise they will
write prepared-statement code that works in local Compose (no pooler) and fails in production
(pooler present). That is a *local/production parity gap*, the exact failure the mandate asks us to
avoid. §18 therefore requires local development to run through PgBouncer too.

**The mitigation is decided** — `default_query_exec_mode=exec`, per ADR-0003. It is
version- and deployment-form-independent, so it does not wait on §21.1's
container-versus-RDS-Proxy choice.

### 7.6 Schema ownership and migration ordering

| Database | Migration tool | Applied by | Order |
|---|---|---|---|
| `identity` | Django `migrate` | `migrate-identity` task | **First** — issues JWTs and the JWKS other services fetch |
| `catalog` | Plain `.sql` | `migrate-catalog` task | Independent |
| `commerce` | Plain `.sql` | `migrate-commerce` task | Independent. Contains `stock_level` and `outbox` |
| `engagement` | Plain `.sql` | `migrate-engagement` task | Independent |
| `reporting` | Plain `.sql` | `migrate-reporting` task | Independent. Contains the read models |

| Property | Value | Reason |
|---|---|---|
| Migration owner | **One per database, always the owning service** | §4.1. Nobody migrates another service's schema |
| Execution point | A one-off task, **before** the service update (§16.2) | Not at container start |
| **Ordering across services** | Only `identity` is ordered relative to others, because others depend on its JWKS. The remaining four are **order-independent** and may migrate in parallel | Independent schemas have no cross-dependency |
| Locking | `lock_timeout` 5s, `statement_timeout` 60s | A migration that blocks must **fail fast** rather than queue behind a long transaction |
| Idempotency | Every migration written to be safely re-runnable | A partially-applied migration must be resumable, not manual |

### 7.7 Backup, restore, and disaster recovery

| Mechanism | Setting | Recovers |
|---|---|---|
| Automated daily backup | 7-day retention | Operator error, bad migration, accidental deletion |
| Point-in-time recovery | 5-minute granularity, 7-day window | Any point in the last week. **The primary DR mechanism** |
| Cross-region/offsite copy | Nightly `pg_dump` to object storage, 30-day retention | Region loss, and logical corruption PITR cannot see |
| Restore drill | **Quarterly, automated, verified** | The backups themselves |

**Three honest points about backups:**

1. **A backup that has never been restored is not a backup.** The quarterly drill restores into an
   isolated database and asserts row counts and checksums. A drill that only reports "restore job
   succeeded" proves the job ran, not that the data is correct.
2. **PITR is not sufficient alone.** A logical corruption bug (`DELETE FROM order_item` without
   `WHERE`) writes valid WAL, so PITR will happily restore the corrupted state. The nightly logical
   dump is the only defence, which is why both exist.
3. **§2.7 item 4 is the real risk.** If Floci's PostgreSQL lacks PITR, the local environment has **no
   5-minute-granularity recovery**, and the nightly `pg_dump` path becomes mandatory in every
   environment rather than a production-only extra. This is the one missing managed capability with
   genuine data-loss consequences, which is why §2.7 flags it **High**.

| Scenario | RTO | RPO | Mechanism |
|---|---|---|---|
| Bad migration | ~15 min | 0 | PITR to before the migration |
| Accidental `DELETE` | ~15 min | < 5 min | PITR |
| Full instance loss | ~30 min | < 5 min | PITR or nightly restore to a new instance |
| Region loss | Hours | 24h | Nightly offsite dump |
| Logical corruption undetected > 7 days | Hours | 24h | **Beyond PITR retention.** Nightly dump, 30-day retention. A real data-loss window, accepted and documented |

### 7.8 In-transit encryption

| Environment | PostgreSQL | Rationale |
|---|---|---|
| Floci | Plain | Local only; no threat path |
| Staging | TLS | Matches production so certificate handling is exercised |
| Production | **TLS required** (`sslmode=verify-full`) | §2.8: datastores carry credentials and personal data |

`verify-full`, not `require`. `require` encrypts without validating the server certificate, which stops
passive eavesdropping but not an active man-in-the-middle. The certificate comes from the same
authority as the edge certificate, so verification adds no operational burden.

### 7.9 What is deliberately absent

| Not introduced | Reason |
|---|---|
| One instance per logical database | §7.2. Zero cross-database queries means isolation is a grant property |
| Aurora / Aurora Serverless | Aurora's distributed storage solves a problem that only exists at a scale and architecture this does not have. It also proxies connections, duplicating PgBouncer. Exceeding a single node's limits is the §7.2 split trigger |
| Read replicas | The read path is served by `catalog` caching and the `reporting` read models — projections built from events, cheaper and simpler than replication |
| Cross-region replication | No multi-region deployment (§7.2). Nightly dumps cover the loss case |
| `postgres_fdw` / `dblink` | Would reintroduce cross-database queries, violating §4.1 |
| Logical replication | No cross-instance data movement is needed. Events move data; replication would duplicate the mechanism |
| Automated failover tooling | Managed multi-AZ handles it (§7.4) |

---

## 8. Redis Architecture

### 8.1 Role

> **Redis Streams is the event transport. PostgreSQL's transactional outbox is the source of truth.**
> Redis is a buffer, and the system is designed so that losing it entirely costs redelivery, not data.

That sentence is the whole design. Everything below is subordinate to preserving it.

### 8.2 Topology

```
  ┌────────────────────────────────────────────────────────────────────┐
  │  Redis 7  —  one node, AUTH-protected, not publicly routable       │
  │  10.0.20.20:6379                                                  │
  │                                                                    │
  │  Persistence: appendonly yes, appendfsync everysec                │
  │  Eviction:    maxmemory-policy noeviction      ← NOT the default   │
  │  Memory:      bounded (see §8.5)                                  │
  │                                                                    │
  │  LOGICAL DATABASES                                                 │
  │  ┌────────────────────────────────────────────────────────────┐   │
  │  │ db 3  domain events      ← DOMAIN EVENTS (the backbone)    │   │
  │  │      stream: sneakin:<env>:events                          │   │
  │  │      consumer groups:                                       │   │
  │  │        commerce-cart-clear                                 │   │
  │  │        workers-engagement                                  │   │
  │  │        workers-reporting                                   │   │
  │  │        catalog-availability                                │   │
  │  │                                                            │   │
  │  │ db 1  Celery broker      (transitional — §8.10)           │   │
  │  │ db 2  Celery results     (transitional — §8.10)           │   │
  │  │ db 0  Django cache       (optional)                        │   │
  │  └────────────────────────────────────────────────────────────┘   │
  └────────────────────────────────────────────────────────────────────┘
                    ▲
                    │ AUTH, private subnet only (§4.6)
   commerce relay ─┼── catalog tasks ── engagement ── reporting
```

**Four consumer groups on one stream** is the fan-out requirement from `ARCHITECTURE_REVIEW.md` §3.6.
Each group receives every event independently; one group falling behind does not affect the others.

**Stream per environment**, never shared. A shared stream would let a staging test consume production
events.

### 8.3 Why one node is sufficient

| Argument | Detail |
|---|---|
| Volume | 0.25 events/s peak (`ARCHITECTURE_REVIEW.md` §2.1). Redis handles 100,000+/s |
| Total data | ~2 MB/day. Even at 30 days retention this is trivial |
| **The outbox makes it recoverable** | A lost node is not data loss. The relay republishes from PostgreSQL (§8.7) |
| Availability requirement | Events reach humans, not a request path. Minutes of delay is acceptable |

**Single-node Redis is safe here *only because* the outbox exists.** Without the outbox it would be a
single point of data loss. That dependency is explicit: §22's rejection of Redis Cluster is
conditional on the outbox remaining in place, and if the outbox were ever removed that decision would
need revisiting.

### 8.4 Persistence

| Setting | Value | Why |
|---|---|---|
| `appendonly` | **`yes`** | **Currently absent** — `docker-compose.prod.yml:49` runs `redis-server --requirepass …` and nothing else. Production persists nothing |
| `appendfsync` | `everysec` | Worst case loses one second of AOF buffer. Acceptable, because the outbox already holds everything |
| `save` (RDB) | Off or long interval | AOF suffices; two persistence mechanisms double the disk and the failure modes |
| Recovery source | AOF first, **outbox replay second** | The AOF is a fast path; replay is the correctness backstop |

`everysec` rather than `always` is deliberate. `always` would fsync per write, and at 0.25 events/s the
performance cost is negligible — but the AOF is a *transport buffer*, and paying fsync latency on a
component that is already reconstructible optimises the wrong thing. If the outbox ever stops covering a
class of message, this decision should be revisited.

### 8.5 Memory and eviction

```
  events/sec (peak)                    ~0.25
  average event size                   ~500 bytes
  retention cap (MAXLEN ~50000)       50,000 events
  ─────────────────────────────────────────────────
  maximum stream memory                50,000 × 500 B ≈ 25 MB
  consumer-group overhead (XPENDING)   ≈  5 MB
  Celery transitional use              ≈ 50 MB
  ─────────────────────────────────────────────────
  realistic peak                       ≈ 100 MB
  maxmemory                           256 MB          (2.5× headroom)
```

| Setting | Value | Why |
|---|---|---|
| `maxmemory` | **256 MB** | Bounded. Unbounded Redis on a shared host is how the memory monitor finds Redis instead of PostgreSQL |
| `maxmemory-policy` | **`noeviction`** | **The default is `allkeys-lru`, which would silently evict stream entries under memory pressure — dropping domain events with no error.** This is the single most important Redis setting in the system |
| `maxmemory-samples` | Default | Only relevant to LRU policies |

With `noeviction`, hitting the limit produces a **write error** rather than silent data loss. That error
surfaces as an outbox relay retry (§8.7) — loud, visible, recoverable, and strictly better than a `DEL`
nobody notices until a customer is missing a notification.

**`MAXLEN ~50000` is approximate trimming** (`XADD … MAXLEN ~ 50000`), which trims in whole
macro-nodes and is O(1). Exact trimming (`MAXLEN 50000`) is O(n) and would block the stream. Approximate
is correct: trimming a few extra old entries is harmless because consumers already processed them.

### 8.6 Failure behaviour — the required invariant

> **Redis unavailable ≠ checkout transaction failure.**

This is R §3.12 **F8**, and it is an *architectural* property that infrastructure
must not break:

| Component | Behaviour when Redis is down | Why |
|---|---|---|
| **Checkout** | **Succeeds normally.** Order created, stock decremented | The outbox row is written **inside** the PostgreSQL transaction (§3.4 T6). Redis is never contacted on the request path |
| Outbox relay | `XADD` fails → row stays unpublished → retries with backoff | The row is not marked published until the write succeeds. **No data loss is possible** |
| Consumers | Cannot `XREADGROUP`. No events processed. Backlog grows | Alerts fire (§11.6) |
| Cart clear | Cart not cleared; user may see a stale cart | R §3.12 F10 — low harm |
| Notifications | Not delivered. Delayed | Humans depend on these, not code |
| `/readyz` | **Unaffected.** Remains ready | §0 C4. This is why readiness must not check Redis |
| Liveness | **Unaffected.** No restart loop | §0 C4 again |

**Two independent infrastructure controls enforce this invariant:**

1. **The deployment health check excludes Redis** (C4). If it did not, a Redis outage would pull every
   task out of load-balancer rotation — converting a non-impacting dependency failure into a total
   outage. This is why `/readyz` checks PostgreSQL and *only* PostgreSQL.
2. **Redis lives in the data subnet, with `redis-sg` allowing only the four service groups** (§4.6), so
   the blast radius of a Redis network problem is Redis.

### 8.7 Recovery

| Failure | Detection | Recovery | Data loss |
|---|---|---|---|
| Redis process crash | Liveness probe; `redis_up` metric | Restart. AOF reloads up to 1s of writes | None — outbox covers it |
| **Redis node lost (volume gone)** | Same | Restart empty. **Consumers reset offsets. Relay republishes every unpublished outbox row** | **None** |
| Redis unreachable from one service | Per-service error metric | Retry with backoff. Other consumers unaffected | None |
| Full Redis replacement | Same as node lost | Same | None |
| Consumer stuck (crash or poison-message loop) | `consumer_lag_entries` rising | `XAUTOCLAIM` reclaims pending entries after the 60s visibility timeout | None |

**The recovery procedure, precisely:**

```
1. Redis comes back empty (or with partial data)
2. Each consumer deletes and recreates its consumer group
     → group starts at "$" (new only) or "0" (replay everything)
3. Relay scans the outbox for rows where published_at IS NULL
4. Relay re-XADDs them, in created_at order, with the SAME event_id
5. Consumers receive them
6. processed_events (event_id, consumer_name) makes re-processing a no-op
7. Consumers that already processed an event skip it
```

Step 6 is what makes this safe, and it is why `ARCHITECTURE_REVIEW.md` §3.8 specifies
`processed_events` with a `(event_id, consumer_name)` primary key **in PostgreSQL, not Redis**. If
deduplication lived in Redis, wiping Redis would also wipe the dedup state and step 7 would stop
working. **Deduplication state must be in the durable store** — a small architectural constraint with
a large reliability consequence, worth stating because the intuitive placement (dedup next to the
stream) is the wrong one.

### 8.8 Retention

| Setting | Value | Reasoning |
|---|---|---|
| `MAXLEN` | `~50000` ≈ 7 days at peak | Comfortably longer than the longest realistic consumer outage |
| Consumer groups | 4, retained | Groups are cheap metadata |
| `XPENDING` idle timeout | 60s | `ARCHITECTURE_REVIEW.md` §3.10 |
| Celery keys (db 1, 2) | Default TTLs | Transitional; removed with Celery (§8.10) |

**Why 7 days of stream retention when the outbox holds everything forever.** The stream is for *live*
delivery; recovery beyond the retention window comes from the outbox, which has no retention limit. The
retention value is a convenience window, not a durability boundary — so setting it short is safe. The
reverse would be a mistake: relying on stream retention for durability.

### 8.9 Dead letters and deduplication

| Concern | Implementation | Where |
|---|---|---|
| Dead letters | `dead_letters` table in the **owning service's** database | `ARCHITECTURE_REVIEW.md` §2.5 |
| DLQ trigger | 5 consumer attempts with exponential backoff | §3.9 |
| Deduplication | `processed_events(event_id, consumer_name)` PK | §8.7 |
| Acknowledge-after-commit | `XACK` **only** after the database transaction commits | §3.9 — the rule that prevents event loss |
| Redrive | Manual replay from `dead_letters` or the outbox, re-delivering the same `event_id` | Idempotent by construction |

**Why dead letters live in PostgreSQL rather than Redis.** Redis Streams has no native dead-letter
exchange. Implementing one with a separate stream works but loses entries on the same flush the DLQ was
meant to survive, and it is not SQL-queryable. Since every consumer already writes to PostgreSQL, a
`dead_letters` table is free, durable, and queryable — and it survives the Redis loss scenario the
whole design is built around. `ARCHITECTURE_REVIEW.md` §2.5 reached this from the broker-capability
side; §8.7 reinforces it from the durability side.

### 8.10 Transitional coexistence with Celery

`ARCHITECTURE_REVIEW.md` §7.2 phases 0–2 run inside the monolith, and Celery still drives the welcome
email and the daily sales report until Phase 2. During the transition:

| Logical database | Contents | Lifecycle |
|---|---|---|
| db 1 | Celery broker | Live until Phase 2, then dropped |
| db 2 | Celery results | Live until Phase 2, then dropped |
| db 3 | Domain events | Created in Phase 0. Live throughout |
| db 0 | Django cache | Optional |

**Separating Celery onto db 1/2 and events onto db 3 is what makes the transition safe.** `FLUSHALL`
during Celery debugging cannot destroy domain events, and decommissioning Celery cannot affect event
delivery. `ARCHITECTURE_REVIEW.md` §8.7 anticipated this ("Redis databases 1 and 2 become unused once
`workers` replaces Celery"); §8.10 makes the ordering explicit — the databases are separated *before*
the transition begins, not after it ends.

### 8.11 Security

| Property | Value | Reason |
|---|---|---|
| `requirepass` | Yes. Strong value generated by Terraform | Never a `changeme` default — `ARCHITECTURE_REVIEW.md` §11.2 S4 identified that as a live finding |
| **Per-consumer credentials** | Yes | A compromised service cannot read another consumer's pending events |
| Network | `redis-sg` ← four service groups only (§4.6) | Not reachable from the edge |
| Public access | **None** | Carries authentication material and in-flight events |
| TLS | **Required in production** (§2.8) | Credentials cross the wire on every connection |
| Command restrictions | `rename-command` for destructive commands in production | Limits the blast radius of an unintended `FLUSHALL` |

---

## 9. Secrets and IAM

### 9.1 Secret inventory

| Secret | Consumer | Lifetime | Rotation |
|---|---|---|---|
| PostgreSQL role passwords (5) | Each service | 90 days | Automated |
| PostgreSQL admin password | Migration task, break-glass | 180 days | Manual |
| PgBouncer client password | Each service | 90 days | Automated |
| Redis AUTH credentials (4, one per consumer) | Each service | 90 days | Automated |
| **JWT private key (Ed25519)** | Identity only | 90 days | §9.5 |
| JWT public key (JWKS) | All services (public — not a secret) | Follows the private key | Published alongside |
| Django `SECRET_KEY` | Identity | 180 days | Manual |
| Sentry DSN | Identity, commerce | Never | n/a (write-only, semi-public) |
| SMTP / email provider credentials | Identity, workers | 90 days | Provider |
| Payment provider keys | Commerce | 90 days | Provider |
| Terraform state encryption key | Ops | 180 days | Manual |
| Registry pull credential | Task roles | 24 hours | Automatic |

### 9.2 Storage

All secrets live in the **secret store** (Secrets Manager-compatible). The rules:

| Rule | Enforcement |
|---|---|
| Never in git | Pre-commit secret-scan hook (§23.7) plus CI scan. `.env*` is gitignored today and must stay that way |
| Never in a workflow file | §12.6. `cd.yml` violates this today with a long-lived SSH key (C7i) |
| Never in a Terraform variable | Only secret *ARNs* are variables (§3.7) |
| Never in an image layer | `.dockerignore` + CI assertion (§6.5) |
| Never in a task definition literal | Secrets are injected by reference (§9.4) |
| Never logged | `ARCHITECTURE_REVIEW.md` §10.2 forbids secrets in logs; §23.5 audits |
| Terraform writes secrets, then reads them back | One place creates the value, so no caller needs to author it |
| Versioned | Every value is versioned so rollback is possible |

### 9.3 Runtime injection

| Mechanism | Scope | When |
|---|---|---|
| **Task-role-assumed environment variable** | All services in production | Default. No secret material is written to disk |
| Mounted secret file | Migration task only | Needs a long-lived value for the duration of the run |
| Plain environment variable | **Floci only** | Acceptable for a local environment with no real secrets |

**Task-role injection is the production default.** The task's IAM role is assumed at launch and the
secret store is queried with that role's permissions. Three properties follow:

1. **No secret exists at rest in the task.** A container image inspection or an ephemeral-volume
   snapshot does not yield credentials.
2. **Rotation needs no redeploy.** The next task launch picks up the new value.
3. **Access is auditable per role.** If `catalog` attempts to read the `commerce` DB password, the
   secret store denies it and logs it — a signal that a policy is wrong.

**The trade-off, stated honestly:** injection at launch means a long-running task keeps the value it
received at start. With 90-day rotation and tasks that restart regularly, this is acceptable. If a
secret needed rotation without any task restart, the file-mount mechanism with a refreshable path would
be required instead. No secret here needs that.

### 9.4 JWT signing keys

`ARCHITECTURE_REVIEW.md` §6.2 already decided: Identity signs with **Ed25519**, publishes the public key
at `/.well-known/jwks.json`, and Go services verify with the public key only. Infrastructure adds:

| Property | Design |
|---|---|
| Storage | Private key in the secret store, injected into `identity` only |
| Public key distribution | Identity serves it. No secret involved — it is public by design |
| Consumers cache | 1 hour, refreshed on unknown `kid` (`ARCHITECTURE_REVIEW.md` §6.2) |
| Rotation | 90 days. Publish old + new during overlap; retire the old after **24h** (> the 30-min access TTL) |
| Rotation during deployment | New key published by JWKS **before** `identity` starts signing with it |
| JWKS availability | `/readyz` requires JWKS loaded (`ARCHITECTURE_REVIEW.md` §5.5), so a task that cannot load it never receives traffic |

**The ordering requirement is the subtle one.** If `identity` begins signing with a new key before the
JWKS publishes it, every `catalog` and `commerce` task rejects every token until their caches refresh —
a self-inflicted total authentication outage. The deployment order is therefore:

```
1. Write the new private key to the secret store
2. Deploy identity — JWKS now serves BOTH keys; identity signs with the new one
3. Wait for all consumer caches to refresh (or trigger by unknown kid)
4. Retire the old key (keep in JWKS for 24h, then remove)
```

This is one of the few places where a deployment has a genuine ordering constraint, and it is invisible
unless written down.

### 9.5 IAM model

**Two credential paths only.** No third mechanism, no shared credentials, no service holding another
service's credentials.

| Path | Identity source | Mechanism | Used by |
|---|---|---|---|
| **GitHub Actions → AWS** | OIDC token, exchanged for temporary credentials | Role trust scoped to repo, ref, and environment | CI/CD (§12.6) |
| **Task → AWS** | Task role | Assumed at launch, scoped to one service | Every running task (§9.3) |

### 9.6 GitHub Actions OIDC

The mandate requires OIDC in place of long-lived credentials, and it is the only viable path to real
AWS. (`cd.yml` violates this today — C7i.)

| Role | Trust condition | Permissions | Purpose |
|---|---|---|---|
| `github-ci-readonly` | `repo:<owner>/<repo>`, `ref:refs/heads/main`, `environment:ci` | Read images, read state; **no writes** | PR validation jobs |
| `github-floci-deployer` | Repo + ref `main` + `environment:floci` | Update **only** the four services and their task definitions | Floci deployment |
| `github-staging-deployer` | Repo + ref `main` + `environment:staging` | Same, scoped to the staging account/state | Staging |
| `github-production-deployer` | Repo + ref `main` + `environment:production` | Update services; **no Terraform writes** | Production app deploy |
| `github-production-terraform` | Repo + `environment:production` + **manual approval** | Terraform state + infrastructure | Production infrastructure |

| Property | Value | Reason |
|---|---|---|
| Credential lifetime | **1 hour** maximum | A leaked token expires before an attacker uses it |
| Static AWS keys in GitHub | **None** | The entire point |
| `sub` claim condition | Includes `repo:owner/repo:ref:refs/heads/main` | A PR from a fork cannot assume the role |
| **Environment-scoped trust** | Yes | A workflow targeting `environment:production` requires the environment's protection rules to pass (§12.4) |
| Session name | Includes the workflow run ID | Makes CloudTrail entries attributable to a specific run |
| `id-token: write` permission | Granted **only** to jobs that need OIDC | §12.7 least privilege |

**Separate roles per environment** is the control that prevents a compromised CI job in a fork from
touching production. Trust conditions on `ref` alone are insufficient because many workflows are
triggered by `pull_request` from forks.

**Production infrastructure writes are a separate role from production application deploys**, with
manual approval. A compromised CI token can roll back an application; it cannot change the network,
the database instance, or the security groups. This is the least-privilege boundary that matters most.

### 9.7 Rotation and recovery

| Secret | Method | Recovery if lost |
|---|---|---|
| PostgreSQL role password | Automated 90-day rotation. **Rotation must not drop live connections** — use PgBouncer's `RELOAD` or a rolling role password via `ALTER ROLE … VALID UNTIL`, so an application restart is not required** | `ALTER ROLE … PASSWORD` from break-glass; service reconnects |
| Redis AUTH | Automated. Existing connections persist; new ones use the new value | Update the secret; restart the affected task |
| **JWT private key** | §9.4. **Loss is not an outage** — the JWKS continues serving the public key; only the ability to *sign* is lost | Restore the previous key version; access tokens remain valid |
| Django `SECRET_KEY` | 180 days | **Changing it invalidates all sessions.** Rotate in a maintenance window |
| Third-party provider keys | Provider-driven | Provider console |
| **Any secret, unrecoverable** | — | Regenerate. For database passwords, ALTER ROLE. For JWT, generate a new key and accept that existing access tokens become invalid (bounded by the 30-min TTL) |

**The last row is the honest statement:** with all secrets generated rather than authored, "lost
secret" is a rotation event, not a crisis. That property is a direct consequence of never letting a
human write a secret value.

### 9.8 Terraform-managed IAM

| Role | Attached to | Scope |
|---|---|---|
| `catalog-task-role` | `catalog` tasks | Read `catalog` DB; read JWKS; read catalog configuration; write logs and metrics |
| `identity-task-role` | `identity` tasks | Read/write `identity` DB; **read the JWT private key**; publish logs; publish JWKS |
| `commerce-task-role` | `commerce` tasks **and the outbox relay** | Read/write `commerce` DB; **read/write Redis events** — the relay's `XADD`. The relay runs inside the Commerce process and is the only writer of the events stream; publish logs and metrics |
| `workers-task-role` | `workers` tasks | Consume events. **Two separate DB credentials** — `sneakin_engagement` for the Engagement consumer and `sneakin_reporting` for the Reporting consumer, each used only for its own pool. Neither credential holds privileges in the other's database, so one compromised consumer cannot reach the other's data |
| `migrate-task-role` | Migration tasks | Schema DDL on all five. No secret beyond migration credentials |
| `edge-reader-role` | Edge | Read the SPA bucket only |

| Rule | Enforcement |
|---|---|
| No role reads another service's database password | Policy generated from one table, so an exception is visible in review |
| **`identity` alone can read the JWT private key** | The key is the highest-value secret in the system. Compromise of any other service must not yield signing capability |
| No role may create, modify, or delete IAM | Prevents privilege escalation from a compromised task |
| No wildcard resources | `*` on resource ARNs only where genuinely required, and enumerated in review |
| Every role has an explicit deny for other services' data | Default-deny comes from statement structure; the deny makes intent legible |

**`workers` reading `commerce` directly is worth calling out.** It is tempting — reporting queries want
order data. It is refused: reporting reads **only** its own database, populated from events
(`ARCHITECTURE_REVIEW.md` §14). If reporting cannot answer a question from events, the fix is a new
event, not a database grant. This single rule is what keeps the five-database model coherent.

---

## 10. Edge and Load Balancing

### 10.1 Components

| Function | Choice | Note |
|---|---|---|
| DNS | Managed DNS (Route 53 in AWS); local cloud DNS or LB host rules in Floci | Replaces `sneakin.duckdns.org` (C7u) |
| TLS termination | Managed certificate service (ACM), or a local CA + host trust | Automatic renewal in production |
| Load balancing | Managed application LB | Health-gated target groups |
| Routing | Path-based listener rules | §10.2 |
| Static content | Served directly from object storage | C3 |
| Rate limiting | LB-level | §10.6 |
| Headers | Edge-injected | §10.4, §10.7 |

### 10.2 Routing

| Path pattern | Target | Notes |
|---|---|---|
| `/api/v1/products` | `catalog` | Exact rule, ordered **before** the wildcard |
| `/api/v1/products/*` | `catalog` | Hottest path. `ARCHITECTURE_REVIEW.md` §5.3: no other service involved |
| `/api/v1/cart/*` | `commerce` | |
| `/api/v1/orders/*` | `commerce` | Checkout path |
| `/api/v1/wishlist/*` | `commerce` | |
| `/api/v1/auth/*` | `identity` | Login, refresh, register. Rate limited |
| `/api/v1/healthz`, `/readyz` | per-service | Never aggregated at the edge |
| `/api/v1/diagnostics` | `identity` | **Authenticated only** (§0 C4) |
| `/static/*` | object storage | Django admin assets (C3) |
| `/media/*` | object storage | Product imagery (C3) |
| `/` and unmatched | SPA static origin | §10.3 |

**Ordering rule: exact-path rules before wildcard rules.** `/api/v1/products` matches both; if the
wildcard is evaluated first, precedence is implicit and fragile. Explicit ordering removes the
ambiguity.

**This routing is what makes the zero-synchronous-calls architecture reachable from the outside.**
Because no service ever needs to call another, the edge is the complete topology: one hop from the
client, one hop to a database.

### 10.3 SPA delivery

| Option | Assessment |
|---|---|
| SPA baked into an image, served by a static task | Simple, but requires a compute task to serve files — more machinery than needed |
| **SPA in object storage, served by the edge/static origin** | **Chosen.** No compute for static files, native caching, no task to keep warm |
| SPA behind a CDN | Adds an edge cache. Rejected *for now*, for the reason below |

**Deployable-first over cached-first is a deliberate ordering choice.** A CDN caches aggressively,
which is exactly wrong for a deploy-first workflow: a stale cached `index.html` referencing
content-hashed assets is the classic broken-deployment failure. Serving from the edge with the SPA
referencing immutable hashed assets, and `index.html` with a short cache lifetime, gives correct
behaviour with no cache-invalidation mechanism.

Add a CDN when measured static traffic justifies it. The object-storage origin means that is a
configuration change, not a re-architecture.

### 10.4 Request normalisation

Every rule below is required by `ARCHITECTURE_REVIEW.md` §11.4, and `nginx.conf` currently violates
several (C7b, C7e).

| Rule | Current state | Rationale |
|---|---|---|
| **Strip** client-supplied `X-User-Id`, `X-Forwarded-User`, `X-Forwarded-Email` | Not present | If any service trusted a header for identity, a client could forge it. **The JWT signature is the only identity assertion** (§23.3) |
| **Replace**, not append, `X-Forwarded-For` | Currently appends (C7b) | Appending preserves client-supplied values, so logs record a spoofed source IP |
| **Generate or propagate `X-Request-ID`** | Absent (C7e) | The correlation ID required by `ARCHITECTURE_REVIEW.md` §10.2 |
| Propagate `traceparent` | Absent | §10.4 of the review: W3C trace context |
| Set `Host`, `X-Real-IP`, `X-Forwarded-Proto` | Present | Correct |
| Preserve `Authorization` | Present | Required |

**`X-Request-ID` is where observability begins.** Generating it at the edge — rather than in each
service — means a request that fails at the first hop still has an ID, and the same ID appears in every
service log, in the event payload, and in the Playwright test report. This is the single highest
leverage observability change in the platform, and it costs one header.

### 10.5 Timeout budget

Derived from `ARCHITECTURE_REVIEW.md` §3.10 — and it contradicts the current Nginx configuration (C7c:
60s).

| Tier | Timeout | Source |
|---|---|---|
| Client → edge | 30s | Outer bound |
| **Edge → service, checkout** | **10s** | §3.10. One local transaction; p99 should be under 200ms |
| Edge → service, reads | 5s | §3.10 |
| Edge → service, `/readyz` | 2s | Health checks must not queue behind traffic |
| Connection establishment | 2s | §3.10 |
| Edge idle timeout | 60s | Keep-alive reuse |
| Task drain on SIGTERM | 40s | §5.8 |

**Why 10s and not 60s.** The current 60s read timeout means a hung service holds an edge connection for
a full minute. With N concurrent hung requests the edge exhausts its connection pool and the load
balancer stops serving *healthy* tasks too — a hung service becomes a site outage. A tight timeout
keeps the failure scoped to the failing service.

### 10.6 Rate limiting

| Path | Limit | Rationale |
|---|---|---|
| `/api/v1/auth/login`, `/register`, `/refresh` | **Aggressive** per source IP and per account | Credential stuffing and enumeration are the primary auth attack (§23.1) |
| `/api/v1/orders` (checkout) | Moderate | Scans create spurious 409s; genuinely blocks abuse |
| `/api/v1/products/*` | High | Must not throttle real browsing |
| `/diagnostics` | Very low or deny | Sensitive; authenticated access only |
| Everything else | Generous baseline | Catch-all to prevent accidental loops |

Rate limiting **at the edge** rather than in each service: it applies before any compute is consumed,
it is uniform across services, and it cannot be bypassed by hitting a service directly — because no
service is reachable directly (§4.3).

**One honest limitation:** edge rate limiting is per source IP, so it is weak against a distributed
botnet and can harm a legitimate user behind carrier NAT. Application-level limits on login attempts
per account are the complement, not a substitute.

### 10.7 Security headers

Set at the edge so all responses inherit them — including static assets, which is why HSTS moves here
(C7f: Django sets it, but `/static/` never reaches Django).

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; img-src 'self' data: https:;
  script-src 'self'; style-src 'self' 'unsafe-inline';
  connect-src 'self' https://<api-host>; frame-ancestors 'none';
  base-uri 'self'; form-action 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
X-XSS-Protection: 0        ← explicitly disabled, not merely omitted (C7h)
```

`style-src 'unsafe-inline'` is required by Tailwind's runtime behaviour and is a known, accepted
tradeoff. `script-src` has **no** `unsafe-inline` or `unsafe-eval` — that is the one that would matter.

`X-XSS-Protection: 0` is deliberate: the legacy auditor filter was removed from all modern browsers, so
the header is inert at best and a false sense of protection at worst. Disabling it explicitly is
clearer than omitting it.

### 10.8 Health checking

| Property | Value | Reason |
|---|---|---|
| Path | `/readyz` | **Never `/healthz`** — §0 C4. If the LB health check used a dependency-checking endpoint, a Redis outage would pull every task from rotation |
| Interval | 30s | §5.5 |
| Healthy threshold | 2 consecutive successes | Prevents flapping into rotation |
| Unhealthy threshold | 3 consecutive failures | Tolerates one slow response |
| Deregistration delay | **10s** | Must exceed the health interval so the LB stops sending *before* the task stops accepting (§5.8) |
| `/healthz` | Container health check only | Liveness vs readiness separation |

**The deregistration delay is a rule, not a number:** it must exceed the health check interval. With a
30s interval and 10s deregistration, traffic stops flowing 20s before the task exits. Set the delay
shorter than the interval and in-flight requests get connection-refused instead of completing.

### 10.9 No API gateway

| | |
|---|---|
| **Decision** | **No API Gateway / Lambda proxy** |
| **Why** | Its features are request transformation, authorisation aggregation, usage metering, and per-API throttling. Every one is already handled: transformation and headers at the LB (§10.4), throttling at the LB (§10.6), authorisation in each service (§23.3), metering from access logs and metrics (§11.3) |
| **Why the alternatives lose** | **ALB directly:** fewer hops, less configuration, native health gating. **Nginx/HAProxy container:** cheaper and fully capable, but the managed LB gives automatic certificate renewal, health-gated rolling deploys, and access logs without operating it |
| **Operational consequence** | No gateway to deploy, secure, patch, or cost-model. No gateway-specific IAM. One fewer component between the internet and the services |
| **Migration implication** | None. If per-route rate limiting, transformation, or backend key management ever outgrows LB capabilities, adding a gateway is an **additive** change in front of the LB — not a re-architecture |

The honest reason to revisit: an API gateway earns its place when the edge needs per-consumer
attribution, cross-service request transformation, or backend key management. None of those exist at
this scale, and adding them speculatively is precisely the "fake enterprise complexity" the mandate
warns against.

---

## 11. Observability

### 11.1 Principle

`ARCHITECTURE_REVIEW.md` §10.4 established the discipline: correlate logs, ship metrics through the
log pipeline, defer a tracing backend until a trigger fires. Infrastructure implements exactly that,
using the AWS-native mechanism that makes it nearly free.

| Signal | Transport | Backend | Why this way |
|---|---|---|---|
| **Logs** | stdout collector | CloudWatch Logs-compatible | Already the standard; log-based metric filters derive metrics *from* logs |
| **Metrics** | **Embedded Metrics Format inside the log stream** | Extracted by the log backend | **Metrics ride along with logs at zero extra cost and zero extra infrastructure.** No Prometheus server, no OTel collector |
| **Traces** | W3C `traceparent` + `trace_id` on every log line | None | §11.9 trigger-based adoption |
| **Errors** | Sentry | Managed | Already wired (`SENTRY_DSN`) |

**Embedded Metrics Format is the key decision.** It is a documented convention: a JSON log line
containing an `_aws` metadata block with a metric-dimension array is parsed by the log service and
turned into a metric. This yields CloudWatch-native metrics with **no scrape endpoint, no metrics
agent, and no aggregation tier to operate**. `ARCHITECTURE_REVIEW.md` §10.3 chose to hand-roll
Prometheus text format and noted `client_golang` as an acceptable alternative; EMF resolves that in the
infrastructure layer — the application emits one structured line and the platform turns it into a
metric. `/metrics` stays available for local development and for the Prometheus option.

### 11.2 Structured logging

| Property | Design |
|---|---|
| Format | JSON, one object per line |
| Fields always present | `timestamp`, `level`, `service`, `environment`, `correlation_id`, `trace_id` |
| Business context | `user_id`, `role`, `order_id` where applicable |
| Retention | 30 days hot, 90 days archive |
| Collection | Container stdout → collector → log service. **Never a file written by the app** |
| Secrets | **Never logged** (`ARCHITECTURE_REVIEW.md` §10.2) |

| Prohibited field | Reason |
|---|---|
| `Authorization` header | Bearer token |
| Passwords, `SECRET_KEY` | Credential material |
| Full request/response bodies | Contain PII — addresses, phone numbers |
| Raw exceptions on unauthenticated endpoints | §0 C4 |

The current `/api/health/` endpoint embeds `f"down: {str(e)}"` on an `AllowAny` route
(`apps/accounts/health_views.py`) — an unauthenticated information-disclosure surface that can leak
connection strings and hostnames. §0 C4 replaces it.

### 11.3 Metrics

EMF, emitted as part of normal logging. The metric set is `ARCHITECTURE_REVIEW.md` §10.3, unchanged —
those application decisions stand:

| Metric | Type | Used for |
|---|---|---|
| `http_requests_total` | counter | Throughput, error rate |
| `http_request_duration_seconds` | histogram | API latency p50/p95/p99 |
| `checkout_attempts_total{result}` | counter | **Checkout failure rate — the primary business alert** |
| `checkout_duration_seconds` | histogram | Checkout health |
| `outbox_unpublished_total` | gauge | **Event publishing health** |
| `outbox_publish_lag_seconds` | histogram | Relay health |
| `consumer_lag_entries` | gauge | **Consumer lag** |
| `consumer_processed_total{outcome}` | counter | Worker throughput |
| `dead_letters_total` | counter | Data loss |
| `db_pool_in_use`, `db_pool_wait_seconds` | gauge, histogram | **PgBouncer saturation** (§7.5) |
| `redis_up` | gauge | Redis health |
| `jwks_cache_age_seconds` | gauge | Key-rotation problems before they cause 401s |
| `deployment_revision` | gauge | Which task definition revision is live |
| `outbox_rows_total` | gauge | Outbox table growth |

`deployment_revision` earns its place: it is a gauge whose value is the task definition revision
currently running. During a rollback investigation, "is the previous revision actually live everywhere?"
is answered by a metric query rather than by inspecting three target groups.

**`db_pool_*` is new infrastructure-mandated instrumentation.** PgBouncer (§7.5) is a new component,
and a saturated pooler presents as application latency with no obvious cause. These metrics are the
only way to distinguish "the database is slow" from "the pool is too small."

### 11.4 Health and endpoint surface

| Endpoint | Purpose | Wired to |
|---|---|---|
| `/healthz` | Liveness. No dependencies | Container health check |
| `/readyz` | Readiness. PostgreSQL + JWKS. **Not Redis** (§0 C4) | Load balancer |
| `/metrics` | Prometheus text, for local/self-hosted scraping | Local dev; optional collector |
| `/diagnostics` | Aggregated dependency state, consumer lag, outbox depth. **Authenticated.** No raw error text | Humans |
| `/version` | Build SHA, image digest, schema version | Pipeline, smoke tests |

**`/version` earns its place.** When a deployment misbehaves, the fastest questions are "which digest is
actually running, and which schema version does it expect?" One HTTP call answers both. The pipeline
reads it during verification (§12.5).

### 11.5 What must be observable

Mapped to the mandate's list, with the specific signal for each:

| Question | Signal | Alertable |
|---|---|---|
| **API latency** | `http_request_duration_seconds` by `route` | p99 over SLO |
| **Error rate** | `http_requests_total{status=5xx}` | Yes |
| **Throughput** | `http_requests_total` rate | No — informational |
| **Checkout failures** | `checkout_attempts_total{result="rejected_*"}` | **Yes — the top alert** |
| **Stock failures** | `checkout_attempts_total{result="rejected_stock"}` | Yes, distinct threshold — a spike may be a real inventory problem |
| **Event publishing** | `outbox_unpublished_total`, `outbox_publish_lag_seconds` | **Yes** |
| **Event consumer lag** | `consumer_lag_entries` per consumer | Yes (warning) |
| **Dead letters** | `dead_letters_total` | **Yes on any increase** |
| **Worker failures** | Task-availability metric, container restarts, consumer error rate | Yes |
| **Database health** | `db_pool_in_use`, `db_pool_wait_seconds`, connection utilisation, storage | Yes |
| **Redis health** | `redis_up`, evictions, memory used, AOF rewrite status | Yes |
| **Deployment health** | `deployment_revision`, task-availability, rollout state | Yes |
| **Event health overall** | `outbox_rows_total` age vs `consumer_lag_entries` | Yes |

**The two metrics that exist because of infrastructure decisions in this document** — neither appears
in `ARCHITECTURE_REVIEW.md` §10.3, because neither PgBouncer nor a task-based runtime existed then:

| Metric | Why infrastructure added it |
|---|---|
| `db_pool_in_use` / `db_pool_wait_seconds` | A saturated PgBouncer (§7.5) presents as unexplained application latency |
| `deployment_revision` | A rolled-back deployment must be **verifiable**, not assumed |

### 11.6 Alerts

Aligned with `ARCHITECTURE_REVIEW.md` §10.5 — few alerts, each actionable, each with a named owner and a
runbook entry.

| # | Alert | Threshold | Severity | Rationale |
|---|---|---|---|---|
| 1 | **Checkout failure rate** | > 5% over 5m | **Page** | The business stopped working. The only page-worthy alert on day one |
| 2 | **Outbox unpublished growing** | > 100 rows for 5m | **Page** | Silent data drift. Nothing else surfaces this |
| 3 | **Dead letters increased** | Any increase | **Page** | Data loss has occurred |
| 4 | **Task memory saturation** | > 85% sustained | **Page** | The OOM path. Task-level limits make this visible and bounded |
| 5 | Consumer lag | > 1000 for 15m | Warn | Self-heals |
| 6 | Db pool saturation | > 90% of `pool_size` for 5m | Warn | Anticipates §7.5 exhaustion |
| 7 | p99 latency over SLO | Two consecutive windows | Warn | No SLO breach to page on yet |
| 8 | Redis memory near `maxmemory` | > 80% of 256 MB | Warn | With `noeviction`, hitting the limit means writes fail (§8.5) |
| 9 | TLS certificate expiry | < 14 days | Warn | Automatic renewal, but verify it is actually automatic |

**Deliberately not alerted:** throughput changes (informational), CPU on a burstable instance (spikes
legitimately), single-route 5xx without volume, Redis memory alone.

**Alert #8 has a specific reason.** With `noeviction`, memory exhaustion produces write failures rather
than evictions — so the outbox relay starts failing and alert #2 fires. Alert #8 exists to get ahead of
that: it is the early warning for alert #2's cause.

### 11.7 Local observability

| Signal | Floci | Production |
|---|---|---|
| Logs | Log files + `docker logs`; optional lightweight collector | CloudWatch Logs-compatible |
| Metrics | `/metrics` endpoints; local Prometheus/Grafana optional | EMF → CloudWatch metrics |
| Dashboards | Local, optional | CloudWatch dashboards |
| Alerts | Console output in the deploy pipeline | Alert destinations |

**The gap:** Floci has no alert routing, so alerts surface as pipeline output rather than a page.
Acceptable locally — a developer's machine is the observer — and why §20 lists alert delivery as an
intentional difference. The **metric definitions and thresholds are identical** across environments,
so the alert *logic* is exercised locally even when delivery is not.

### 11.8 Error tracking

| Property | Design |
|---|---|
| Tool | Sentry. Already a dependency (`sentry-sdk==2.54.0`) |
| Backend | Managed Sentry SaaS |
| Activation | `SENTRY_DSN` in the secret store. **Currently defaults to empty, so it is silently disabled** (`ARCHITECTURE_REVIEW.md` §11.2 S11) |
| Scope | Frontend + Identity + Commerce |
| Sampling | Errors 100%. **Performance sampling disabled** — §11.1's metrics cover what traces would have |
| Release tagging | Image digest, via `deployment_revision` |
| PII scrubbing | Enabled. Addresses and phone numbers must not reach a third-party error tracker |

**Error tracking in error tracking:** the current `traces_sample_rate=0.1` and
`profiles_sample_rate=0.1` enable performance monitoring for a four-service system at ~10 requests per
second. That data is collected, paid for, and never looked at. The review's §10.4 trigger-based
approach applies: **errors yes, performance sampling no**, until §11.9's triggers say otherwise.

### 11.9 Distributed tracing — triggers for adoption

**Not adopted now.** `traceparent` is propagated and `trace_id` appears on every log line
(`ARCHITECTURE_REVIEW.md` §10.4), which makes logs joinable — the capability actually needed.

| Trigger | Threshold |
|---|---|
| A synchronous inter-service call is introduced | Any |
| p99 latency breaches SLO and route-level histograms do not localise it | Two consecutive weeks |
| An intermittent failure cannot be localised from logs | Any occurrence |
| More than 10 services | Any |
| A sampling decision becomes necessary | Any |

Adopting OpenTelemetry later is cheap because `slog` already emits `trace_id` — exactly the field OTel
uses. The infrastructure prerequisite (a collector endpoint) is a deployment, not a refactor.

---

## 12. CI/CD — Production Grade

`ARCHITECTURE_REVIEW.md` §12.2 lists CI/CD as mandatory. This section replaces both existing workflows
(`ci.yml`, `cd.yml`) in full. The gaps in the current pipelines are enumerated in §0 C7.

### 12.1 Pull request CI — Tier 1 (Fast)

Runs on every PR and every push to a feature branch. GitHub-hosted runner. **No cloud required** — this
is the Fast tier from §0 C6.

| # | Job | Tool | Gate |
|---|---|---|---|
| 1 | **Terraform fmt** | `terraform fmt -check -recursive` | Block |
| 2 | **Terraform validate** | `terraform init -backend=false && terraform validate` | Block |
| 3 | **Terraform lint** | `tflint` | Block |
| 4 | **Terraform security scan** | `checkov` or `tfsec` | Block on HIGH/CRITICAL |
| 5 | **Terraform plan** | Plan against the Floci environment. **Assert on the plan, do not apply** | Block on destroy of an unguarded resource |
| 6 | **Go fmt** | `gofmt -l` | Block |
| 7 | **Go vet** | `go vet ./...` | Block |
| 8 | **Go lint** | `golangci-lint` | Block |
| 9 | **Go tests** | `go test -race ./...` | Block. **Race detector is non-negotiable** for the concurrency tests |
| 10 | **Django lint** | `flake8` + `black --check` | Block |
| 11 | **Django tests** | `pytest` against an ephemeral Postgres service | Block |
| 12 | **Frontend lint** | `eslint` | Block |
| 13 | **Frontend typecheck** | `tsc --noEmit` | Block |
| 14 | **Frontend tests** | Vitest + React Testing Library | Block |
| 15 | **Dependency scan** | OSV/Dependabot scanner for Python, JS, Go | Block on known-exploitable |
| 16 | **Secret scan** | `gitleaks` | **Block, always** |
| 17 | **Docker build validation** | Build each image, assert it starts and `/healthz` responds | Block |
| 18 | **Dockerfile lint** | Hadolint | Block on HIGH |
| 19 | **`.dockerignore` assertion** | Assert no `.env*`, `*.pem`, `*.key`, `terraform.tfstate*` in the built image | **Block** — §6.5 |
| 20 | **Digest-pinning assertion** | Assert no task definition contains a tag without `@sha256:` | Block — §6.3 |
| 21 | **Migration lint** | Assert no `DROP`/`RENAME` in a migration without a matching expand/contract pair (§16.4) | Warn |
| 22 | **FK boundary assertion** | Assert no `commerce` migration declares an FK into `catalog` or `identity` | **Block** — §4.4 of the review |
| 23 | **Playwright config check** | Typecheck the suite and list tests without running them | Block |
| 24 | **Contract tests** | Event schemas, JWT claim shape, error shapes | Block |
| 25 | **Decision guard** | Assert `sneakin:events` appears nowhere in the repository; the only stream-key literal under `infra/`, `deploy/`, and `scripts/` is `sneakin:${env}:events`; `default_query_exec_mode=exec` is present in every assembled DSN; `QueryExecModeDescribeExec` and `pgxpool` are absent | Block — ADR-0001, ADR-0003 |
| 26 | **Module tree check** | Assert every module directory named in §3.1 exists under `infra/terraform/modules/` | Block — ADR-0002 |

**Jobs 25 and 26 make three recorded decisions executable.** §7.5's mitigation, §8.2's stream key, and
§3.1's module layout are each stated in exactly one place now, and each is checked. Without them the
documents would drift silently, because nothing else in the pipeline reads them.

**Jobs 19, 20, and 22 deserve emphasis** — they are the controls that make the *architectural*
decisions enforceable rather than aspirational:

| Job | Enforces | Consequence of absence |
|---|---|---|
| 19 | No secrets in image layers | The single most common container vulnerability, and invisible in code review |
| 20 | Digest pinning | Promotion stops being reproducible (§6.9). A mutable tag in production makes staging verification meaningless |
| 22 | No cross-service FKs | The five-database model silently erodes. One well-meaning FK reintroduces the coupling §4.1 exists to prevent |

**Job 5 deserves explanation.** A `terraform plan` on every PR catches the most expensive class of
infrastructure mistake — an unintended destroy — while it is still a comment. It does not apply, so it
cannot break anything. Asserting on it (specifically: fail if any resource is destroyed without an
explicit `prevent_destroy` or a matching replacement in the diff) turns "someone deleted the database"
from a production incident into a failed pull request.

**Parallelism and speed.** Jobs run in parallel groups by language so total wall time is bounded by the
slowest group, not the sum. Target: **under 8 minutes.** The Go race-enabled tests and the Playwright
smoke set are the expected long poles.

### 12.2 Build pipeline — after merge

Runs once per merge to `main`. **This is the only place images are built** (§6.9).

| Step | Action |
|---|---|
| 1 | Resolve the commit SHA. This is the image identity |
| 2 | For each service: build multi-stage, reproducible image |
| 3 | Generate **SBOM from the image** (§6.7) |
| 4 | Vulnerability scan the image. **Block on CRITICAL** (§6.6) |
| 5 | Generate **provenance attestation** binding digest → commit → builder (§6.8) |
| 6 | Push to `dev/<service>:<sha>` |
| 7 | **Record the digest** — the artifact of record for the whole pipeline |
| 8 | Push the digest manifest to the artifact bucket |

| Property | Value | Reason |
|---|---|---|
| Build count | **One per commit, total** | Not per environment. Not per environment-branch combination |
| Trigger | Merge to `main` | Not a tag. Tags are for releases, and the pipeline promotes by digest regardless |
| Digest recording | Mandatory | Without a recorded digest, "rollback" has no target (§6.10) |
| Provenance | Enabled | Cheap; makes promotion verifiable |
| Signing | Deferred (§6.8) | Named trigger, not an omission |
| Frontend build | The SPA bundle is a build artifact, uploaded to object storage with hashed filenames | C3: it is served as static content |

**The frontend is built once and uploaded as content, not baked into an image.** It has no server-side
component, so an image would add a deployment unit for no reason.

### 12.3 Deployment pipeline — Tier 2

Self-hosted runner with Floci (§19.2).

```
  1. Acquire OIDC / short-lived credentials          §9.6 / §19.3
  2. terraform plan  (assert the diff is expected)  §12.6
  3. terraform apply (only if infrastructure changed)
  4. Upload SPA bundle to object storage            (immutable filenames)
  5. Run migration tasks                            §16.2 — BEFORE service update
  6. Update services, one at a time                 §15.6
  7. Readiness gate                                  §12.5
  8. Smoke tests                                     §14.6
  9. System integration tests                       §14.4
 10. Playwright E2E                                  §13
 11. Verify /version reports the expected digest    §11.4
 12. Publish the release manifest                    §6.11
 13. On any failure after step 6: auto-rollback      §12.7
```

**Step 5 before step 6 is the reordering that fixes C7k.** `cd.yml` today runs `up -d` and *then*
`migrate`, which means the new code is live before its schema exists. Every window between those two
commands is a window of incompatible application/database versions.

### 12.4 Environment promotion

```
        development                    staging                    production
        (Floci, CI env)                (Floci, persistent)        (real AWS)
             │                             │                          │
  build ─────┼── digest sha256:9f2c1a ───────┼──────────────────────────┤
             │                             │                          │
             ▼                             ▼                          ▼
        deploy + E2E              deploy + E2E               approval gate
                                                          deploy + smoke
```

| Rule | Value |
|---|---|
| Promotion unit | **The digest.** Never a rebuild (§6.9) |
| Promotion mechanism | Copy the digest between registry paths, then update the service to reference it |
| Digest verification | CI asserts the staging and production digests are **identical**. A mismatch fails the promotion |
| Staging gate | Full E2E green |
| **Production gate** | E2E on staging green **+** manual approval |
| Production health gate | Smoke tests (§12.5). E2E against production is **not** run as a gate |
| Approval | GitHub **protected environment** with required reviewers |
| Concurrency | `concurrency: { group: deploy-<env>, cancel-in-progress: false }` |
| Failed staging | Roll back staging. Production is untouched |
| Failed production | **Automatic rollback** (§12.7), then a human investigation |

**Running Playwright against production is not a gate.** Production tests mutate real data — they place
orders, cancel orders, and adjust stock. Using production as a test environment would generate
false-positive alerts, contaminate reporting rollups, and risk a real customer's cart. **The test
matrix runs against staging, which is architecturally identical** (§20). That equivalence is precisely
why staging exists.

**`cancel-in-progress: false` is a correctness decision.** With `true`, a new push would cancel an
in-flight production deployment — potentially midway through a service update, leaving the fleet at
mixed revisions. Serialised, cancellable production deploys produce inconsistent states.

### 12.5 Readiness gate and smoke tests

Replaces `cd.yml`'s `sleep 15` + single `curl` (C7l).

```
for service in catalog commerce identity workers:
    poll /readyz every 5s, up to 180s
    require 200 and body.healthy == true
    require /version reports the expected digest
all four pass → gate open
any fails after timeout → rollback
```

| Check | Value | Rationale |
|---|---|---|
| Poll interval | 5s | Fast enough to be quick, slow enough not to hammer |
| Timeout | 180s | Django's first start includes migrations + static manifest |
| **Verification, not just liveness** | Assert the response body | A `/readyz` that returns 200 with an unhealthy body is a bug worth catching here |
| **Digest assertion** | `/version` returns the expected SHA | This is what makes "the deploy succeeded" mean the *right* build is live |
| `workers` verification | Outbox lag decreasing, consumer groups exist | Workers have no `/readyz` (§5.5) — verify them functionally |

**The digest assertion is what distinguishes a real verification from a hopeful one.** A 200 from
`/readyz` proves *a* healthy task exists, not that *this* build is running. During a bad rollout — where
some tasks are old and some are new — only the digest tells you which.

### 12.6 Terraform CI/CD

```
  fmt  →  validate  →  lint  →  security scan  →  plan  →  review  →  apply
```

| Environment | `apply` authorisation |
|---|---|
| Pull request | **Never.** Plan only, plus the assert job in §12.1 job 5 |
| `main` → Floci | Automatic. Idempotent; a no-op if nothing changed |
| Staging | Automatic after merge, or manual. Recommended manual on first touch |
| **Production** | **Manual approval, mandatory.** Separate role (`github-production-terraform`, §9.6) |

| Control | Reason |
|---|---|
| **No infrastructure change from an arbitrary branch** | Terraform applies only from `main`, and production requires a protected environment. A PR branch cannot apply |
| `plan` output as a PR comment | Review the actual diff, not "approve the plan" |
| **Reviewers for `infra/terraform/**`** | CODEOWNERS (§23.8). Infrastructure changes get domain-owner review |
| `prevent_destroy` on stateful resources | The database, the state bucket, and the production VPC |
| State locking | DynamoDB lock table in S3-backed environments |
| Drift detection | Scheduled job comparing live state to the last applied state. Alert on drift, never auto-apply |
| **Production apply uses a different role than production app deploy** | §9.6. A compromised CI token can roll back an application; it cannot change the network or the database |

**Scheduled drift detection is a genuine control, not a nicety.** Without it, a console change or a
failed cleanup job leaves the infrastructure different from its definition indefinitely, and the next
`apply` silently reverts it.

### 12.7 Rollback

| Aspect | Design |
|---|---|
| Trigger | Health gate failure, smoke test failure, or an alarm breach within the observation window |
| Who | Automated. No human decision required to roll back |
| Action | Update each service to the previous task definition revision (§6.10) |
| Blast radius | The services updated in this deployment. Services not yet updated are untouched |
| Time | ~2 minutes |
| Database | **Not touched.** Guaranteed by expand/contract (§16.4) |
| Frontend | Re-point the SPA static index to the previous bundle version |
| Terraform | **Not rolled back** by an application failure. Infrastructure and application rollbacks are separate concerns; a failed app deploy is not evidence of bad infrastructure |
| Verification | Re-run the readiness gate and smoke tests against the restored revision (§12.5) |
| Notification | Always, on completion, success or failure |

**Why rollback is automated.** A human deciding whether to roll back during an incident is making the
decision with the least information at the worst moment. The rollback here is unconditional and safe
(schema-compatible, prior digest known), so it is automated; the *investigation* is what requires a
human, and that happens after the system is stable.

**Roll-forward remains the right answer when the new version is only slightly wrong and a known fix
exists.** Rollback is the right answer when the new version's behaviour is unknown or
data-affecting. The automated default is rollback, because "unknown" is the more common failure mode at
this stage.

### 12.8 Workflow security controls

Every one of these addresses a specific control in §23, not a generic hardening wish.

| Control | Replaces / addresses | Reason |
|---|---|---|
| **Pin every action to a commit SHA** | C7o: `actions/checkout@v4` is mutable | A tag can be repointed to malicious code. A SHA cannot |
| **`permissions:` block per job, defaulting to `contents: read`** | C7n: no permissions block | Default token permissions may be broader than needed |
| `id-token: write` **only** on jobs that use OIDC | Least privilege | Grants the ability to mint cloud tokens. Not a default |
| **Protected branches** | Required status checks | Prevents direct pushes to `main` |
| **Required status checks** on `main` | §12.1 | Prevents merging red CI |
| **CODEOWNERS** for `infra/terraform/**`, `.github/workflows/**` | §12.6 | Infrastructure and pipeline changes get domain-owner review |
| **Secret scanning + push protection** | C7i | Blocks a known credential format at push time |
| `pull_request` + `pull_request_target` used correctly | Security | Secrets are never exposed to fork PRs |
| **No `pull_request_target` with checkout of PR code** | Critical | The classic GitHub Actions supply-chain vulnerability |
| Dependency review on PRs | New dependency risk | Catches a malicious or vulnerable addition at review time |
| Artifact retention limits | Cost and hygiene | Test artifacts are useful for days, not forever |

**The `pull_request_target` rule is the one that matters most in practice.** Checking out untrusted PR
code in a privileged context is the most exploited GitHub Actions vulnerability. The design is: fork PRs
get Tier 1 (Fast) CI with a read-only token and no secrets, by definition.

---

## 13. Playwright E2E

### 13.1 Status

`ARCHITECTURE_REVIEW.md` §12.7 called for Playwright and the frontend has **no test script at all**
(`package.json` has `dev`, `build`, `lint`, `preview` — C7p). This section establishes it as a
first-class part of the testing architecture, not an optional frontend tool.

### 13.2 Principle

> **Playwright drives a browser against the deployed system's public edge.** It exercises the complete
> path: browser → edge → services → PostgreSQL/Redis/workers → response.

```
  Browser
     ↓  HTTPS
  Edge (TLS, routing, headers, rate limits — all real)
     ↓  private HTTP
  Services (real tasks, real images, real digests)
     ↓
  PgBouncer → PostgreSQL        Redis Streams → workers
     ↓
  Result
```

| Never mocked in E2E | Reason |
|---|---|
| The backend services | The test would assert that the mock behaves as configured, which proves nothing about the system |
| Authentication | A fake login bypasses exactly the code most worth testing (§23.3) |
| Database state | Order creation, stock decrement, and outbox rows are the *subject* of the assertions |
| Redis | Consumer lag and event delivery are part of what is being verified |
| The edge | Rate limiting and header handling are real behaviour worth testing |

Mocks are appropriate at the *unit* level (§14.1) and nowhere in this section. The one legitimate
exception is third-party payment and email providers, which cannot be exercised in CI — those are
stubbed at the **network** boundary via a local responder, and the tests that use them are marked so
their coverage claim is honest.

### 13.3 Test categories

| Category | Count (target) | Representative tests |
|---|---|---|
| **Authentication** | 8 | Register → verify → login; login with wrong password; refresh token rotation; expired token → refresh → retry succeeds; logout → token rejected; **cross-user access → 404 not 403**; admin login; rate limit on repeated failures |
| **Catalog browsing** | 6 | Product list renders; pagination; category filter; subcategory filter; search; **out-of-stock product still browsable** |
| **Product details** | 5 | Detail page shows price, images, sizes; size selection persists across navigation; **price change is reflected after the `PriceChanged` event**; unavailable sizes are marked; add-to-cart |
| **Cart** | 8 | Add item; quantity change; remove item; **totals match the snapshot, not a live price**; cart persists across sessions; concurrent add does not duplicate; empty cart checkout blocked; cart survives navigation |
| **Wishlist** | 5 | Add; remove; persists across sessions; item shown after a price change; **a deleted product does not break the wishlist page** |
| **Checkout** | 9 | Happy path order creation; **insufficient stock → clean error, cart intact**; empty cart blocked; **rapid double-submit → exactly one order**; **network retry with the same idempotency key → one order**; address validation; payment method selection; order confirmation page |
| **Order creation (as admin)** | 6 | Order appears in admin list; correct totals; correct line items; correct status; **stock decremented by the right quantity**; customer notification created |
| **Order state changes** | 8 | pending → confirmed → shipped → delivered; **illegal transition rejected**; customer cancel from pending; **cancel restores stock exactly once**; admin cancel with reason; delivered order cannot be cancelled; **cancelled order releases stock once even if cancel is clicked repeatedly**; status change notifies the customer |
| **Failure scenarios** | 6 | 5xx shows an error state not a blank page; API down → error boundary; slow API → loading state then success; **stale price shows the updated total**; Redis unreachable → **checkout still succeeds**; empty search result |

**Total: ~61 tests.** That is a deliberate number, not an aspiration. `ARCHITECTURE_REVIEW.md` §12.8
warned against a 100% coverage target, and the same discipline applies here: **each test must correspond
to a user workflow or an architectural invariant.** A 61-test suite where every test traces to a row in
the categories above is worth more than a 400-test suite that mostly re-asserts the same paths.

**The four bolded tests are the highest-value ones in the entire suite.** They correspond directly to
R §12.4's concurrency tests and R §3.12's failure scenarios — the behaviours that
were previously verified by reading code and are now verified by running the system:

| Test | Verifies |
|---|---|
| Rapid double-submit → one order | The idempotency key (§3.8). C2 in §12.4 |
| Retry with same key → one order | Idempotency under network failure |
| Cancel restores stock exactly once | `stock_released(order_id UNIQUE)` (§3.11). C3 in §12.4 |
| Redis unreachable → checkout succeeds | **The infrastructure invariant of §8.6.** The single most important assertion in this document |

### 13.4 Execution

| Property | Local | CI / post-deploy |
|---|---|---|
| Target | The developer's Floci environment, via the local edge | The CI Floci environment, via its edge. **Staging for promotion** |
| URL | From Terraform output (`edge_https_url`) | Same. Never hardcoded |
| Data reset | `make reset-data` — truncate and reseed | Per-run unique database (§19.1) |
| Auth strategy | Seeded users with known credentials, via a seeding endpoint or fixture | Same |
| Browser matrix | **Chromium only** | **Chromium only** |
| Parallelism | 4 workers | 4–6 workers, one per service container's spare capacity |
| Retries | **0** | **0 for the four bolded tests. 1 for others** |
| Timeout per test | 30s | 30s |
| Expect timeout | 5s | 5s |
| Action timeout | 10s | 10s |
| `fullyParallel` | Yes, per file | Yes |

**Chromium only — with reasoning, since the mandate asks not to run a massive browser matrix
unnecessarily.**

| Factor | Assessment |
|---|---|
| Browsers exercised | Chromium covers the layout, network, and storage APIs this SPA uses |
| What multi-browser testing would catch | Browser-specific CSS and rendering differences |
| Do the differences matter here? | Tailwind utility CSS with a standard build; no browser-specific APIs; `formik`/`yup`/`react-chartjs` are cross-browser by design |
| Cost of a full matrix | 3× the runner time and 3× the flake surface, for a store with no browser-specific risk |
| When to expand | A customer-facing complaint about a specific browser, or a deliberate decision to support a browser that differs behaviourally |

**Retries are zero for the concurrency and Redis-failure tests, and that is the important decision.**
Playwright retries exist to absorb flakiness. But a test asserting "rapid double-submit creates exactly
one order" or "checkout succeeds while Redis is down" is asserting the absence of a race and the
absence of a coupling. **Retrying such a test destroys the assertion** — a system that fails the race
half the time passes the test on retry. So those four tests run once, and a failure is a real failure.

### 13.5 Test data strategy

| Concern | Design |
|---|---|
| **Reset strategy** | Truncate all tables, then reseed from a fixture set. **Not** migrations-then-drop-database — slower and it hides real schema problems |
| Seed determinism | Fixed product IDs and sizes so assertions can reference known values |
| Seed size | ~20 products, 3 categories, 3 brands, 5 users (1 admin, 4 customers), 2 carts with contents |
| Test isolation | Each test creates its own user via the registration flow, or uses a per-test reserved user from a pool |
| **Concurrency tests** | Dedicated fixture: a product with **exactly 1 unit** of stock in a known size. Never a random product — the test requires an exact initial state |
| Auth | Registration creates a real user; no session or token fabrication |
| Admin | A seeded admin with a known password. Created by the seed, not by a fixture that bypasses the real creation path |
| **Isolation between parallel workers** | Each worker gets a distinct user and cart. **Distinct stock** for any test that mutates inventory |

**The last row is a hard requirement, not a nicety.** Two parallel workers using the same product would
make the concurrency tests fail intermittently for reasons unrelated to the system under test. Tests
that assert on stock must own it exclusively.

### 13.6 Artifacts

| Artifact | On failure | Retention |
|---|---|---|
| **Trace** | Always | 14 days |
| Screenshot (failure only) | Yes | 14 days |
| **Video** | Failure only, or always for checkout/Redis-failure tests | 14 days |
| Console log | Always | 14 days |
| Network HAR | **Checkout and failure-scenario tests only** | 14 days |
| Playwright HTML report | Always | 14 days |
| Correlation IDs extracted from the run | Always | 90 days |
| Seed data snapshot | Always | 7 days |

**Trace "always" is correct even on pass**, because the most useful question after a flaky pass is
"what was actually different about that run?" Tracing only failures loses exactly the data needed to
diagnose intermittent behaviour.

**Correlation IDs are the bridge to the rest of the platform.** The E2E suite captures the
`X-Request-ID` from each request and records it in the report. A test failure then points at the exact
log lines and event payloads for that request across all four services and the workers — which is why
§10.4 puts `X-Request-ID` generation at the edge.

### 13.7 Where Playwright runs

| Stage | Environment | Gate | Notes |
|---|---|---|---|
| **Locally** | Developer's Floci | Manual | `make e2e`. The inner development loop |
| **On PR** | **Not run** | — | Would require a full environment per PR; §0 C6. The config typechecks and the suite lists, which catches a broken spec immediately |
| **Post-deploy, Floci** | CI Floci environment | **Blocking** | §12.3 step 10. Runs against the real deployed digests |
| **Staging** | Staging environment | **Blocking for promotion** | §12.4 |
| **Production** | **Not run as a gate** | — | §12.4. Production tests would create real orders and contaminate rollups |
| **Nightly** | Dedicated Floci environment | Non-blocking | Full suite plus chaos tests (§14.5) |

**Why not on every PR.** Each PR would need a provisioned environment with images built, five databases
migrated, and a worker fleet warmed — several minutes of infrastructure work per PR for tests that would
report on a build the PR has not been merged into. The blocking post-merge run catches the same
regressions with far better signal, because it runs against the exact digests that will be promoted.

**Why not against production.** §12.4: production tests mutate production data. The cost is real
contamination; the benefit is zero, because staging is architecturally identical.

---

## 14. Testing Pyramid

### 14.1 Shape

```
                        ╱╲
                       ╱  ╲           Playwright E2E          ~61 tests
                      ╱    ╲          browser → edge → system   8 min
                     ╱──────╲         BLOCKS DEPLOYMENT
                    ╱        ╲
                   ╱ System   ╲       integration + contract  ~55 tests
                  ╱ integration╲      real Postgres, real HTTP  2 min
                 ╱──────────────╲     BLOCKS DEPLOYMENT
                ╱                ╲
               ╱   Service        ╲  Go/Django + real datastores ~180 tests
              ╱    integration     ╲ per-package, real SQL       90 s
             ╱──────────────────────╲   BLOCKS MERGE
            ╱                        ╲
           ╱   Unit + contract         ╲ pure logic, no I/O      ~450 tests
          ╱                            ╲                          25 s
         ╱──────────────────────────────╲ BLOCKS MERGE
        ╱                                 ╲
       ╱          Smoke (post-deploy)      ╲   3 assertions     10 s
      ╱____________________________________╲  BLOCKS DEPLOYMENT
```

| Level | Count | Time | Gate | Placement |
|---|---|---|---|---|
| Unit | ~450 | 25 s | Merge | Every PR |
| Contract | ~40 | 5 s | Merge | Every PR |
| Service integration | ~180 | 90 s | Merge | Every PR |
| System integration | ~55 | 2 min | **Deploy** | Post-merge |
| Playwright E2E | ~61 | 8 min | **Deploy** / promotion | Post-merge, staging |
| Smoke | 3 | 10 s | **Deploy** | Post-deploy |
| Chaos | ~6 | 20 min | Nightly | Scheduled |

**The counts are the point.** ~700 tests below E2E against ~61 above it — roughly 11:1. That ratio is
what keeps feedback fast. `ARCHITECTURE_REVIEW.md` §14's guidance ("do not push everything into E2E
tests") is expressed here as a number, because a number can be checked in review.

### 14.2 Unit

| Scope | Example |
|---|---|
| Order state machine | Every allowed transition passes; every illegal transition is rejected (`ARCHITECTURE_REVIEW.md` §3.7) |
| Price and total calculation | Rounding, discounts, empty cart |
| Idempotency key derivation and comparison | Same key + same body → replay; same key + different body → 422 |
| Event envelope construction | Field presence, schema version, `correlation_id` propagation |
| JWT role extraction | `role` present, `typ` verified, bad signature rejected |
| Request validation | Schema validation per endpoint |

**No I/O. No database. No HTTP.** Runs in milliseconds, runs on every save. These are the tests that
catch a logic error before it ever reaches a build.

### 14.3 Service integration

| Scope | Example |
|---|---|
| **The checkout transaction** | Every branch of §3.4 against **real PostgreSQL** |
| Stock decrement correctness | Conditional update, `rowcount` handling |
| Outbox row written in the same transaction | Assert both committed together |
| Migration up/down | Each migration applies to a clean database and to a populated one |
| Repository queries | Ownership filters (§6.3 of the review) |
| Error mapping | Domain error → HTTP status |

**Real PostgreSQL, never a mocked driver.** Mocking `SELECT … FOR UPDATE` or `ON CONFLICT` tests the
mock, not the code. `ARCHITECTURE_REVIEW.md` §12.3 reached the same conclusion: this system is 4–6 SQL
statements per endpoint, so a testcontainer or local Postgres is affordable and catches constraint
violations, isolation-level surprises, and transaction semantics that no mock will.

### 14.4 Contract

| Contract | Asserts |
|---|---|
| Event schemas | Every emitted event conforms to its versioned schema. A consumer can parse it |
| JWT claim shape | `iss`, `aud`, `sub`, `role`, `typ`, `kid`, `exp` present and correct |
| API error shape | One JSON error shape for every endpoint, across all four services |
| HTTP status codes | The same condition yields the same status in every service |
| **Cross-service consistency** | A fixture set of events that every consumer must handle identically |

**The event schema contract test is the one that prevents a whole class of outage.** If `commerce`
emits `OrderPlaced.v2` with a renamed field and `workers` is built against v1, the contract test fails
at build time rather than as silently mis-parsed events in production.

### 14.5 System integration and chaos

| Test | Simulates | Asserts |
|---|---|---|
| Full checkout against the deployed stack | — | Order, stock, outbox row, and consumer effect all correct |
| **Redis unavailable** | Stop Redis | **Checkout succeeds.** The outbox backlog grows. No restart loop (§8.6) |
| **Redis wiped** | Flush and restart | Outbox replay restores event flow. No lost events (§8.7) |
| Consumer crash mid-batch | Kill a worker | Unacked entries redelivered. `processed_events` prevents duplicates |
| PostgreSQL unavailable | Stop the database | `/readyz` fails, tasks leave rotation, **no connection storm** |
| Migration failure | Inject a failing migration | Deployment stops before the service update (§16.6) |

These are `ARCHITECTURE_REVIEW.md` §12.5's X1–X4 plus deployment-specific cases, run nightly rather than
per-PR because they destroy state.

### 14.6 Smoke tests

Three assertions, run immediately after every deployment, before E2E:

| # | Assertion | Detects |
|---|---|---|
| 1 | `/api/v1/products` returns 200 with a non-empty list | The edge, routing, `catalog`, and PostgreSQL are all functional |
| 2 | `/healthz` and `/readyz` return 200 on all four services | Every task is alive and ready |
| 3 | `/version` reports the expected digest on all four services | **The right build is live** |

**Why smoke before E2E.** Smoke takes 10 seconds and answers "is this deployment fundamentally
functional". Running it first means an obviously broken deployment fails in 10 seconds rather than after
8 minutes of E2E. The third assertion is what makes smoke a *deployment* verification rather than a
liveness check (§12.5).

---

## 15. Deployment Strategy

### 15.1 Chosen strategy

> **Rolling deployment, with an automated health gate that reverts to the previous task definition
> revision on failure.** One service at a time. Deployment sequence: migrations → commerce → catalog →
> identity → workers → frontend.

### 15.2 Options evaluated

| Strategy | Mechanism | Zero downtime | Rollback speed | Capacity cost | Complexity | Verdict |
|---|---|---|---|---|---|---|
| **Rolling** | Replace tasks in batches | Yes | ~2 min | ~1.2× peak | Low | **Chosen** |
| Blue/green | Two full environments, switch traffic | Yes | ~30 s (switch back) | **2×** | Medium | Rejected — 2× capacity for a system where a rollback is already 2 minutes |
| Canary | Small traffic %, analyse, then ramp | Yes | ~2 min | ~1.05× | **High** | Rejected — see below |
| Recreate | Stop, replace | **No** | N/A | 1× | Trivial | Rejected — outage on every deploy |

**Why not blue/green.** Its advantage is rollback speed: switching back is a traffic change, not a
rollout. But the rollback it optimises is already fast — reverting to a previous task definition takes
~2 minutes (§12.7), because the platform retains task definition revisions and the image still exists
in the registry (§6.3, 90-day retention). **Buying 28 minutes of rollback speed with a permanent 2×
capacity cost is the wrong trade for this system.** Blue/green earns its cost when rollback must be
instant, or when the schema has changed in a way that makes rollback unsafe — and the second condition
is better solved by §16's expand/contract discipline than by doubling the fleet.

**Why not canary.** Canary analysis requires deciding what "worse" means and acting on it automatically.
At 10 requests/second and ~500 orders/day, a 10% canary receives roughly 1 request/second. That is not
enough traffic to distinguish a real regression from noise within a reasonable analysis window — the
analysis would either be statistically meaningless or take hours. **Canary requires enough traffic to
make a decision, and this system does not have it.** The mechanism becomes theatre: a rollout that
proceeds anyway because the signal is too weak, at the cost of significant pipeline complexity.

Canary becomes correct when traffic justifies it. The trigger is concrete: sustained >100 requests per
second to a single service, or a deployment where rollback is genuinely unsafe.

**Why rolling works here.** It requires the properties this architecture already has:

| Requirement | Satisfied by |
|---|---|
| Services are stateless | `ARCHITECTURE_REVIEW.md` §5.5. No host-local state persists between tasks |
| Old and new versions coexist safely | §16's expand/contract discipline |
| Health gating per task | `/readyz` excluding Redis (§0 C4) |
| Graceful shutdown | 10s deregistration + 20s drain + 40s grace (§5.8) |
| Previous image retained | 90 days production (§6.9) |
| Services are independently deployable | Zero synchronous service-to-service calls (§4.4) |

**The last row is what makes rolling particularly safe here.** Because no service calls another, rolling
`commerce` cannot break `catalog` — there is no version compatibility between services to manage. In a
system with synchronous cross-service calls, a rolling deployment creates a period where version N of one
service talks to version N-1 of another, and that compatibility matrix is a substantial source of
production incidents. **The zero-synchronous-calls decision eliminates an entire deployment failure
class.**

### 15.3 Deployment gates

Each gate must pass before the next stage. A failure at any gate triggers rollback (§12.7).

```
  migrate (expand only)
      │  exit 0
      ▼
  update service → tasks become ready one by one (/readyz)
      │  all tasks ready
      ▼
  digest verification (/version == expected)
      │
      ▼
  smoke tests (3 assertions, 10 s)
      │
      ▼
  observation window (5 min)
      │  no alarm breach: error rate, latency, checkout failures
      ▼
  next service
```

| Gate | Threshold | Rationale |
|---|---|---|
| Readiness | All tasks ready within 180s | §12.5 |
| Digest | `/version` matches on every task | §12.5. The right build must be live |
| Smoke | 3 assertions pass | §14.6 |
| Observation | 5 min, no alert breach | §11.6. Catches failures that appear only under real traffic |

**The 5-minute observation window is why deployments are sequential.** Total deployment time for five
services plus frontend is roughly 30 minutes. That is a real cost, accepted because a failed deployment
is recovered automatically while a successful one is verified before the next service is touched.
`ARCHITECTURE_REVIEW.md` §7.4 required sequential deploys for the same reason.

### 15.4 Migration compatibility

| Requirement | How it is met |
|---|---|
| Migrations run **before** the service update | §12.3 step 5. Fixes C7k |
| Migrations are **expand/contract** only | §16.4 |
| The application tolerates both old and new schema during rollout | Inherent to expand/contract |
| Rollback does not touch the schema | §6.10, §16.5 |

### 15.5 Zero downtime

| Concern | Mechanism |
|---|---|
| New tasks start while old serve | Rolling. Old tasks deregister on SIGTERM (§5.8) |
| Connections dropped mid-request | 10s deregistration delay before shutdown (§10.8) |
| Schema change visible before code change | Migrations are additive (§16.4) |
| Capacity during rollout | ~1.2× steady state (§5.6 fits within the autoscaling range) |
| Frontend asset mismatch | Hashed filenames; `index.html` references only assets that exist. Old index keeps working until the new one is served |

### 15.6 Sequence and rationale for the order

| Order | Component | Rationale |
|---|---|---|
| 1 | Migrations (expand) | Must precede any code that depends on the new schema |
| 2 | **`commerce`** | **First, deliberately.** It contains the critical path (checkout) and the events every other service consumes. Getting it right first means a downstream service never sees an incompatible event |
| 3 | `catalog` | Read-mostly. A catalog regression is visible but not destructive |
| 4 | `identity` | Its schema changes least. Its **JWKS** is a prerequisite for the others, so a JWKS problem surfaces early |
| 5 | `workers` | **Last among services.** A new worker must be able to parse every event the already-deployed producers emit — deploying producers first guarantees this |
| 6 | Frontend | Last. A frontend failure is cosmetic; a backend failure is not |

**Deploying producers before consumers is the key ordering rule.** If `workers` were deployed first, it
would consume events from a *newer* `commerce` it had not been built against, and an event schema
mismatch would surface as mis-parsed events in production. This ordering makes that impossible for
additive changes, and the contract tests (§14.4) catch the rest at build time.

### 15.7 Failed deployment recovery

| Situation | Recovery |
|---|---|
| Migration fails | Deploy stops. Services untouched (§16.6) |
| Service fails to become ready | Rollback that service to the previous revision |
| Smoke fails | Rollback |
| Alarm breaches in the observation window | Rollback automatically |
| **Multiple services fail** | Roll back in reverse order. Each is independent, so reverse order restores consistency |
| Rollback itself fails | Freeze: scale the failed service to zero, route 100% to the previous stable revision fleet, escalate |
| Frontend deploy fails | Re-point the SPA index to the previous bundle. Backend untouched |
| Post-deploy discovery of a problem (hours later) | §17.13. Manual or automated rollback |

**The freeze fallback matters.** If rollback fails — a broken previous revision, a corrupted state — the
correct move is to stop the bleeding rather than retry blindly. Scaling to zero and routing to the last
known-good fleet trades a partial outage for a controlled one.

---

## 16. Database Migration Deployment

This section exists because C7k identified a real ordering defect in the current pipeline: `cd.yml` runs
`up -d` **before** `migrate`, so the new code is live before its schema exists.

### 16.1 Ownership

| Rule | Detail |
|---|---|
| One owner per schema | The service that owns the database (§7.6) |
| Migrations are code | Versioned in git, reviewed in PR, applied exactly as written |
| Plain `.sql` for Go services | `ARCHITECTURE_REVIEW.md` §9.5. No migration framework |
| Django `migrate` for Identity | Existing tooling |
| A migration is never edited after merge | Once applied anywhere, it is immutable. Corrections are new migrations |
| Every migration is re-runnable | `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`. A partially-applied migration must be resumable |
| Terraform creates the empty database and its role; the pipeline applies the schema | §3.4 |

### 16.2 Execution model

> **Migrations execute as a one-off task, before the service update. Not at container start. Not in
> Terraform.**

| Aspect | Decision | Reason |
|---|---|---|
| Trigger | Pipeline stage, explicitly between `apply` and the service update | C7k's ordering defect, fixed |
| Mechanism | A one-off task running the same image as the service | **Same image, same migration tool.** The task is guaranteed compatible with the schema it expects |
| Ordering across services | `identity` first (others need its JWKS). The remaining four in parallel | §7.6 |
| Success criteria | Exit code 0 **and** a schema-version assertion | A tool exiting 0 while the schema is wrong is possible |
| Failure | **Deploy stops immediately.** The service is not updated | §16.6 |
| Concurrency protection | Advisory lock per database | Two concurrent migration tasks must not run |

**Why not at container start.** `ARCHITECTURE_REVIEW.md` §3.4's approach. The problems are specific:

| Problem | Consequence |
|---|---|
| **N tasks start, N migrations run** | With 4 replicas, 4 concurrent migration attempts against the same schema |
| **No ordering guarantee** | A task may fail its readiness check *because* the migration has not run yet, and the orchestration health-gate may kill and restart it mid-migration |
| **Failure is invisible** | The task reports healthy, the migration failed, and the service runs against a wrong schema |
| **Rolling deployments re-run it** | Every rollout repeats migration, turning a one-time operation into a continuous one |
| **No gate** | The migration outcome cannot fail the deployment, because the deployment already succeeded |

The migration task resolves all five: one task, ordered, gated, and separate from the service lifecycle.

### 16.3 Connection handling

| Caller | Path | Reason |
|---|---|---|
| Application tasks (all four services) | **PgBouncer**, `pool_mode = transaction` | §7.5. The pooler is the only application path to PostgreSQL |
| Migration task | **Direct connection, bypassing PgBouncer**, as `sneakin_migrate` | DDL under a transaction pooler is fragile: session-scoped operations (`SET`, advisory locks, some `CREATE INDEX CONCURRENTLY` forms) misbehave when the session holding them can be handed back and reassigned mid-transaction |
| Break-glass admin | Direct connection, as `sneakin_admin` | Operational queries that must not queue behind application traffic |

**Migrations bypassing PgBouncer is a deliberate exception to §4.3's "database reachable only through
the pooler," and it is named here so the security-group rule can encode it.** The rule is scoped to the
migration role's security group, which reaches PostgreSQL on 5432 directly while every application
service group reaches only `pgbouncer-sg` on 6432. A migration is a trusted, once-per-deploy,
operator-initiated action — not an application connection — and it needs a session whose lifetime it
controls. **An undocumented exception to a stated rule is how a network policy erodes**, so the exception
is a first-class entry in the `postgres-sg` rule set rather than a broad allowance.

Note that the migration task holds one credential with DDL on all five databases (§7.3). It is the one
role that legitimately spans every database, because a schema change spanning two services must be
orderable against both in a single task — see §16.2's reasoning for why one task, not one per database.

### 16.4 Expand/contract — the core discipline

**This is what makes image rollback independent of the schema (§6.10), and therefore what makes
automatic rollback safe (§12.7).**

Every schema change is split across at least two releases:

```
Release N     — EXPAND      additive only. No behaviour changes.
  ADD COLUMN order_item.legacy_price numeric NULL
  CREATE TABLE stock_level (...)
  No DROP. No RENAME. No NOT NULL on a new column.
  Deploy. Old code ignores the new column. New code is not yet using it.
                    │
Release N+1   — MIGRATE     switch reads/writes to the new shape.
  Deploy. Application now uses order_item.legacy_price.
  Both shapes are valid during the rollout, because a rolling deployment
  runs old and new tasks simultaneously (§15.2).
                    │
Release N+2   — CONTRACT    remove the old shape.
  DROP COLUMN order_item.price
  Safe only once no deployed task references it.
```

| Rule | Reason |
|---|---|
| A **nullable** new column | Adding `NOT NULL` without a default rewrites the table and holds an exclusive lock |
| Never `RENAME` a column in one release | A rename is a drop and an add. Mid-rollout, some tasks use the old name and some the new — both break |
| No `DROP` until no deployed version references it | Verified by querying `/version` across all tasks (§11.4), not assumed |
| **One destructive change per release** | Makes the blast radius of a mistake knowable |
| Index creation is `CONCURRENTLY` | A plain `CREATE INDEX` takes a write lock on the table |
| `lock_timeout` 5s, `statement_timeout` 60s | A migration that must wait **fails fast** rather than queueing behind a long transaction and holding the queue behind it |

**`lock_timeout` is the most important setting in this section.** A migration that waits for a lock
without a timeout will queue, and everything behind it queues too. With a 5-second timeout the migration
fails, the deploy stops, and the engineer reschedules — instead of a table being unavailable for the
duration of a long-running analytics query.

**The `NOT NULL` case has a specific pattern:**

```
1. ADD COLUMN status_v2 text NULL          -- instant, no lock
2. Deploy: dual-write to both columns
3. Backfill status_v2 from status
4. Deploy: read from status_v2 only
5. Add NOT NULL via CHECK constraint, NOT VALID → VALIDATE (no write lock)
6. SET NOT NULL using the validated constraint (metadata-only in modern PG)
7. Later release: DROP the old column
```

### 16.5 Rollback limitations — stated honestly

| Migration type | Rollback possible? | Method |
|---|---|---|
| Additive (`ADD COLUMN`, `CREATE TABLE`) | **Yes**, by rolling back the image. The unused column is harmless | §6.10 |
| Backfill of data into a new column | Partially — the image rollback is safe, but the backfilled data remains | Non-destructive residue |
| `DROP COLUMN`, `DROP TABLE` | **No.** The data is gone | **PITR restore** (§7.7) |
| `RENAME` | **No**, without the expand/contract split | PITR restore |
| Type change narrowing | **No** | PITR restore |
| Index addition | Yes | `DROP INDEX CONCURRENTLY` |

**This table is the justification for §12.7's automated rollback being safe, and the reason it is only
safe.** Automated rollback of an *image* is safe because of expand/contract. Automated rollback of a
*schema* is not safe and is never attempted — a failed migration stops the deployment (§16.6) rather
than trying to reverse itself. The asymmetry is intentional: **it is better to leave a new column in
place than to attempt a reverse migration during an incident.**

The residue is real and is stated here rather than glossed: an additive migration that is rolled back
leaves an unused column. This is accepted, because unused columns are cheap and irreversible data loss
is not.

### 16.6 Failure handling

| Failure | Detection | Response | Service state |
|---|---|---|---|
| Migration task exits non-zero | Exit code | **Deploy stops immediately** | **Previous version, untouched** |
| `lock_timeout` fired | Exit code + log | Deploy stops. Reschedule for a quieter moment | Previous version |
| `statement_timeout` fired | Exit code + log | Deploy stops. Investigate the query | Previous version |
| Partially applied (crash mid-migration) | Exit code | **Re-run.** Every migration is re-runnable (§16.1) | Previous version |
| Migration succeeded but the schema is wrong | **Schema-version assertion fails** | Deploy stops. Manual investigation | Previous version |
| Migration succeeded and the service then fails | Service health gate | **Roll back the image.** The schema is additive, so this is safe | Previous version on the new schema |

**The third row is why re-runnability is mandatory rather than a nicety.** Without it, a crash
mid-migration leaves the schema in an unknown state that only a human with a psql session can resolve —
which means the migration is not an automated pipeline step at all, it is an on-call incident.

**The fourth row is the assertion that makes the pipeline trustworthy.** A migration tool exiting 0 is
necessary but not sufficient; the pipeline asserts the expected schema version before proceeding. A
migration that silently did nothing is caught here rather than as a production error.

### 16.7 Preventing incompatible versions

| Control | Mechanism |
|---|---|
| Migrations before code | §16.2. No window where code expects a schema that does not exist |
| Expand/contract only | §16.4. Old and new code are valid against the intermediate schema |
| Contract gated on observed versions | Drop only when `/version` confirms no deployed task references it |
| Contract as a separate release | §16.4. Never in the same release that stops using it |
| **Image rollback never reverses a schema** | §16.5. This is the invariant that makes §12.7 safe |
| Migration lint in CI | §12.1 job 21 warns on `DROP`/`RENAME` without a matching expand/contract pair |

---

## 17. Failure and Recovery

### 17.1 Service crash

| | |
|---|---|
| **Detection** | Container health check fails; `/readyz` fails; target group removes the task |
| **Impact** | Reduced capacity. With ≥2 replicas, no user-visible impact. With 1 (workers), processing pauses |
| **Recovery** | Platform restarts the task. Task becomes ready and rejoins the target group |
| **Data loss** | **None.** A crashed task cannot have partially committed a transaction — PostgreSQL rolls it back |
| **Rollback** | Not applicable — not a deployment issue. If the task crashes repeatedly, the deployment is rolled back (§15.7) |

### 17.2 Worker crash

| | |
|---|---|
| **Detection** | Container restart count; `consumer_lag_entries` rising |
| **Impact** | Event processing pauses. `outbox_unpublished_total` grows. **Checkout is unaffected** — the outbox is in PostgreSQL |
| **Recovery** | Platform restarts. Unacked messages reclaimed by `XAUTOCLAIM` after the 60s visibility timeout |
| **Data loss** | **None.** Events are in the outbox until `XACK` after the database commit (§3.9) |
| **Rollback** | Not applicable. A repeated crash indicates a bad version → deployment rollback (§15.7) |

**This is the cleanest failure case in the system,** and it is clean because of a decision made three
layers down: acknowledge-after-commit plus a durable outbox.

### 17.3 Redis outage

| | |
|---|---|
| **Detection** | `redis_up` = 0; outbox relay retry errors; `consumer_lag_entries` rising; Redis memory alert if it is exhaustion |
| **Impact** | **Checkout succeeds.** Orders and stock changes unaffected. Notifications and reporting delayed. Cart not cleared |
| **Recovery** | Redis restarts. Relay resumes from unpublished outbox rows. Consumers reset and replay |
| **Data loss** | **None.** Redis is a transport buffer; the outbox is the source of truth (§8.1) |
| **Rollback** | **Not applicable, and must not be attempted.** Nothing to roll back — this is the invariant the whole design protects |

**The critical infrastructure behaviour is the absence of one.** No restart loop, no removal from the load
balancer, no failing deployment. `/readyz` excludes Redis (§0 C4), which is what guarantees this. An
infrastructure design that health-checked Redis would convert this into a total outage, and §0 C4 exists
because the current `/api/health/` endpoint does exactly that.

### 17.4 PostgreSQL outage

| | |
|---|---|
| **Detection** | `/readyz` fails on all tasks; `db_pool_in_use` = 0; connection errors |
| **Impact** | All API requests fail with 503. Edge returns an error response. No partial state |
| **Recovery** | Database restarts or fails over (§7.4). Tasks reconnect via PgBouncer. `/readyz` recovers, tasks rejoin |
| **Data loss** | **None**, except transactions in flight at the moment of failure, which roll back |
| **Rollback** | Not applicable. A deployment is not implicated |

**Why there is no partial-write risk.** Every write path is a single database transaction (§3.4). There
is no cross-service write (§4.4), so there is no half-completed distributed operation to reconcile.
That is a direct, concrete benefit of the zero-synchronous-calls architecture — in a system with a
synchronous cross-service write, a database outage mid-saga leaves unreconciled state requiring a repair
procedure.

### 17.5 Event relay crash

| | |
|---|---|
| **Detection** | `outbox_unpublished_total` rising while Redis is healthy |
| **Impact** | Events are delayed. **Nothing else.** Checkout unaffected — the relay runs after the transaction commits |
| **Recovery** | Relay restarts and drains the backlog. Lag decreases |
| **Data loss** | **None.** Unpublished rows remain in the outbox. The relay only marks a row published after `XADD` succeeds |
| **Rollback** | Not applicable |

**This failure is only visible because `outbox_unpublished_total` is an alert (§11.6 alert 2).** With
the outbox as a durable buffer, a dead relay produces no user-visible symptom other than delayed
notifications — which is exactly the kind of silent degradation a metric exists to catch.

### 17.6 Consumer crash

| | |
|---|---|
| **Detection** | `consumer_lag_entries` rising; container restarts |
| **Impact** | That consumer's processing stops. Other consumer groups are **unaffected** — this is the property of independent groups |
| **Recovery** | Restart. `XAUTOCLAIM` reclaims pending entries after 60s |
| **Data loss** | **None.** Entries remain pending in the stream |
| **Rollback** | Not applicable |

### 17.7 Duplicate event

| | |
|---|---|
| **Detection** | Normally **never** — `processed_events` rejects it. Visible as a duplicate `event_id` in metrics |
| **Impact** | **None.** The consumer skips it |
| **Recovery** | None needed |
| **Data loss** | None |
| **Rollback** | Not applicable |

**This is a designed-for condition, not an error.** At-least-once delivery means duplicates are expected,
and idempotency is what makes that safe (§8.7). The only failure mode would be a duplicate event whose
`event_id` is *not* in `processed_events` — meaning the consumer genuinely did not process it, which is
correct behaviour.

### 17.8 Message processing failure

| | |
|---|---|
| **Detection** | Consumer error counter; `consumer_lag_entries` rising |
| **Impact** | Processing of that event stops |
| **Recovery** | Retry with exponential backoff, up to 5 attempts (§3.9) |
| **Data loss** | None while retrying. The entry stays unacked |
| **Rollback** | Not applicable |

### 17.9 Dead-letter accumulation

| | |
|---|---|
| **Detection** | `dead_letters_total` increase → **page** (§11.6 alert 3) |
| **Impact** | The affected events are not applied. Derived state is stale. **No data loss** — the events still exist in the outbox |
| **Recovery** | Investigate the failure cause. Fix it. **Redrive from `dead_letters` or the outbox**, re-delivering the same `event_id` |
| **Data loss** | **None.** This is why dead letters live in PostgreSQL rather than Redis (§8.9) |
| **Rollback** | Not applicable |

**This is the scenario the alert exists for.** It is the only condition in this list representing
*silent* divergence between source and derived state. Everything else either has no impact or is loudly
visible; a parked dead letter is neither.

### 17.10 Failed migration

Covered in §16.6. Summary: deploy stops, previous version stays live, re-runnable if partial. **No
automatic schema reversal** (§16.5).

### 17.11 Failed deployment

Covered in §15.7 and §12.7. Summary: automatic rollback to the previous task definition revision, schema
untouched, verified by re-running the readiness gate and smoke tests.

### 17.12 Bad container image

| | |
|---|---|
| **Detection** | Health gate failure, smoke failure, or an alarm in the observation window (§15.3) |
| **Impact** | Depends on how far the rollout progressed. Worst case, some tasks run the bad version |
| **Recovery** | Automated rollback to the previous digest (§12.7). Independent per service |
| **Data loss** | **Depends entirely on whether the image wrote data.** If the bad image wrote corrupt data, rollback does not undo the writes — this is why §15.6 deploys `commerce` first and observes before proceeding |
| **Rollback** | Automatic. The image was never promoted, so there is no data correction path to worry about |

**The residual risk is stated rather than hidden:** a bad image that reached production and wrote bad
data is not fixed by rolling back the image. Expand/contract (§16.4) limits *schema* damage; it does not
limit *data* damage. The mitigation is the staged rollout with observation windows (§15.3), which is why
that window is 5 minutes and not zero.

### 17.13 Post-deployment discovery

A problem noticed hours or days after a successful deploy.

| Step | Action |
|---|---|
| 1 | Confirm the digest live via `/version` (§11.4) |
| 2 | Check whether the problem is code or configuration — this determines whether rollback helps |
| 3 | **Roll back** if the new version's behaviour is unknown or data-affecting |
| 4 | **Roll forward** if the fix is known and small (§12.7) |
| 5 | If data was written incorrectly, reconcile via the `stock_movement` ledger queries in `ARCHITECTURE_REVIEW.md` §13.6 |
| 6 | Post-incident: add a test that reproduces it |

Step 5 is possible **because `stock_movement` is an immutable ledger.** Reconciliation is three SQL
statements rather than an investigation. That is the payoff for §1.2 of the review insisting on a
ledger instead of a convenience column.

### 17.14 Terraform failure

| | |
|---|---|
| **Detection** | Non-zero exit from `apply` |
| **Impact** | Partial infrastructure change. **Terraform is not transactional** — a failure midway leaves some resources created and others not |
| **Recovery** | Re-run `apply` after fixing the error. Terraform converges toward the declared state |
| **Data loss** | **None** unless the change itself was destructive. `prevent_destroy` (§12.6) protects stateful resources |
| **Rollback** | Revert the configuration and re-apply. For a genuinely wrong change, restore the prior configuration from git and apply |

**Terraform's lack of transactionality is a property to design around, not a bug to work around.** The
practical mitigations: small, focused changes; `prevent_destroy` on stateful resources; and `plan` review
before apply (§12.6). A large `apply` touching many resources has a proportionally larger partial-failure
surface.

### 17.15 Floci restart / host failure

| | |
|---|---|
| **Detection** | Container and health checks fail across the board |
| **Impact** | Total environment outage. **In development this is an inconvenience, not an incident** |
| **Recovery** | Restart Floci. Named volumes survive (§2.9). Terraform state survives |
| **Data loss** | **Only if volumes were not named or are pruned.** Named volumes are the requirement |
| **Rollback** | Not applicable |

**The genuine loss scenarios are narrow and worth naming:**

| Loss | Consequence | Recovery |
|---|---|---|
| **Terraform state** | Cannot manage existing resources; `apply` fails or orphans resources | Restore the state backup (§25.4). **The one genuinely irreplaceable artefact** (§2.9) |
| PostgreSQL volume | All data | Restore from backup (§7.7) |
| Redis volume | Nothing | Outbox replay (§8.7). **No recovery action needed** |
| Registry images | Rebuild time only | Rebuild from source |
| Object storage | Static assets and artifacts | Rebuild |

**Redis volume loss requiring no recovery action is the clearest demonstration that the outbox design
succeeded.** An event backbone whose loss is unrecoverable would make Redis a hard dependency and
invalidate §8.3's single-node decision.

### 17.16 Failure-mode summary

| # | Scenario | User impact | Data loss | Detected by | Automatic recovery |
|---|---|---|---|---|---|
| 1 | Service crash | Reduced capacity | None | Health check | Yes |
| 2 | Worker crash | Delayed events | None | Restart count, lag | Yes |
| 3 | **Redis outage** | **None for checkout** | **None** | `redis_up`, alert 2 | Yes |
| 4 | PostgreSQL outage | Full 503 | None | `/readyz` | Platform |
| 5 | Relay crash | Delayed events | None | Alert 2 | Yes |
| 6 | Consumer crash | Delayed events | None | Lag | Yes |
| 7 | Duplicate event | **None** | None | Idempotency | Built in |
| 8 | Processing failure | Delayed events | None | Error counter | Retry |
| 9 | **Dead letters** | **Stale derived data** | **None** | **Alert 3 (page)** | **Manual redrive** |
| 10 | Failed migration | None | None | Exit code | **Deploy stops** |
| 11 | Failed deployment | Transient | Depends | Health gate | **Yes** |
| 12 | Bad image | Variable | Possible | Gate + alarms | **Yes** |
| 13 | Post-deploy discovery | Variable | Possible | Human | Manual |
| 14 | Terraform failure | None | None | Exit code | Re-apply |
| 15 | **Floci/host failure** | **Total** | Only volumes | All checks | Restart |

**Row 3 and row 9 are the two that justify the event architecture.** Row 3 is a total-outage scenario
reduced to zero user impact by the outbox. Row 9 is the only row requiring manual intervention, and it
still loses no data because dead letters live in PostgreSQL.

---

## 18. Local Developer Experience

### 18.1 Goal

```bash
git clone <repo>
make bootstrap      # verify prerequisites, start Floci, generate local secrets
make infra-up       # terraform init + apply
make build          # build all images
make deploy         # push to the local registry, run migrations, start services
make migrate        # run migrations only
make test           # unit + integration + contract
make e2e            # Playwright
```

**Every step is idempotent and every step is a Make target.** No manual steps, no documented sequence a
newcomer has to assemble from a wiki page. The reproducibility requirement is verified by `infra-reset`
(§2.10), not by assertion.

### 18.2 Prerequisites

| Tool | Version | Checked by `bootstrap` | Notes |
|---|---|---|---|
| Docker | 24+ | Yes | Docker Engine, not merely Desktop |
| Docker Compose | v2 | Yes | `docker compose`, not `docker-compose` |
| Floci CLI | Latest | Yes | §2.4 |
| Terraform | ≥ 1.6 | Yes | Version constraint in the root modules |
| Git | Any | Yes | |
| Make | Any | Yes | |
| jq | Any | Yes | Used by the Makefile for JSON handling rather than fragile grep |
| Node.js | 20 | Only for frontend work | Matches `.github/workflows/ci.yml` |
| Go | 1.26 | Only for Go services | |
| Python | 3.12 | Only for backend work | Matches CI |

**Checking prerequisites in `bootstrap` is what makes the failure mode a clear error message rather than
a confusing failure three steps later.** A developer on Terraform 1.5 should learn that immediately, not
after a `terraform init` warning scroll.

### 18.3 `make bootstrap`

| Step | Action | Idempotent |
|---|---|---|
| 1 | Verify every prerequisite and version | Yes — reports all failures, not the first |
| 2 | Pull Floci images | Yes — skips if present |
| 3 | Start the Floci daemon | Yes — no-op if running |
| 4 | Initialise the registry | Yes — creates if absent |
| 5 | Generate local-only secrets into `.env.local` | Yes — **never overwrites existing values** |
| 6 | Set `TF_PLUGIN_CACHE_DIR` | Yes |

**Step 5's "never overwrite" rule matters.** Regenerating the JWT signing key on every bootstrap would
invalidate every token; regenerating the database password would break connections. Local secrets are
generated once and persist until explicitly reset.

**`.env.local` is gitignored** and holds only local, non-production values. It is the boundary between
"generated local state" and "committed configuration."

### 18.4 `make infra-up`

```bash
terraform -chdir=infra/terraform/environments/floci init
terraform -chdir=infra/terraform/environments/floci apply -auto-approve
```

| Requirement | How |
|---|---|
| Idempotent | `apply` on a converged environment is a no-op |
| Fast on re-run | Provider cache (§3.11), state cache |
| Safe to interrupt | Terraform state is written per-resource; re-running resumes |
| Reviewable | `-auto-approve` is acceptable locally **because nothing here is production**. Production requires approval (§12.6) |
| Informative | Outputs printed: edge URL, DB endpoints, registry, role names |

**`-auto-approve` locally and gated in production is the correct asymmetry.** Requiring manual approval
for a developer's local environment is friction with no safety benefit; the environment contains no real
data and is destroyed by `infra-destroy`.

### 18.5 `make build` and `make deploy`

| Target | Action |
|---|---|
| `make build` | Build all four service images + the frontend bundle |
| `make deploy` | Push to the local registry, register task definitions, run migrations, update services, wait for readiness |
| `make dev` | **Optional fast path.** Compose-based inner loop with no Terraform. Documented as a shortcut, not the supported workflow (§0 C1) |
| `make logs S=commerce` | Tail logs for one service |
| `make ps` | Task status, health, and digests |
| `make shell S=commerce` | Shell into a task — **not available for Go** (distroless has no shell, §9.6). Use logs and metrics |

**`make shell` failing for Go services is a consequence worth stating rather than hiding.** The
distroless image has no shell by design: it removes an entire class of post-exploitation tooling. The
debugging substitute is the full log/metric surface plus the local Compose path (`make dev`), which uses
a debug image.

### 18.6 `make test` and `make e2e`

| Target | Runs |
|---|---|
| `make test` | Go tests, Django tests, contract tests, against local datastores |
| `make test-race` | Go tests with `-race`. Slower; run before pushing |
| `make e2e` | Build + deploy + Playwright. Requires a running environment |
| `make e2e-headed` | Playwright with a visible browser. The local debugging path |
| `make reset-data` | Truncate and reseed. Required before `make e2e` |
| `make chaos` | §14.5 chaos tests, including the Redis-down checkout test |

**`make e2e` depends on a deployed environment, not on a source tree.** This mirrors CI exactly: the same
digests, the same edge, the same services. A developer can therefore reproduce a CI failure locally with
one command, which is the single most valuable property of the testing architecture.

### 18.7 Full target list

```
bootstrap        infra-up         infra-plan        infra-destroy       infra-reset
build            build-catalog    build-commerce    build-identity     build-workers
deploy           migrate          test              test-race          contract-test
e2e              e2e-headed       smoke             chaos              reset-data
logs             ps               shell             metrics            dashboards
seed             reset-admin      rotate-keys       backup-db          restore-db
lint             fmt              lint-terraform    validate-terraform scan-terraform
```

`make help` lists these with descriptions. **`fmt`, `lint`, `lint-terraform`, `validate-terraform` mirror
the CI jobs exactly**, so `make lint` locally is a genuine pre-flight for the merge gate.

### 18.8 Debugging

| Problem | Tool |
|---|---|
| A service is failing readiness | `make ps`, then `make logs S=<service>` |
| Which digest is live | `/version` on the service (§11.4) |
| A request is slow | `X-Request-ID` from the response, then grep the logs across all services |
| A checkout failed | `checkout_attempts_total{result}` and the `correlation_id` in the logs |
| Events not arriving | `outbox_unpublished_total`, then `consumer_lag_entries` (§11.3) |
| Stock looks wrong | `stock_movement` ledger query (`ARCHITECTURE_REVIEW.md` §13.6) |
| Interact with Redis | Redis CLI via the Terraform-provided endpoint |
| Interact with the database | `psql` as the owning role — the grants enforce which tables are reachable (§4.5) |
| Terraform state confusion | `make infra-plan` shows the diff before any change |

**The `X-Request-ID` workflow is the highest-value debugging tool here**, and it depends on §10.4
generating it at the edge. One ID correlates the request across the edge, the service, the database
transaction, the outbox row, and the downstream consumer. `nginx.conf` does not do this today (C7e).

### 18.9 Reproducibility verification

| Test | Command | Passes when |
|---|---|---|
| Clean-clone reproducibility | `make infra-reset && make infra-up && make deploy && make e2e` | The full lifecycle succeeds from nothing |
| Idempotency | `make infra-up` twice | Second run reports no changes |
| Teardown completeness | `make infra-reset` then list resources | Nothing remains |
| No manual steps | Follow the README on a clean machine | No undocumented step is required |

**These four tests are the acceptance criteria for §26.** A platform that cannot be rebuilt from a clean
clone is not reproducible, regardless of how well the documentation reads.

---

## 19. CI Environment

### 19.1 Tier 1 — Fast CI (GitHub-hosted runner)

```
GitHub Actions (ubuntu runner)
   │
   ├─ ephemeral Compose stack, unique per job:
   │    project name  ci-<run-id>-<job>
   │    database name test_<random>
   │    ports         dynamically allocated, never fixed
   │
   ├─ run unit · contract · service integration tests
   ├─ run all static analysis (§12.1)
   ├─ build images to validate
   └─ destroy the stack
```

| Property | Value | Reason |
|---|---|---|
| Isolation | **Per job.** Unique Compose project name, unique database, dynamically allocated ports | Parallel PRs cannot collide |
| Creation cost | ~10 s | A managed instance would cost minutes |
| Terraform | **Not applied.** `init -backend=false`, `validate`, `lint`, `plan` only | Creating real infrastructure per PR is slow and adds no signal for a config that is already validated |
| Destroyed | Yes, always | `if: always()` so a failed test does not leak resources |
| Covers | ~700 of ~760 tests (§14.1) | The fast 92% |

**Dynamic ports are essential.** Fixed ports (as `ci.yml` uses today: `5432:5432`, `6379:6379`) mean two
parallel jobs on one runner collide. GitHub-hosted runners are single-tenant per job, so this rarely bites
today — but it breaks the moment the suite is parallelised within a job or run on a self-hosted runner.

### 19.2 Tier 2 — Full CI (self-hosted runner with Floci)

```
GitHub Actions (self-hosted runner, has Floci)
   │
   ├─ acquire short-lived credentials        §19.3
   ├─ terraform plan (assert expected)       §12.6
   ├─ terraform apply (floci environment)
   ├─ push images built by the Build stage   §12.2
   ├─ run migration tasks                     §16.2
   ├─ update services (rolling)              §15.1
   ├─ readiness + smoke gate                  §12.5
   ├─ system integration tests               §14.5
   ├─ Playwright E2E                          §13
   ├─ collect artifacts
   └─ publish release manifest               §6.11
```

| Property | Value | Reason |
|---|---|---|
| Runner | **Self-hosted**, labelled `floci` | GitHub-hosted runners have no Floci and no local cloud |
| Environments | **One per deployment, reconciled by Terraform** | Not created and destroyed per job |
| Destruction | **Retained** between runs for debugging | A destroyed environment is useless for investigating a failure |
| Credentials | Short-lived, runner-scoped | §19.3 |

### 19.3 Why environments are reconciled rather than ephemeral

| Option | Assessment |
|---|---|
| **One ephemeral environment per job** | **Not practical.** Each job would need to start Floci, run Terraform against a fresh local cloud, migrate five databases, start four services, run tests, then destroy everything — many minutes per job, all serialised on one machine. It would make CI slower than the deployment it verifies |
| **One shared persistent environment** | Fast, but state leaks between runs. A failed run leaves data that changes the next run's results — the worst failure mode in testing, because it makes results non-reproducible |
| **One environment per deployment, reconciled, with data reset** | **Chosen.** Terraform reconciles the infrastructure; the data reset (§19.4) provides determinism; the environment persists for debugging |
| Pool of environments, allocated per job | Real production practice. Rejected because a local machine cannot host a meaningful pool |

**The determinism requirement is satisfied by the data reset, not by environment destruction.** That is
the key insight: what makes a test environment non-deterministic is leftover *data*, not leftover
*infrastructure*. Resetting data is seconds; recreating infrastructure is minutes.

### 19.4 Determinism

| Source of non-determinism | Control |
|---|---|
| Leftover data from a previous run | Full truncate + reseed before every run |
| Fixture IDs drifting | Fixed seed data with known IDs (§13.5) |
| Time-of-day dependencies | Injected clock; tests never sleep to wait for a time boundary |
| Random test data | Seeded PRNG where randomness is genuinely needed |
| **Parallel workers sharing mutable state** | Per-worker users, carts, and **exclusive stock** (§13.5) |
| Event consumer lag | Wait for `consumer_lag_entries == 0` rather than a fixed sleep |
| Port conflicts | Dynamically allocated ports (§19.1) |

**"Wait for consumer lag to reach zero rather than sleep" is the pattern worth generalising.** A fixed
sleep is either too short (flaky) or too long (slow), and it is the single largest source of CI flake in
event-driven systems. Polling the actual condition is both faster and deterministic.

### 19.5 Nightly

| Job | Purpose |
|---|---|
| Chaos suite (§14.5) | Redis down, Redis wiped, consumer crash, database unavailable |
| Terraform drift detection | Alert on drift. **Never auto-apply** |
| Restore drill | Restore the database backup and verify row counts (§7.7) |
| Full dependency re-scan | Newly disclosed CVEs against images built days ago (§6.6) |
| SBOM regeneration | Refresh against current vulnerability data |
| Multi-service system integration | The full suite, not just post-deploy |

**The restore drill is scheduled rather than on-demand for the same reason as the quarterly backup drill:
a recovery procedure never exercised is a hypothesis.** Running it nightly makes it a routine.

---

## 20. Production Equivalence

### 20.1 The goal

> `local ≈ staging ≈ production`

Approximate in **architecture**, exact in **configuration model**, different only in **scale and
redundancy**.

### 20.2 Equivalence matrix

| Component | Floci / local | Staging | Production | Equivalent? |
|---|---|---|---|---|
| **Terraform modules** | Same | Same | Same | **Exact** |
| **Environment layout** | `environments/floci` | `environments/staging` | `environments/production` | **Exact structure** |
| **Compute** | Fargate-style tasks | Fargate-style tasks | Fargate tasks | **Exact** |
| Task definitions | Same shape | Same | Same | **Exact** |
| Health checks | `/healthz`, `/readyz` | Same | Same | **Exact** |
| `/readyz` excludes Redis | Yes | Yes | Yes | **Exact** |
| **Container images** | Built once, by digest | **Same digest** | **Same digest** | **Exact** |
| **SPA** | Object storage | Object storage | Object storage | **Exact** |
| **PostgreSQL** | One instance, 5 databases, 5 roles | Same | Same | **Exact** |
| PgBouncer | **Yes, transaction mode** | Yes | Yes | **Exact** |
| Migration approach | Plain `.sql` + Django `migrate` | Same | Same | **Exact** |
| **Redis** | AOF, `noeviction`, streams | Same | Same | **Exact config** |
| Outbox + streams architecture | Yes | Yes | Yes | **Exact** |
| **Secrets** | Secret store, injected | Same | Same, via task role | **Exact model** |
| IAM model | Role per service | Same | Same + OIDC | **Exact model** |
| Network tiers | Public / private / data | Same | Same | **Exact** |
| Security groups | Explicit, group-referencing | Same | Same | **Exact** |
| Edge routing | Path rules | Same | Same | **Exact** |
| TLS | Self-signed | Managed | Managed + preload | **Different** |
| Observability | Logs + `/metrics` | Logs + metrics | Logs + EMF metrics | **Same metrics** |
| Alert thresholds | Same definitions | Same | Same | **Exact** |
| Deployment strategy | Rolling + gates | Same | Same | **Exact** |
| Migration timing | Before service update | Same | Same | **Exact** |
| Playwright | Chromium, same suite | Same | **Not run** | **Same suite** |
| Database backups | Local dumps | Automated | Automated + PITR | **Different** |
| Replicas | 1 | 1–2 | 2–8 | **Different** |
| Multi-AZ | No | No | **Yes** | **Different** |
| Autoscaling | Not exercised | Enabled, low thresholds | Enabled | **Partial** |
| Compute host failure | n/a | n/a | Automatic replacement | **Different** |

### 20.3 Intentional differences

**Eight differences. Each is deliberate, with a reason and a mitigation.**

| # | Difference | Why | Mitigation |
|---|---|---|---|
| 1 | **TLS certificates** | Local uses a host-trusted self-signed certificate; production uses an automatically renewed managed certificate | The routing, header, and protocol logic is identical. Only the certificate differs |
| 2 | **Database redundancy** | Multi-AZ failover cannot be simulated locally | Restore drill (§19.5) covers the data-recovery path. **Production must verify failover before real traffic** (§25.7) |
| 3 | **Alert delivery** | No paging infrastructure locally | Metric definitions and thresholds are identical, so alert *logic* is exercised; only delivery is absent |
| 4 | **OIDC** | C5: a local cloud may not implement GitHub OIDC token exchange | Production uses OIDC (§9.6). Locally, short-lived runner-scoped credentials. **Same workflow structure, one differing step** |
| 5 | **Scale** | Local has one replica and no autoscaling | Task definitions are identical, so replica counts are a variable. §14.5 exercises concurrency directly |
| 6 | **Ephemeral CI environments** | C6: per-job Floci environments are not practical | Two-tier model (§19). 92% of tests run in the Fast tier; the rest run in a Full-tier environment that is reset rather than recreated |
| 7 | **PITR** | §2.7 item 4 | Nightly logical dumps are mandatory everywhere, not production-only (§7.7) |
| 8 | **Compute substrate fallback** | §5.7: Floci may not support Fargate | One variable in `modules/compute`. Everything above the module is unchanged |

### 20.4 What is deliberately kept identical

Three choices deserve explicit defence, because each is a place where it would be *easier* to let local
and production diverge.

**PgBouncer runs locally.** §7.5 identified that transaction-mode pooling breaks Go prepared statements —
a bug that would appear only in production. Running the pooler locally means the same code path is
exercised everywhere, and the constraint is discovered by a developer rather than in production. **This
is the clearest example of paying a small local cost to eliminate an entire class of production-only
defect.**

**`/readyz` excludes Redis locally too.** §0 C4's failure mode is a Redis outage causing a restart loop.
If the local health check included Redis, that behaviour would be developed against and never
discovered. The local configuration must match the production configuration in this specific respect.

**Digest pinning locally too.** If local deployments used `:latest`, then promotion behaviour (§6.9)
would only ever be tested in staging. Digest pinning costs nothing locally and means the promotion
mechanism is exercised on every deploy.

---

## 21. Floci to Real AWS Migration

### 21.1 Service mapping

| This design | Floci equivalent | Real AWS | Notes |
|---|---|---|---|
| VPC, subnets, route tables | VPC-equivalent | VPC | Same module |
| Security groups | Security groups | Security groups | Same module |
| Edge / load balancer | LB-compatible | ALB | Same rules |
| TLS certificates | Local CA | ACM | Difference #1 (§20.3) |
| DNS | Local resolver | Route 53 + hosted zone | New, additive |
| Fargate-style tasks | ECS/Fargate-compatible | ECS on Fargate | Or ECS on EC2 (§5.7) |
| Container registry | ECR-compatible registry | ECR | Same digest model |
| PostgreSQL | RDS-compatible | RDS for PostgreSQL | Or Aurora if a §7.2 trigger fires |
| PgBouncer | Same | Same | Container or RDS Proxy — **decide before Commerce is written** (§7.5) |
| Redis | Redis-compatible | ElastiCache | Or self-managed on EC2 |
| Object storage | S3-compatible | S3 | Same buckets |
| Secrets | Secrets-compatible | Secrets Manager | Same rotation model |
| Task roles / IAM | IAM | IAM | **Same model.** This is the key portability property |
| OIDC from GitHub Actions | Runner-minted credential (C5) | GitHub OIDC → IAM | Difference #4 |
| Logs + metrics | Logs + `/metrics` | CloudWatch Logs + EMF | Same metric definitions |
| Error tracking | Sentry | Sentry | No change |
| Multi-AZ | Not available | Multi-AZ | Difference #2 |
| PITR | Possibly unavailable | RDS PITR | Difference #7 |
| Autoscaling | Limited | Application Auto Scaling | Difference #5 |
| Drift detection | Manual `plan` | Scheduled `plan` job | Additive |

### 21.2 What stays identical

| Stays identical | Why |
|---|---|
| **Every Terraform module** | The whole point. Modules target the AWS API contract (§2.1) |
| **Environment root module structure** | `environments/production` already exists |
| **Container images, by digest** | §6.9. The artifact of record does not change |
| **The entire deployment pipeline** | Same stages, same gates. Only credentials and endpoints differ |
| **Service configuration model** | Env vars and secret references are unchanged |
| **The IAM model** | Role per service, least privilege. **OIDC removes the credential difference entirely** |
| **Observability concepts and thresholds** | Same metrics, same alerts |
| **Playwright suite** | Same tests, same target shape, same selectors |
| **The migration approach** | Same `expand/contract` discipline, same task model |
| **The rollback model** | Same previous-revision mechanism |

### 21.3 What changes

| Changes | From | To | Work required |
|---|---|---|---|
| Capacity | 1 replica, no autoscaling | 2–8 replicas, autoscaling | Variables only |
| Availability | Single AZ | Multi-AZ | Variables, plus RDS/ElastiCache configuration |
| **DNS** | Local resolver | Route 53 + hosted zone + validation | **New resource.** The only genuinely new component |
| **TLS** | Self-signed | ACM + auto-renewal | Certificate source; DNS validation |
| **Compute substrate** | Possibly a fallback (§5.7) | Native Fargate | Possibly one variable |
| Managed services | RDS-compatible | Real RDS / ElastiCache | Verify backup and failover features |
| **Credential acquisition** | Runner-minted | **OIDC** | One workflow step |
| Scaling behaviour | Not exercised | Real autoscaling | Tune thresholds from observed data |
| **Backup verification** | Local dumps | Managed backups + PITR | **Quarterly restore drill must pass before real traffic** (§25.7) |

### 21.4 Migration procedure

| Step | Action | Verification |
|---|---|---|
| 1 | Create the AWS account(s). Separate accounts per environment | — |
| 2 | Configure the OIDC provider and all five CI roles (§9.6) | A read-only CI job can assume its role |
| 3 | Populate `environments/production/*.tfvars` with real region, CIDRs, domain, sizes | `terraform validate` passes |
| 4 | `terraform plan` | **Read the entire plan.** First plan on an empty environment shows everything being created |
| 5 | `terraform apply` | All resources healthy; `/healthz` responds |
| 6 | Copy image digests into the production registry paths (§6.9) | Digests match the build-stage record |
| 7 | Run migration tasks against production (§16.2) | Schema version assertion passes |
| 8 | Update services to the known-good digest | Readiness gate passes |
| 9 | Configure DNS | — |
| 10 | **Verify TLS, `/readyz`, and PgBouncer before real traffic** | The three things that differ structurally |
| 11 | **Run the restore drill** | Row counts and checksums match |
| 12 | Smoke against production | §14.6 |
| 13 | Cut DNS | — |
| 14 | Monitor against §11.6 alerts for 48 hours | No alert breaches |

**Steps 10 and 11 are the ones that must not be skipped.** TLS, PgBouncer connectivity, and backup
restore are precisely the three components that behave differently on real managed services
(§20.3, §7.5), and all three fail in ways that are immediately user-visible or immediately
data-relevant. Verifying them under controlled conditions is much cheaper than discovering them under
traffic.

---

## 22. Deliberately Unused Technologies

Each entry states the workload or architecture reason, not "overkill".

| Technology | Decision | Workload/architecture reason | Revisit trigger |
|---|---|---|---|
| **Kubernetes** | Not used | The architecture has **zero synchronous service-to-service calls** (§4.4), so there is no service discovery, no east-west network policy, no mesh, and no ingress controller to need. Four services and one worker on four hosts is not a scheduling problem. A control plane plus etcd plus CNI costs ~1 GB before any application runs | >20 services, or a requirement for multi-cluster/region scheduling that ECS cannot express |
| **Kafka** | Not used | Sustained requirement is **0.25 events/s** (`ARCHITECTURE_REVIEW.md` §2.1). Kafka is built for 1M+/s. It would reduce availability, not increase it, by adding a JVM broker to an already memory-constrained host | >100 events/s sustained, or a requirement for long-term event replay that the outbox cannot serve |
| **NATS** | Not used | Redis is already deployed, password-protected, and monitored. Adding a second broker to carry 0.25 events/s duplicates a solved problem | §2.7: if Redis operational burden becomes real, or if built-in dead-letter and ack semantics become worth a second service |
| **RabbitMQ** | Not used | Best-in-class for command queuing, but a new stateful service for 0.25 events/s. Redis Streams already provides consumer groups, `XAUTOCLAIM`, and `MAXLEN` | If per-message routing, priorities, or native DLX become requirements |
| **Service mesh** | Not used | Its purpose is securing and observing **service-to-service** traffic. **There is none** (§4.4). A mesh would instrument zero sidecars and secure zero connections | Only if synchronous calls are reintroduced |
| **gRPC** | Not used | The primary benefit is efficient internal RPC. With no internal RPC and 27 customer endpoints, the benefit does not apply. JSON at the edge keeps the SPA contract simple | If measured latency at the edge becomes a problem, and a browser-compatible gRPC gateway is acceptable |
| **API Gateway** | Not used | Every feature it provides — transformation, authorisation aggregation, metering, throttling — is already handled at the LB or in services (§10.9). Adding it duplicates capability and adds a hop | Per-consumer attribution, cross-service transformation, or backend key management |
| **PgBouncer** | **Adopted** (§7.5) | **This reverses `ARCHITECTURE_REVIEW.md` §8.3.** Connection count scales with replicas; 224 worst-case connections against a default `max_connections` of 100 forces a pooler | Never — this is a scale-independent correctness requirement for horizontally scaled tasks |
| **ELK** | Not used | A full Elasticsearch + Logstash + Kibana cluster for ~10 requests/s of logs. The log service already supports structured JSON, filtering, retention, and **metric extraction** (§11.1). ELK would add three services to solve a problem the current one solves | Log volume or query complexity exceeding what the log service can serve |
| **Loki** | Not used | Same reasoning. Loki integrates with Kubernetes, which is not in use, so its main advantage does not apply | Never, unless Kubernetes is adopted |
| **Full OpenTelemetry stack** | Not used | A collector, an exporter, storage, and a query UI — to analyse data nobody will read at 10 requests/s. **W3C `traceparent` propagation and `trace_id` in logs already provide correlation**, which is the actual requirement (`ARCHITECTURE_REVIEW.md` §10.4) | Any trigger in §11.9 |
| **Redis Cluster** | Not used | 16384 hash slots and resharding solve horizontal scaling and failover. Redis handles 100k+ ops/s against a 0.25 events/s requirement. **Safe only because the outbox makes Redis loss recoverable** (§8.3) | Events >10k/s, or if the outbox were ever removed — at which point single-node Redis becomes a data-loss risk |
| **VPC endpoints / PrivateLink** | Not used | Requires interface endpoints per service, each with policy documents. There are three datastores reached by private IP within the VPC | An audit requirement that datastores cannot use the public network path |
| **NAT Gateway** | Not used | Conventional designs grant private subnets unrestricted outbound internet — an exfiltration path. Egress is instead restricted to the three managed-service endpoints actually used (§4.8) | A dependency that must reach an arbitrary external host |
| **Read replicas** | Not used | The read path is served by `catalog` caching and the `reporting` read models. Replication is a heavier mechanism for the same goal | Read load on the primary sustained above capacity |
| **Aurora** | Not used | Distributed storage solves a problem this scale and architecture do not have, and its Proxy duplicates PgBouncer | A §7.2 split trigger, or exceeding a single node's connection or storage ceiling |
| **Lambda** | Not used | Long-running services with streaming consumers. Checkout needs a database transaction; consumers need long-lived stream reads. Neither fits an execution-time model | A genuinely event-triggered, short-lived task — of which there are currently none |
| **Step Functions** | Not used | The pipeline is a linear job graph in CI. A state machine would add a service to express sequencing that already works | Multi-branch, long-running, human-in-the-loop workflows with resumable state |
| **Terraform Cloud** | Not used | Vendor dependency, network dependency, and per-seat cost for features (remote execution, policy sets, cost estimation) this project does not use. Production state belongs in S3 with the rest of the account | >10 contributors to the same environment, or a governance requirement |
| **Service mesh for egress control** | Not used | Security groups already restrict egress to three endpoints (§4.8). A mesh would add a proxy per task to enforce a policy the network layer already enforces | Cross-account, per-identity egress requirements |
| **Full browser matrix in Playwright** | Not used | Chromium covers the layout, network, and storage APIs this SPA uses; no browser-specific APIs. A 3× matrix for 3× the runner time and flake surface | A customer complaint about a specific browser |

**The pattern across this list.** Every rejection traces to one of three concrete properties of this
system: zero synchronous service-to-service calls, ~0.25 events/second, and four services. A technology
becomes justified when one of those changes, and each entry names the trigger — so none of these are
permanent positions, and none are ignorance.

---

## 23. Security Model

### 23.1 Trust boundaries

```
                    Internet (untrusted)
                            │
                     ┌──────▼──────┐
                     │   Edge / LB │  TLS terminates here
                     │  + WAF-adj  │  ← only component reachable from the internet
                     └──────┬──────┘
              ┌─────────────┼─────────────┐
              │             │             │
        ┌─────▼────┐  ┌─────▼────┐  ┌─────▼────┐
        │ identity │  │ catalog  │  │ commerce │   private tier
        └─────┬────┘  └─────┬────┘  └─────┬────┘
              │             │             │
        ┌─────▼─────────────▼─────────────▼─────┐
        │        Data tier: PostgreSQL,          │  no inbound from edge
        │        Redis, object storage            │  no public endpoints
        └────────────────────────────────────────┘

        ┌──────────────────────┐
        │      workers         │  private tier, no inbound from edge
        └──────────┬───────────┘
          ┌────────┴────────┐
          ▼                 ▼
    engagement DB     reporting DB      (separate credentials, §7.3)
```

| Boundary | Control | Enforced by |
|---|---|---|
| Internet → edge | TLS, WAF, rate limits, max body size | LB configuration (§10.6) |
| Edge → services | **Only** the four known API prefixes | Listener rules (§10.2) |
| Edge → data tier | **Nothing.** The LB has no route to any datastore | Security groups (§4.6) |
| Services → data tier | Only the datastores each service needs | Per-service security groups |
| Services → each other | **Nothing exists** | Zero synchronous calls (§4.4) |
| Tasks → AWS APIs | Only the specific actions in that task's role | IAM, default-deny (§9.8) |
| Task → task metadata | **Not reachable.** No service discovery, no mesh | No sidecars, no cluster network |

**The edge-to-data-tier row is the most important line in the diagram.** Compromise of the load balancer —
or of a container that can reach it — must not yield direct database access. Every datastore sits in a
tier the edge has no route into, so an SSRF or a routing bug at the edge cannot become data access.

### 23.2 Defence in depth

| Layer | Control |
|---|---|
| Network | Three tiers; no edge route to data; per-service security groups; egress limited to three endpoints |
| Edge | TLS, WAF, rate limits, request-size caps, header normalisation |
| Identity | JWT with 30-min TTL; JWKS-symmetric; blacklist; Argon2id passwords; MFA on admin |
| Authorisation | **Every service owns its authorisation** (§23.3) |
| Container | Non-root, read-only root filesystem, dropped capabilities, distroless base, no shell |
| Secrets | Never in images, never in Terraform state, never in workflow files. Generated, stored, rotated (§9) |
| Data | Per-role privileges, `search_path` scoping, `statement_timeout` |
| Supply chain | Digest pinning, SBOM, provenance, SHA-pinned actions, scanning (§6) |
| Deploy | OIDC, manual approval, concurrency group, migration gate |
| Detect | Correlation IDs, structured logs, metrics, alerts (§11) |

### 23.3 Authentication and authorisation

| Layer | Mechanism | Where enforced |
|---|---|---|
| Edge | TLS only. **No authentication** | LB |
| Service | JWT verification with a cached JWKS | Every request handler |
| Authorisation | **Per-service.** Identity owns users; Commerce owns orders and carts | The service that owns the resource |
| Admin | Separate role plus MFA | Identity + service role |
| Break-glass | `sneakin_admin` + break-glass role + CloudTrail | Only for operational queries |

**The edge never authorises.** It routes; services decide. Centralising authorisation at the edge would
require the edge to know the entire domain model of all four services, which reintroduces coupling and
makes the edge a single point of authorisation failure.

**The `users.owner_id → users.id` permission gap** (`ARCHITECTURE_REVIEW.md` §6) is fixed inside Identity
because Identity is the only service that can be authoritative about users. No other service's
authorisation depends on it.

### 23.4 Least privilege

| Domain | Enforcement |
|---|---|
| AWS API | One IAM role per task type. Default-deny. No wildcard resources |
| Data | One DB role per service; DDL only in the migration role |
| Redis | Per-consumer credentials. No service can read another consumer's pending entries |
| Object storage | Only the edge reads the SPA bucket. Only Catalog writes media. No public access |
| CI | OIDC role per environment. Short-lived. Read-only for PR jobs |
| Secrets | Only the service that consumes a secret may read it. `identity` alone reads the JWT key |

### 23.5 Data protection

| Data | Classification | At rest | In transit | Retention |
|---|---|---|---|---|
| Passwords | High | Argon2id hash | TLS | Never stored in plaintext |
| JWT signing key | High | Secret store, versioned | TLS | Rotated; old versions retained for verification |
| **PII** (email, addresses) | High | Managed encryption | TLS | Per service; user deletion cascades within the owning service |
| **Payment data** | **None stored** | — | — | **No card data is stored.** Provider-hosted fields only |
| Passwords (database) | High | Secret store | TLS | 90 days |
| Session/CSRF secrets | Medium | Secret store | TLS | 180 days |
| Order data | Medium | Encrypted volume | TLS | Retained for business purposes |
| Event payloads | Medium | PostgreSQL / Redis | TLS | Redis 7 days; outbox indefinite |
| Logs | Medium (correlation IDs, not payloads) | Managed | TLS | 30 days |
| Metrics | Low | Managed | TLS | 90 days |
| Backups | Same as source | Managed, encrypted | TLS | 35 days |

**PII is never logged.** Request bodies and database values are excluded from structured logs; only
identifiers, counts, and outcomes are recorded. This is enforced at the JSON encoder, not by convention,
and the logging library configuration in every service must exclude bodies.

### 23.6 Secrets

| Control | Implementation |
|---|---|
| Generation | Terraform. **Never authored by a human** (§9.2) |
| Storage | Secret store, encrypted at rest |
| Delivery to tasks | Injected at startup via the task role. **Not baked into images** |
| Delivery to edge | Read-only role for the SPA bucket |
| CI access | OIDC, short-lived, environment-scoped |
| Rotation | Automated where safe (§9.7); break-glass from where it is not |
| Logging | Secrets are never logged. The secret provider's request/response is disabled |
| Repository | `.env.local` is gitignored. A secret scanner runs in CI (§12.1) |

### 23.7 Supply chain

| Control | Implementation |
|---|---|
| **Pin actions to SHA** | `actions/checkout@<sha>` with a version comment. Mutable tags (`@v4`, C7o) let the upstream tag move after review |
| Build once, promote by digest | §6.9 |
| Image scanning | Trivy in the build pipeline. **Block on HIGH/CRITICAL** |
| SBOM | Syft per image, retained with the digest |
| Provenance | Build attestation recorded per digest |
| Dependency scanning | `pip-audit`, `npm audit`, `govulncheck` (§12.1) |
| Secret scanning | CI scan plus pre-commit |
| Lock files | `package-lock.json`, `poetry.lock`/`requirements.txt` pinned, `go.sum` |
| Base images | Pinned by digest, not by tag |
| Least-privilege runner | `permissions:` block, minimum scope |

### 23.8 Threats and mitigations

| Threat | Mitigation | Residual risk |
|---|---|---|
| Brute-force login | Argon2id, rate limit at edge, lockout, MFA for admin | Distributed low-rate attempts |
| Credential stuffing | Rate limit + monitoring; MFA on admin | — |
| Stolen JWT | 30-min TTL; blacklist on logout; rotation windows | A token stolen mid-window is valid until expiry |
| **SSRF** | **No service fetches user-supplied URLs. No metadata service reachable from tasks. WAF rules at the edge** | Low |
| SQL injection | Parameterised queries only; per-role privileges limit blast radius | An injection bug in a service still reaches its own database |
| Compromised container | Non-root, read-only FS, no shell, no outbound except managed endpoints, separate credentials | Lateral movement within the same service's own data |
| Compromised task role | Default-deny; no privilege escalation paths; other services' data unreachable | Blast radius is one service's data |
| Supply-chain compromise of a base image | Digest pinning; rebuild cycle; provenance | A malicious rebuild before review |
| Secret leakage via logs | Body exclusion at the encoder; secret scanner | A new log call that bypasses the encoder |
| **Redis data loss** | **Outbox + relaying from PostgreSQL (§8.7). Redis is recoverable by construction** | Stream entries not yet persisted — an acceptable tradeoff with permanent re-derivation from the outbox |
| **PostgreSQL data loss** | Multi-AZ + automated backups + PITR + verified restore drill | Corruption invisible to backups |
| Log tampering | Append-only log group with a retention lock | Account-level compromise |
| **CI compromise** | OIDC short-lived credentials; SHA-pinned actions; environment-scoped roles | Compromise of a maintainer account |

### 23.9 Compliance posture

| Control | Status |
|---|---|
| Data encryption at rest | Yes — managed |
| Data encryption in transit | Yes — TLS everywhere, required for Redis in production |
| Access control | Least privilege, verified by review |
| Audit logging | CloudTrail + structured application logs |
| Vulnerability management | Automated scanning with blocking thresholds |
| Incident response | §25.6 |
| **PCI scope** | **Minimal.** No card data stored. Payment is provider-hosted |
| GDPR/CCPA | Addressable: user data is isolated to Identity and Commerce; deletion cascades within those services; a full erasure path requires per-service handling |
| Backups | Verified by drill (§25.7), not merely configured |

---

## 24. Cost and Resource Model

### 24.1 Production monthly estimate

| Component | Specification | Monthly |
|---|---|---|
| **ECS/Fargate tasks** | | |
| identity | 2 tasks × 0.5 vCPU / 1 GB | ~$18 |
| catalog | 2 tasks × 0.5 vCPU / 0.5 GB | ~$9 |
| commerce | 2 tasks × 0.5 vCPU / 0.5 GB | ~$9 |
| workers | 1 task × 0.25 vCPU / 0.5 GB | ~$5 |
| | | **~$41** |
| **PostgreSQL** | `db.t4g.medium`, Multi-AZ, 20 GB gp3 | **~$40** |
| **ElastiCache Redis** | `cache.t4g.micro`, 1 GB | **~$15** |
| **Load balancer** | Application LB | **~$20** |
| S3 (SPA + media) | ~5 GB | **~$1** |
| Secrets Manager | ~8 secrets | **~$1** |
| CloudWatch | Logs + metrics | **~$15** |
| NAT / data transfer | Egress limited to managed endpoints; some transfer | **~$10** |
| Sentry | Team tier | **~$20** |
| **Estimated total** | | **~$162/month** |
| With 30% headroom | | **~$215/month** |

### 24.2 Staging and CI

| Component | Monthly |
|---|---|
| Staging: tasks, `db.t4g.small`, Redis, LB | ~$70 |
| Floci on a local host | $0 (electricity) |
| Self-hosted runner | $0 (existing host) |
| **Total** | **~$232/month** |

### 24.3 Cost drivers

| Driver | Impact | Control |
|---|---|---|
| **Database class** | Largest single line. One step up doubles it | Start at `t4g.medium`; scale on measured CPU |
| **Load balancer hours** | ~$16/mo base + LCUs | One LB, not two |
| **Fargate task hours** | Scales with replica count × uptime | Catalog 2, Commerce 2, Identity 2, Workers 1 |
| Log volume | Scales with request rate | 30-day retention; exclude bodies |
| **Idle replicas** | A fixed floor per service | Set the floor at 1-2. A 10-replica catalog is pure waste at this traffic |
| Data transfer | Egress from managed endpoints | Limited to what the architecture uses |
| Cross-AZ traffic | Charged within a region | PgBouncer and Redis in the same AZ as the services |

### 24.4 Scaling economics

| Scenario | Traffic | Database | Tasks | Monthly estimate |
|---|---|---|---|---|
| Current | ~10 req/s | `t4g.medium`, 2 AZ | 7 total | ~$162 |
| 5× | ~50 req/s | `t4g.medium`, 2 AZ | 12 total | ~$230 |
| 20× | ~200 req/s | `t4g.rds`, 2 AZ, read replica | 20 total | ~$600 |
| 100× | ~2000 req/s | Split databases (§7.2), multi-AZ | 40 total | ~$2,500 |

**Each step in that table is a decision made at the step below it, not a preemptive one.** There is no
scenario where the correct move is to scale up three levels at once — §7.2 names the trigger for each
split, and §5.8 names the signal for each replica increase.

### 24.5 Resource sizing rationale

| Resource | Size | Basis |
|---|---|---|
| identity task | 0.5 vCPU / 1 GB | Gunicorn with 2 workers. Django baseline memory |
| catalog task | 0.5 vCPU / 0.5 GB | Go. **Baseline ~15 MB**; memory is not the constraint |
| commerce task | 0.5 vCPU / 0.5 GB | Go, plus the outbox relay |
| workers task | 0.25 vCPU / 0.5 GB | Go. The lowest measured consumer rate in the system |
| PostgreSQL | `t4g.medium` (2 vCPU / 4 GB) | **The current `t3.micro` at 1 GB is overcommitted** (`ARCHITECTURE_REVIEW.md` §12.1). 4 GB covers PgBouncer's pool plus five databases' shared buffers plus OS cache |
| Redis | `cache.t4g.micro` (1 GB) | Streams capped at ~50k entries (§8.8) |
| Disk | 20 GB gp3 | Media in object storage, so the database holds only rows |

**Worker CPU at 0.25 vCPU is the sizing decision most worth flagging.** `workers` is the lowest-traffic
process in the system, and it hosts two consumers. 0.25 vCPU is genuinely adequate because event
processing is I/O-bound: each event is a small database write followed by an acknowledgement. Setting it
higher would be paying for CPU that sits idle between the ~0.25 events/s the system produces.

---

## 25. Operations

### 25.1 Day-to-day commands

| Command | Action |
|---|---|
| `make ps` | Service status, digests, health |
| `make logs S=<service>` | Tail logs |
| `make metrics` | Local metric output |
| `terraform plan` | Drift check |
| `terraform apply` | Reconcile |
| `make backup-db` | On-demand backup |
| `make restore-db` | Restore (destructive — confirmation required) |
| `make migrate` | Run pending migrations |
| `make rotate-keys` | Trigger rotation |
| `make seed` | Load fixtures into a non-production environment |

### 25.2 Routine schedule

| Frequency | Task |
|---|---|
| Per commit | CI: build, scan, test (§12.1) |
| Per merge to main | Full CI, staging deploy, smoke, Playwright (§12.2) |
| Per production release | Approved, gated, rolled (§12.6) |
| Daily | Drift check, backup verification (§19.5) |
| Weekly | Dependency updates, image rebuild cycle (§6.6) |
| Monthly | Access review, cost review, restore drill |
| Quarterly | **Backup restore drill.** Terraform upgrade review. Alert-threshold review |

### 25.3 Troubleshooting runbook

| Symptom | First step | Likely cause |
|---|---|---|
| Service not becoming healthy | `make ps`, then logs | Crash loop, failed migration, bad config |
| `/readyz` failing | `curl` the endpoint | Database unreachable, JWKS not loaded |
| `/healthz` failing | `docker ps` on the host | Container not running — this is distinct from readiness |
| Checkout timing out | Check `checkout_attempts_total{result}` | Database lock, or PgBouncer pool exhaustion |
| Events delayed | `consumer_lag_entries` | Consumer down, or Redis unreachable |
| Latency spike | Check DB CPU, then PgBouncer queue | Pool saturation or a slow query |
| 5xx spike | Correlate by `X-Request-ID` | Application error or dependency failure |
| Task won't start | Task exit reason in the console | Image pull failure, secret unavailable, OOM |
| Deploy blocked | Read the failed stage | A gate did not pass (§12.5) — **do not bypass it** |
| Terraform drift | `terraform plan` | Manual change or provider update |

**The health-check distinction is the most common source of wasted debugging time.** `/healthz` answers
"is the process alive"; `/readyz` answers "can it serve traffic". A Redis outage makes `/readyz`'s
*diagnostics* fail without making `/healthz` fail, and the task stays running (§8.6).

### 25.4 Incident severity

| Severity | Definition | Response | Examples |
|---|---|---|---|
| **SEV1** | Data loss or total outage | Immediate | Database unavailable, all services down, compromised credentials |
| **SEV2** | Major feature broken | Within the hour | Checkout failing, login broken |
| **SEV3** | Degraded, workaround exists | Business day | Elevated latency, one consumer lagging |
| **SEV4** | Cosmetic or internal | Scheduled | A stale metric, a noisy alert |

### 25.5 Incident response

| Step | Action |
|---|---|
| 1 | Identify scope: one service, one dependency, or all |
| 2 | Check whether it matches a §17 failure mode — **the matrix already names the impact and the recovery path** |
| 3 | Prefer the documented recovery (roll back, restart, let the outbox drain) over diagnosis under pressure |
| 4 | If it is a data-loss scenario, follow §17.6 rather than improvising |
| 5 | Roll back first, diagnose afterwards. **Rollback is cheaper than extended diagnosis** (§15.4) |
| 6 | Write it up: timeline, cause, and whether the design needs a change |

### 25.6 Security incident

| Step | Action |
|---|---|
| 1 | Revoke: rotate affected credentials, invalidate sessions |
| 2 | Contain: scale the affected service to zero if compromise is suspected |
| 3 | Assess: which roles, which data, which timeframe |
| 4 | Preserve: snapshot before remediation — logs and snapshots are evidence |
| 5 | Remediate: patch, redeploy, verify |
| 6 | Post-incident: update §23.8 if the threat was not listed |

### 25.7 Disaster recovery

| RPO | Value | Mechanism |
|---|---|---|
| Database | ≤ 5 minutes | Automated backups + PITR |
| Redis | 0 | Outbox re-derivation (§8.7). Nothing is lost |
| Object storage | ≈ 15 minutes | Versioning + replication |
| Configuration | 0 | Terraform. `apply` reproduces it |
| **Overall** | **≤ 5 minutes** | The binding constraint is the database |

| RTO | Scenario | Procedure |
|---|---|---|
| Minutes | Single task failure | Automatic replacement |
| Minutes | Single service failure | Roll back or redeploy (§15) |
| ~1 hour | Full application failure | Redeploy the last known-good digest to all services |
| ~4 hours | Database instance loss | Managed failover |
| ~8 hours | Region or account loss | Restore into a new environment from Terraform + backup |
| **Weeks** | **Corruption or accidental deletion** | **PITR to a point in time** |

**Recovery is a Terraform `apply`.** Because configuration is code and data is a backup, a full
environment rebuild is a matter of changing variables and applying. This is the practical payoff of the
IaC mandate.

**Two drills are mandatory before production traffic (§21.4 steps 10-11):**

| Drill | Verifies | Frequency |
|---|---|---|
| **Restore from backup** | Backups are actually restorable, and the procedure works | Monthly, automated |
| **Database failover** | Managed failover completes within RTO | Quarterly, on real infrastructure |

**A restore drill that has never been run is a hypothesis, not a backup strategy.** And on a local cloud,
failover is a §20.3 difference, which is why it is deferred to real infrastructure rather than claimed
as tested.

---

## 26. Definition of Done

### 26.1 Infrastructure

- [ ] Terraform module structure matches §3.2
- [ ] `terraform validate` passes in every environment
- [ ] `terraform fmt -check` and `terraform lint` pass
- [ ] `terraform plan` on a clean environment shows only intended resources
- [ ] `make infra-reset && make infra-up` succeeds on a clean host
- [ ] A second `make infra-up` reports **no changes**
- [ ] `make infra-destroy` leaves no resources
- [ ] No secret is committed, including in `.tfvars`
- [ ] No manual console resource exists

### 26.2 Compute and networking

- [ ] All four services run as tasks
- [ ] Tasks are non-root, read-only filesystem, no shell (Go), distroless base
- [ ] The edge can reach services; **the edge cannot reach any datastore**
- [ ] Services cannot reach each other
- [ ] Egress is limited to the three managed-service endpoints
- [ ] Replica counts and autoscaling match §5.8

### 26.3 Data stores

- [ ] Five logical databases with five separate roles
- [ ] Each role can reach only its own database (`search_path` set)
- [ ] `sneakin_migrate` is the only role with DDL
- [ ] `workers` uses two separate credentials, one per consumer
- [ ] PgBouncer is in transaction mode, with `max_connections` reconciled against instance capacity
- [ ] Go drivers use prepared-statement-safe pooling (§7.5)
- [ ] Redis has `appendonly yes`, `maxmemory-policy noeviction`
- [ ] Redis databases are separated per §8.10
- [ ] Backups are automated, encrypted, and **restore-tested** (§25.7)

### 26.4 Application contract

- [ ] `/healthz` has no dependencies
- [ ] **`/readyz` excludes Redis** and checks Postgres + JWKS
- [ ] `/diagnostics` is authenticated and returns no raw exception text
- [ ] Structured JSON logs with `correlation_id` on every line
- [ ] EMF-style metrics for every metric in §11.3
- [ ] `traceparent` propagated; `trace_id` in logs
- [ ] No request or response body is logged
- [ ] Graceful shutdown on SIGTERM, draining in-flight requests (§5.8)

### 26.5 Delivery

- [ ] CI runs on every push and PR, with a concurrency group
- [ ] Frontend lint, typecheck, and test scripts **exist**
- [ ] Go tests and `go vet` run
- [ ] Terraform lint and validate run
- [ ] Images are built once, scanned, SBOM'd, and promoted by digest
- [ ] Workflows use **SHA-pinned** actions
- [ ] Production auth uses OIDC; **no long-lived cloud credentials anywhere**
- [ ] `permissions:` is declared at minimum scope
- [ ] Migrations run **before** the service update
- [ ] Deployment waits on readiness — **no `sleep`**
- [ ] Rollback is documented and rehearsed (§15.4)
- [ ] Production requires manual approval

### 26.6 Testing

- [ ] Unit, integration, contract, and E2E suites all run
- [ ] Playwright runs against a deployed environment
- [ ] E2E covers checkout, login, registration, cart, wishlist, and the admin path
- [ ] **Oversell concurrency test passes** (§14.5)
- [ ] **Redis-down checkout test passes** (§14.5)
- [ ] Every alert in §11.6 is verified to fire

### 26.7 Observability

- [ ] Logs, metrics, and traces are queryable in every environment
- [ ] A dashboard exists for request rate, error rate, latency, consumer lag, and outbox depth
- [ ] Every alert has been **triggered deliberately at least once**
- [ ] Drift detection runs on a schedule and alerts on drift

### 26.8 Documentation

- [ ] `README.md` documents `make bootstrap` through `make e2e`
- [ ] Every §17 failure mode has a runbook entry
- [ ] Floci capability gaps (§2.7) are resolved or accepted in writing
- [ ] **The restore drill has been run and recorded**

### 26.9 Explicitly out of scope

| Not doing | Why |
|---|---|
| Kubernetes | §22 |
| Kafka / NATS / RabbitMQ | §22 |
| Service mesh | §22 |
| gRPC | §22 |
| Multi-region | ~10 req/s. §7.2 gives the trigger |
| Read replicas | §22 |
| Blue/green or canary | §15.2 |
| Full OpenTelemetry | §22 |
| ELK | §22 |

---

## Appendix A — Decision Register

Every significant choice, with its reason, its alternatives, and the signal that would reverse it.

| # | Decision | Alternatives considered | Why chosen | Revisit trigger |
|---|---|---|---|---|
| D1 | ECS/Fargate-style tasks | EC2 directly; Kubernetes | Long-running services, task roles, no cluster to operate | Kubernetes at >20 services |
| D2 | **PgBouncer** (reverses `ARCHITECTURE_REVIEW.md` §8.3) | Direct connections; larger instance | 224 worst-case connections vs a default `max_connections` of 100. **Horizontal scaling requires a pooler** | Never |
| D3 | One PostgreSQL instance, five databases | Five instances; one database per service per host | ~0.25 req/s of writes. A split is operational overhead without benefit | §7.2 triggers |
| D4 | Object storage for SPA and media | Shared filesystem; volume + nginx | Task filesystems cannot share volumes | Never |
| D5 | **Omit Redis from `/readyz`** | Include Redis in health | Redis failure must not cause a restart loop. Checkout does not depend on Redis | Never |
| D6 | Split `/healthz` / `/readyz` / `/diagnostics` | Single `/health` | Liveness, readiness, and diagnostics have different consumers and different failure semantics | Never |
| D7 | Outbox + Redis Streams | Kafka; direct publish from the request | Transactional guarantee with the source of truth in PostgreSQL | Sustained >100 events/s |
| D8 | Acknowledge after commit | Acknowledge before | Acknowledging first loses events on crash. **The single most important consumer rule** | Never |
| D9 | Deduplication in PostgreSQL | Deduplication in Redis | Wiping Redis must not wipe dedup state, or the design loses its Redis-loss recovery path | Never |
| D10 | Dead letters in PostgreSQL | Redis dead-letter stream | Durable, SQL-queryable, survives the Redis-loss scenario | Never |
| D11 | Rolling deployments | Blue/green; canary | Low traffic, single-instance database. Blue/green doubles compute for zero benefit | Traffic high enough that downtime is unacceptable |
| D12 | Migrations as one-off tasks | Init containers; migrate-on-start | Deterministic ordering, auditable, failure is visible. Init containers have no clear completion semantics | Never |
| D13 | Build once, promote by digest | Rebuild per environment | The artifact tested is the artifact deployed | Never |
| D14 | Plain `.sql` + Django `migrate` | Alembic; Atlas; Flyway | Migrations span Django and three Go services. One mechanism, one dialect | Never |
| D15 | Expand/contract | Single destructive migrations | A destructive migration cannot be rolled back with a code rollback | Never |
| D16 | **Two-tier CI** (reverses the ephemeral-everywhere reading) | One ephemeral environment per job | Floci cannot host ten parallel environments. The Fast tier covers 92% of tests in seconds | Floci supports concurrent environments cheaply |
| D17 | Full-tier environment retained and reset | Recreate per run | Data resets in seconds; infrastructure recreates in minutes | Not practical |
| D18 | **Playwright not run in production** | Smoke against production | Synthetic transactions against real orders create real data. Smoke only | Test data isolation exists |
| D19 | Terraform for everything | Console + a script | Reproducibility is a stated requirement. No manual resources | Never |
| D20 | **Routes by path prefix, not subdomain** | Subdomain per service | nginx was already path-routed and the SPA assumes a single origin. Changing it would break the frontend for no benefit | Service count or isolation needs justify it |
| D21 | Rate limit at the edge | Per-service rate limiting | Keeps the hot path out of application code and protects every service uniformly | Per-service quotas become necessary |
| D22 | Structured JSON logs | Plain text | Machine-queryable; metric extraction; alerting on log content | Never |
| D23 | Minimal actionable alerts | Alert on every metric | Alert fatigue causes real alerts to be ignored. Nine alerts, each tied to a §17 failure mode | Never |
| D24 | Defer full OpenTelemetry | Full OTel from the start | `traceparent` and `trace_id` in logs already deliver correlation | §11.9 triggers |
| D25 | Deploy `main` directly | `develop` + `release` branches | `develop` does not exist today (C7s). Two extra branches add ceremony without adding safety | Multiple release trains |
| D26 | Break-glass admin credentials | No break-glass path | Recovery must not require the migration role or an emergency IAM change | Never |
| D27 | Stateless services | Session affinity | Horizontal scaling and zero-downtime replacement require it | Never |
| D28 | Nightly CI environment retained | Destroy after each run | Investigating a failure needs the environment that failed | Not practical |
| D29 | Restore drill scheduled | Restore on demand | An untested restore procedure is a hypothesis | Never |
| D30 | SNS/SQS opt-in | Enable now | The outbox already handles retry with backoff and survives Redis loss. SQS would duplicate that with a second broker | If broker-native retry becomes worth a dependency |

### A.1 Decisions this document reverses

| Document | Original position | New position | Reason |
|---|---|---|---|
| `ARCHITECTURE_REVIEW.md` §8.3 | Direct connections; PgBouncer listed as a deliberate omission | **PgBouncer required** | Connection count scales with replicas (§7.5) |
| `ARCHITECTURE_REVIEW.md` §8 | Docker Compose as the deployment target | **Terraform-managed tasks** | Mandated infrastructure mandate |
| `ARCHITECTURE_REVIEW.md` §13 | Optional container registry | **Registry with digest promotion** | §6.3 |
| `ARCHITECTURE_REVIEW.md` §11 | `/api/health/` including Redis | **Three-endpoint split; Redis excluded from readiness** | §0 C4 |
| Mandated ephemeral-per-job CI | "Disposable test environments where practical" | **Two-tier, with the Full tier retained and reset** | Feasibility on a local cloud (§0 C6) |
| `cd.yml` | SSH deploy, `sleep 15`, deploy-before-migrate | **OIDC, readiness-gated, migrate-first** | §0 C7 |
| §1.1 of this document (draft) | Workers own the outbox relay | **Commerce owns the outbox and its relay** | Ownership follows the data |

---

## Appendix B — Failure Modes Summary

The consolidated matrix; §17 contains the per-scenario detail.

| # | Failure | Impact | Data loss | Detection | Recovery | Automatic? |
|---|---|---|---|---|---|---|
| F1 | Single task exits | One service degraded | None | Task state, `/readyz` | Replacement task | Yes |
| F2 | Bad image deployed | Service crash loop | None | Deploy gate, `/healthz` | Roll back to previous digest | Yes |
| F3 | Redis down | **Events delayed. Checkout unaffected** | None | `redis_up=0`, consumer lag | Redis recovers; outbox drains | Partial |
| F4 | Redis data wiped | Events re-derived from the outbox | None | Consumer lag spike | Relay republishes | **Yes** |
| F5 | Consumer crash mid-batch | Events redelivered | None | `XPENDING` | `XAUTOCLAIM` | Yes |
| F6 | Poison event | One event dead-lettered after 5 attempts | None | `dead_letters_total` | Manual replay | No |
| F7 | PostgreSQL unavailable | Total outage | None | `/readyz`, metrics | Managed failover | Yes |
| F8 | Database corruption | Total outage | **Possible** | Checksums, monitoring | **PITR** | No |
| F9 | Bad migration | Service fails to start | None | Migrate stage exit | Roll back code; forward-fix migration | No |
| F10 | OOM kill | One task restarts | None | Exit reason, memory metric | Scale memory or fix the leak | Partial |
| F11 | Edge down | Total outage | None | `/healthz` on the edge | Managed redundancy | Partial |
| F12 | Certificate expiry | Edge rejects traffic | None | Expiry alert | Managed renewal | Yes |
| F13 | Secret unavailable | One service cannot start | None | Task exit reason | Restore secret version | No |
| F14 | Clock skew | JWT rejected | None | 401 rate | NTP | Yes |
| F15 | Log volume spike | Logs dropped or cost spike | None | Log-service quota alert | Retention, sampling | Partial |
| F16 | **CI/CD fails mid-deploy** | **Partial new version running** | **Possible** | Stage exit | **Roll back to previous digest** | No |
| F17 | Traffic spike | Latency, possible saturation | None | Latency alert, autoscaling | Scale out | Yes |
| F18 | Host lost | Tasks rescheduled | None | Task state | Replacement tasks | Yes |
| F19 | Datastore disk full | Writes fail | None | Disk alert | Extend storage | No |
| F20 | Account/region loss | Total outage | Recoverable | — | Terraform + backup rebuild | No |

**Twelve of twenty failure modes recover automatically.** That ratio is a direct consequence of
health-gated rolling deploys, digest pinning, and an outbox that makes the transport disposable.

---

## Appendix C — Implementation Checklist

Ordered by dependency. Each item is verifiable.

### Phase 0 — Foundations

1. [ ] Repository structure: `infra/terraform/{modules,environments}`, `Makefile`
2. [ ] `modules/network` — VPC, subnets, route tables, security groups
3. [ ] `modules/database` — PostgreSQL instance, 5 logical databases, 5 roles, backups
4. [ ] `modules/database-proxy` — PgBouncer instance, instance-role grants, pooler security group
5. [ ] `modules/redis` — Redis instance, parameter group, security group
6. [ ] `modules/secrets` — generation, storage, rotation
7. [ ] `modules/iam` — roles, policies, per-service least privilege, OIDC trust
8. [ ] `modules/compute` — task definition, service, autoscaling
9. [ ] `modules/registry` — container registry
10. [ ] `modules/storage` — SPA and media buckets
11. [ ] `modules/edge` — LB, listener rules, target groups, TLS
12. [ ] `modules/observability` — log groups, metric filters, the nine alerts in §11.6
13. [ ] `modules/delivery` — artifact bucket, runner role, deployment role
14. [ ] `environments/floci`, `environments/staging`, `environments/production`
15. [ ] `make infra-reset && make infra-up` succeeds

### Phase 1 — Application prerequisites

16. [ ] `/healthz` with no dependencies
17. [ ] `/readyz` with Postgres and JWKS, **excluding Redis**
18. [ ] `/diagnostics`, authenticated, no raw errors
19. [ ] Structured JSON logging with `correlation_id`
20. [ ] EMF-style metrics for §11.3
21. [ ] Graceful SIGTERM handling
22. [ ] Go prepared-statement-safe connection pooling — `default_query_exec_mode=exec` (§7.5, ADR-0003)
23. [ ] `/version` reporting the digest

### Phase 2 — Delivery

24. [ ] Per-service Dockerfiles: multi-stage, non-root, distroless for Go
25. [ ] Frontend Dockerfile producing a static bundle
26. [ ] `.github/workflows/ci.yml` rewritten
27. [ ] Build-once, scan, SBOM, promote-by-digest pipeline
28. [ ] `.github/workflows/cd.yml` rewritten: OIDC, migrate-first, readiness-gated
29. [ ] SHA-pinned actions; `permissions:` blocks
30. [ ] Concurrency groups on both workflows
31. [ ] Deployment environments with required reviewers

### Phase 3 — Testing

32. [ ] Frontend `test`, `lint`, `typecheck` scripts
33. [ ] Go tests, `go vet`
34. [ ] Contract tests for §11.2
35. [ ] System integration tests (§14.5), **including oversell and Redis-down**
36. [ ] Playwright suite (§13.3) on a self-hosted runner
37. [ ] Smoke test (§14.6)

### Phase 4 — Operations

38. [ ] Dashboards for §11.5
39. [ ] The nine alerts in §11.6, **each verified to fire**
40. [ ] Runbooks for every §17 failure mode
41. [ ] Automated backups with a verified restore
42. [ ] Drift detection on a schedule
43. [ ] `README.md` with the full Make target list
44. [ ] Floci capability gaps resolved or accepted in writing

---

## Appendix D — Document Map

| Section | Contents |
|---|---|
| §0 | Contradiction register — every conflict and its resolution |
| §1 | Overall architecture; deployment and testing architecture |
| §2 | Floci architecture and capability matrix |
| §3 | Terraform architecture |
| §4 | Networking |
| §5 | Compute and task runtime |
| §6 | Image lifecycle |
| §7 | PostgreSQL and PgBouncer |
| §8 | Redis and event streaming |
| §9 | Secrets and IAM |
| §10 | Edge and load balancing |
| §11 | Observability |
| §12 | CI/CD |
| §13 | Playwright and E2E |
| §14 | Testing pyramid |
| §15 | Deployment strategy |
| §16 | Database migration strategy |
| §17 | Failure modes and recovery |
| §18 | Local developer experience |
| §19 | CI environment |
| §20 | Production equivalence |
| §21 | Floci to AWS migration |
| §22 | Deliberately unused technologies |
| §23 | Security model |
| §24 | Cost and resource model |
| §25 | Operations |
| §26 | Definition of done |
| A | Decision register |
| B | Failure modes summary |
| C | Implementation checklist |
| D | Document map |

### Related documents

| Document | Relationship |
|---|---|
| `ARCHITECTURE_REVIEW.md` | **Authoritative** for application and domain architecture. This document must not contradict it except where §0 or Appendix A.1 records an explicit reversal |
| `ARCHITECTURE_ANALYSIS.md` | Prior analysis. Source of the Inventory contradiction resolved in `ARCHITECTURE_REVIEW.md` |
| `.github/workflows/ci.yml` | To be replaced by §12.1 |
| `.github/workflows/cd.yml` | To be replaced by §12.6 |
| `nginx/nginx.conf` | Reference for current edge behaviour; §10 replaces it |
| `backend/apps/accounts/health_views.py` | Reference for the current `/api/health/`; §11.5 replaces it |
| `docker-compose*.yml` | Transitional local development path (`make dev`, §18.5) |

---

## Appendix E — Reading Order

**For a reviewer who wants to check the decisions:** §0 → Appendix A → §22 → §24

**For someone implementing the platform:** §3 → §4 → §5 → §7 → §9 → §10 → Appendix C

**For someone building the delivery pipeline:** §6 → §12 → §13 → §15 → §16

**For someone on call:** §17 → §25 → Appendix B

**For understanding the event architecture:** §8 → §17 (F3-F6) → Appendix B

**For the shortest possible summary:** this document's §1.2 diagram, §7.2 instance sizing, and §26
Definition of Done.
