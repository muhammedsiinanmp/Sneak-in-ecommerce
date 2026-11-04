# ADR-0001: One Redis stream key, `sneakin:<env>:events`

- Status: Accepted
- Date: 2026-10-06
- Deciders: Architecture owners
- Approved: Repository owner, 2026-10-06
- Supersedes: none
- Superseded by: none
- Governing sections: I §4.6, I §8.1, I §8.2, I §3.3, R §2.5
- Refs: `REPOSITORY_ENGINEERING_STANDARD.md` §1.4 C-1, §21.1 Q1

## Context

Three statements about the domain-event stream key exist across the authoritative documents. They
disagree, and they do not agree even with each other.

| Source | Statement |
|---|---|
| R §2.5 (pseudocode, `XADD` failure example) | `XADD sneakin:events * ...` |
| R §2.5 (technology matrix, Transport row) | "one stream per environment (`sneakin:dev`, `sneakin:prod`)" |
| I §8.2 (topology diagram, Redis logical DB 3) | `stream: sneakin:<env>:events` |
| ARCHITECTURE_ANALYSIS.md | silent — contains no stream key |

Two independent separations already exist before the key name is even considered:

- **Environment.** I §3.3 gives each environment its own root module, its own Terraform state
  (I §3.9: "State isolation per environment is mandatory"), and its own VPC with **non-overlapping
  CIDRs** (I §3.3 variables table: "Different per environment; never overlapping"). Redis is one of
  the three datastores in that VPC (I §4.4). No two environments can share a Redis node.
- **Purpose.** I §4.6 assigns logical database `3` to domain events and `1`/`2` to transitional
  Celery. I §8.2 states the rationale: "Separating streams from Celery means decommissioning Celery
  cannot affect event delivery." Celery's transitional keys can therefore never collide with domain
  events regardless of what either is named.

So the `<env>` component in I §8.2's key is **not load-bearing for isolation**. It is defence in
depth: if a service is ever misconfigured with the wrong Redis endpoint, the resulting key appears
under a different name and is trivially detectable, rather than silently merging into the live stream.

That defence is worth having, but it is not worth a naming conflict — and R's two forms cannot
provide it.

### The specific defects in R's names

1. **They do not enumerate the environments that exist.** I §3.3 defines three: `floci`, `staging`,
   `production`. R names `dev` and `prod` — two names, neither of which is an I environment
   identifier. There is no R name for `staging` at all.
2. **R contradicts itself within a single section.** R §2.5 uses `sneakin:events` in its pseudocode
   and `sneakin:dev`/`sneakin:prod` in its matrix, thirteen lines apart.
3. **R's matrix row is also wrong about consumer groups.** It says "one consumer group per
   service-role". I §8.2 fixes exactly four named groups (`commerce-cart-clear`,
   `workers-engagement`, `workers-reporting`, `catalog-availability`) and states this is "the fan-out
   requirement from `ARCHITECTURE_REVIEW.md` §3.6". The row is a summary that was not kept in step
   with §3.6.

### Where the authority lies

The stream key is **infrastructure configuration**. It names a Redis key inside a Terraform-provisioned
Redis instance with a Terraform-managed parameter group (I §3.1 `modules/redis`), ACLs (I §8.11), and
logical-database assignment (I §4.6). I is authoritative for infrastructure. R's mention of the key is
incidental to its actual argument in §2.5 — that publishing to a broker inside a database transaction
is not atomic and therefore an outbox is mandatory. That argument is unaffected by the key's spelling.

### A separator inconsistency worth recording, not fixing

I §6.2 sets the cloud-resource naming pattern as `<env>-<region>-<service>-<resource>-<qualifier>`
(hyphens), and I §4.7 names buckets `sneakin-{env}-spa`, `sneakin-{env}-static`. I §8.2's stream key
uses colons. This is **not** an error and must not be "corrected" later: colons are the conventional
namespace separator for Redis keys, and hyphens would collide with the product name `sneakin-` in I
§6.2's hyphenated pattern, making `sneakin` and `sneakin-<env>-spa` harder to parse, not easier. The
divergence is deliberate and is recorded here so a later reader does not read it as drift.

## Decision

The domain-event stream key is **`sneakin:<env>:events`**, in Redis logical database `3`, on the
single stream per environment. `<env>` is `floci`, `staging`, or `production`, matching I §3.3's
environment identifiers exactly.

`ARCHITECTURE_ANALYSIS.md` is not a source for this decision and requires no change.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| `sneakin:dev` / `sneakin:prod` (R §2.5 matrix) | Incomplete — omits `staging` entirely; uses identifiers that do not exist in I §3.3; and the row that contains it is also wrong about consumer groups, so it is not a reliable statement of R's intent. |
| `sneakin:events` (R §2.5 pseudocode) | Environment-agnostic, so it discards the defence-in-depth property for no benefit, given that isolation already comes from separate Redis instances. It also appears inside pseudocode whose purpose is to illustrate a transaction failure, not to specify a key. |
| `sneakin-events` or `sneakin-<env>-events` | Would align with I §6.2's hyphenated pattern but collides with the `sneakin-` product prefix and abandons the Redis colon convention. No operational benefit; only churn. |
| Merging PostgreSQL and Redis into one `modules/datastores` module | Rejected in ADR-0002. Not a naming question, but it is the one remaining place where the word "datastore" could be mistaken for the key convention. |

## Consequences

**Easier.** One name pattern covers all three environments, including the one R omitted. The
environment component is derivable from configuration the service already has, so no environment name
is hard-coded in application source.

**Harder.** Two edits to `ARCHITECTURE_REVIEW.md` §2.5 are required (see Verification) — one to the
pseudocode, one to the matrix row — and the matrix row's consumer-group claim must be corrected at
the same time.

**Must now be true.** The stream name is computed from configuration, never string-concatenated in
service code. `sneakin:events` must not appear as a literal anywhere outside documentation
illustrating why an outbox is required.

## Verification

- **Source correction, reviewed not automated.** `ARCHITECTURE_REVIEW.md` §2.5 pseudocode becomes
  `XADD sneakin:<env>:events * ...`; the Transport matrix row's key becomes `sneakin:<env>:events` and
  its consumer-group clause becomes "one of four fixed consumer groups (I §8.2)".
- **CI, new job** — a repository-wide assertion that `sneakin:events` appears nowhere outside the R
  §2.5 explanatory pseudocode, and that the only stream-key literal in `infra/`, `deploy/`, and
  `scripts/` is the pattern `sneakin:${env}:events`.
- **Review** — `observability/dashboards/` and `observability/runbooks/` contain no stream literal that
  omits the environment component.