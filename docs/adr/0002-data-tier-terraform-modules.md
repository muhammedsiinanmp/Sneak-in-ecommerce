# ADR-0002: Three data-tier Terraform modules, not one `datastores`

- Status: Accepted
- Date: 2026-10-06
- Deciders: Architecture owners
- Approved: Repository owner, 2026-10-06
- Supersedes: none
- Superseded by: none
- Governing sections: I §3.1, I §3.2, I §3.10, I §4.6, I §7.5, I §8.2, I §21.1
- Refs: `REPOSITORY_ENGINEERING_STANDARD.md` §1.4 C-7, §21.1 Q2

## Context

`INFRASTRUCTURE_ARCHITECTURE.md` contradicts itself about the Terraform module layout of the data tier.
This is a self-conflict inside a single authoritative document, not an R-versus-I conflict. `R` is
silent: `ARCHITECTURE_REVIEW.md` §8.3 specifies no Terraform at all, because its deployment model is
Docker Compose on one host.

The two forms:

| Location | Form | Detail |
|---|---|---|
| I §3.1 "Structure" (directory tree) | three modules | `database/`, `database-proxy/`, `redis/` |
| I §3.1 layered table, row **L3 Data** | three modules | `modules/database`, `modules/redis`, `modules/storage` |
| I §3.10 "Inter-module ordering" | three modules | `network → (SGs) → database (+ roles) → database-proxy → redis → …` |
| I Appendix C, Phase 0 item 3 | one module | `modules/datastores` — "PostgreSQL with five databases and five roles, Redis" |

The word "datastores" is I's preferred *prose* term for the data tier as a whole. It appears about ten
times in narrative and role text (I §1.1, §4.4, §2.8, §5.5, §9.x, §21.1, §23.2). That usage is
correct and stays. The question is only whether a single Terraform **module** named `datastores`
should implement it.

### Why the single module cannot represent I's own design

**1. It destroys the dependency ordering I §3.10 states as a fact.** I §3.10 presents an explicit
ordering Terraform "must express, and does":

```
network → (security groups) → database (+ roles) → database-proxy → redis → storage → …
```

A merged `datastores` module has no way to express `database → database-proxy` as an edge in the root
module's graph. The ordering would collapse into the module's internals and become invisible to every
root module that composes it. That is precisely the failure I §3.2's module-boundary rules exist to
prevent: "Modules compose through their declared outputs", and a module exposes
"outputs for everything a parent needs".

**2. It couples three resources with no shared lifecycle.** PostgreSQL, PgBouncer, and Redis differ in
engine, backup and restore procedure, patch cadence, parameter surface, security-group topology, and
failure behaviour. Merging them means changing Redis capacity forces a review of PostgreSQL code, and
a change to PgBouncer's parameter surface touches the same files as Redis's. I treats each of these as
a separate operational surface throughout §7.5 (PgBouncer settings), §8.4/§8.5 (Redis persistence and
eviction), and §7.7 (PostgreSQL backup and PITR).

**3. `database-proxy` is not a datastore at all.** It is a connection pooler in front of exactly one
engine. I §3.1 describes it as "PgBouncer instance + instance-role grants"; I §16.3 gives it its own
security group (`pgbouncer-sg`), its own port (6432), and its own exception path for migrations. A
name that says "datastores" cannot contain it, and I Appendix C item 3 does not mention it — so the
single-module form also silently drops a required component.

**4. Three of four sites outvote one.** I §3.1's tree is the section headed "Structure" and is the
document's designated statement of layout; it is reinforced by the L3 Data row and by §3.10's
ordering. Appendix C is a *checklist* ("Ordered by dependency. Each item is verifiable"), and a
checklist is a summary of the design, not the design.

### What Appendix C item 3 additionally gets wrong

Read against I §3.1, the Phase 0 checklist is not merely misnamed — it is incomplete. It lists
`network`, `datastores`, `secrets`, `compute`, `registry`, `storage`, `edge`. It omits
`database-proxy`, `iam`, `observability`, and `delivery`, all of which I §3.1 declares and all of
which are load-bearing: `database-proxy` because PgBouncer is mandatory (I §7.5), `iam` because every
task has an execution role (I §4.5), `observability` because the nine alerts in I §11.6 must exist
before Phase 0 exits.

## Decision

The data tier is **three separate modules**: `modules/database`, `modules/database-proxy`, and
`modules/redis`. `I §3.1` is correct as written. **Appendix C, Phase 0 item 3 is wrong and is
corrected**, and the checklist is completed to match §3.1.

No change to `ARCHITECTURE_REVIEW.md` is required — it specifies no Terraform.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| One `modules/datastores` module (I Appendix C item 3) | Cannot represent `database → database-proxy → redis` ordering at the root-module graph level; couples three unrelated lifecycles; the name excludes the pooler it would have to contain. Rejected despite being one of only four sites, because the other three describe a design the merged module cannot express. |
| Two modules: `modules/database` (including the pooler) + `modules/redis` | The pooler has its own security group, port, instance role, and migration exception in I §16.3. Bundling it into `database` makes the pooler's blast radius the instance's blast radius. |
| One module per resource rather than per tier | Twelve modules for twelve resources is over-fragmentation for a system with three datastores, and it would break I §3.2's rule that a module composes through declared outputs. |
| Renaming the three modules to `datastores-*` for consistency with I's prose | Cosmetic churn that would require editing the directory tree, the L3 row, and the §3.10 ordering diagram to change nothing about behaviour. The prose term and the module name are allowed to differ, as they already do for `storage` (S3 buckets are not "datastores"). |

## Consequences

**Easier.** The §3.10 ordering becomes representable and reviewable in the root modules. PgBouncer's
configuration and its required version floor are changeable without touching PostgreSQL or Redis
code. The three-datastore data plane described in I §23.2 maps one-to-one onto module boundaries.

**Harder.** Three modules instead of one means three provider configurations and three sets of
outputs to wire in each of the three root modules. This is the cost I §3.2's rules are designed to
pay, and it is what makes the §3.10 ordering expressible.

**Must now be true.** `modules/database-proxy` exists in Phase 0, not later. Appendix C's Phase 0
checklist covers all twelve modules in I §3.1.

## Verification

- **Source correction, reviewed.** I Appendix C Phase 0 item 3 is replaced with:
  `3. [ ] modules/database — PostgreSQL instance, 5 logical databases, 5 roles, backups`, followed by
  new items for `modules/database-proxy`, `modules/redis`, `modules/iam`, `modules/observability`, and
  `modules/delivery`, renumbered to keep the list ordered by dependency as its preamble requires.
- **CI, job 5 (`infra-plan`, "plan only")** — fails on an unguarded destroy, which is the existing
  I §12.1 job 5 assertion. Renaming or removing any of the three module directories now surfaces as a
  destroy plan and is caught before merge rather than after the state file references a path that no
  longer exists.
- **CI, new assertion in the same job** — every module directory listed in I §3.1 exists under
  `infra/terraform/modules/`. This is the check that prevents this conflict recurring, because it makes
  the tree in §3.1 executable.
- **Review** — I §3.10's ordering diagram and the L3 Data row continue to name three modules.