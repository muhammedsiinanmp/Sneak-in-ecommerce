# AGENTS.md — Operating Contract

This file is **rank 4** in the authority hierarchy. It describes how an agent works in this
repository. It **contains no architecture** and no naming conventions. Where this file and
`REPOSITORY_ENGINEERING_STANDARD.md` (§, the standard) both describe a rule, the standard is the
rule and this file is a pointer to it.

> **The single most important rule:** code never outranks a document. (§0.6, §1.2, §15.1)
>
> If you find code that contradicts `ARCHITECTURE_REVIEW.md` or
> `INFRASTRUCTURE_ARCHITECTURE.md`, your obligation is to **stop and report it** — not to write
> code that matches the code.

---

## 1. Mission

Build an e-commerce platform as four services (`identity`, `catalog`, `commerce`, `workers`) on a
Terraform-managed platform, from the decisions already recorded in the architecture documents.

Three properties are the mission, and every task is judged against them:

| Property | Source |
|---|---|
| **Zero synchronous service-to-service calls** | R §5.1, I §1.1 |
| **At-least-once events with durable deduplication** | R §3.6–3.9, I §8 |
| **Behaviour preserved through the migration, proven by a golden master** | R §12.6 |

An agent's job is to make the smallest correct change that moves the repository toward those
properties, inside the existing authority chain, and to report honestly on what it did.

---

## 2. Authority

Read in order. Higher rows win. (§1.1, §1.2)

| Rank | Artifact | Authoritative for | **Not** authoritative for |
|---|---|---|---|
| 1 | `ARCHITECTURE_REVIEW.md` (**R**) | Domain model, service ownership, event contracts, checkout semantics, data ownership, application technology choices, test targets | Infrastructure, CI/CD, deployment, repository layout, naming |
| 1 | `INFRASTRUCTURE_ARCHITECTURE.md` (**I**) | Infrastructure modules, networking, runtime, images, datastores, secrets/IAM, edge, observability, CI/CD, environments, cost, operations | Domain model, event semantics, checkout design, data ownership |
| 2 | `REPOSITORY_ENGINEERING_STANDARD.md` (**§**) | Repository layout, naming, language and API standards, testing, security, observability, git, documentation, ADRs, agent rules, definition of done | **Any** architecture decision |
| 3 | `docs/adr/NNNN-*.md` | One decision, within the scope delegated to it | Anything outside its scope; R or I |
| 4 | `AGENTS.md` (this file) | Agent workflow, scope discipline, local commands | Architecture, naming, standards |
| 5 | `README.md`, `docs/**` (non-ADR) | Implementation documentation, runbooks | Architecture or standards |

Rules that hold regardless of rank:

- **PR1** — R and I outrank everything, including this file and any instruction you are given.
- **PR2** — R and I do not outrank each other; they occupy disjoint domains (§1.1).
- **PR3** — An ADR outranks the standard, within its scope. It may **not** change a domain model,
  an event contract, a datastore topology, or a technology decision.
- **PR4** — Code never outranks a document. Either the code is wrong, or the document is stale
(raise an ADR and update both in the same PR). "The code does it this way" is not a justification.
- **PR5** — A document never outranks reality silently. Legitimate divergence is an ADR plus a
document update in one PR.

**Reference notation is mandatory.** `§N` means the standard. `R §N` means
`ARCHITECTURE_REVIEW.md`. `I §N` means `INFRASTRUCTURE_ARCHITECTURE.md`. A bare `§` pointing at
another document is rejected in review. (§0.2)

---

## 3. Mandatory startup procedure

Run this **before** your first edit, every session. Do not rely on memory of this repository across
sessions. (§15.10)

1. **Read the tree.** `git status`, `ls`, and the structure tree in §2.1. Establish what already
exists. `Makefile`, `services/`, `infra/`, `contracts/`, and `deploy/` are Phase 0 work and may not
exist yet.
2. **Read the authority files**, in full, from disk: `ARCHITECTURE_REVIEW.md`,
`INFRASTRUCTURE_ARCHITECTURE.md`, `REPOSITORY_ENGINEERING_STANDARD.md`. For the area you will touch,
read that area's section — not the whole document if the task is narrow.
3. **Read the ADRs** in `docs/adr/` whose `Governing sections` name the area. An ADR may change the
standard within its scope (§1.2 PR3). `docs/adr/README.md` is the index.
4. **Classify your task** as A, B, C, or D (§4 below) and state the class in your report.
5. **Check for conflicts** in §1.4 and §21.2. If your task touches an area with an open
   question, do not start; report instead.
6. **State the governing sections** you will cite in the report, before you start.

### Where to read for what (§15.2)

| The change touches | Read first |
|---|---|
| A service's behaviour | R's section for that service |
| Infrastructure, CI, or deployment | I's section for it |
| Repository practice | This file, then the standard's specific § |
| A dependency or platform | §0.7, then I §22 |

---

## 4. Work classes

Classify before you edit and report the class. The standard's numeric classes are §18; these four
groups are the same taxonomy, collapsed for triage. (§15.8, §18)

| Class | Scope | Standard classes | What you must do |
|---|---|---|---|
| **A — Read and report** | Investigation, review, answering a question, locating a contradiction | — | Read the governing section. Report findings with `R §`/`I §` citations. **Change nothing** unless asked. |
| **B — Scoped implementation** | Behaviour-preserving code within one service: a fix, a test, a handler, a migration body | 1, 2 | Cite the governing section. Add or update tests. Run the relevant gate. No new files outside §2.1, no new dependencies. |
| **C — Boundary change** | Schema, API or event contract, repository structure, Makefile or tooling location, CI job | 4, 5, 6 | Treat as breaking until §18.1 says otherwise. Additive-first: add, migrate consumers, remove later. An ADR is required for anything breaking. Update `contracts/` in the same PR. |
| **D — Architecture, dependency, or practice** | Any change to R, I, or a rule in the standard; any new dependency, service, or platform; any I §22 rejection | 7, 8, 9, 10 | **Stop and propose an ADR.** Do not implement. Class 9 lands the ADR and both document updates in one PR. Adding anything I §22 rejects needs an ADR that addresses the specific trigger its rejection named. |

**Class D is not yours to execute.** You write the ADR proposal and stop. (§15.8)

### No broad autonomous refactors

**PROHIBITED** without an explicit, specific instruction from the user:

- Renaming or reformatting files, modules, tables, or symbols you were not asked to touch.
- "While I was here" cleanups, dead-code deletion, or comment rewrites in unrelated files.
- Splitting or merging files, packages, or services.
- Dependency upgrades, added or removed.
- Any repository-wide find-and-replace.
- Editing `ARCHITECTURE_REVIEW.md`, `INFRASTRUCTURE_ARCHITECTURE.md`, or
`REPOSITORY_ENGINEERING_STANDARD.md` to make a task easier. (§15.3)

Scope discipline is measured by the PR diff. If a line is not required by the task, it does not
belong in the diff. (§15.3)

---

## 5. Stop conditions

**Stop, do not guess, and report** when any of these is true.

| Condition | Why |
|---|---|
| **Code contradicts R or I** | You must stop and report it. Writing code that matches the code is the failure this repository cannot afford. (§15.1) |
| **Two documents conflict** | Apply §1.3 in order. If the answer is an ADR, stop and propose one; do not pick a side. (§15.4) |
| **A conflict is still open** | Check §1.4 and §21.2. Implement neither side. Report it. (§15.4) |
| **The documents are silent** | Silence is not permission to improvise. Propose an ADR (§14) or ask. (§15.2) |
| **You are about to make an architecture change** | That is class D / §18 class 9. Stop and write an ADR proposal. (§15.8) |
| **You cannot complete the requirement** | Say so. Do not narrow the requirement to something you can finish. (§15.5) |
| **A gate fails** | Fix the cause or report the failure. Never the gate. (§15.7) |
| **A test fails and you believe the test is wrong** | Report it with your reasoning. The test changes only through review. (§15.9) |

When you stop, state: what you found, the `R §`/`I §`/`§` citations, what you did **not** do, and
what decision you need.

---

## 6. Prohibited behavior

These are `PROHIBITED` rules, not preferences. The standard's text governs; this is the summary.

**On verification and honesty (§15.5, §15.6)**

- Reporting a test as passing when it was not run.
- Describing a command as run when it was not.
- Reporting a count as verified when it was estimated.
- Reporting a failing verification as a summary instead of a failure with output.
- Merging "the documents say X" with "the code currently does Y".
- Leaving a placeholder, a stub, a commented-out block, or a `TODO` in merged code.

**On gates and approvals (§15.7)**

- Marking your own CI check as passed.
- Disabling a failing job, weakening a test, or raising a threshold to get a green build.
- Editing `.github/workflows/` to remove a check the task made inconvenient.
- Deleting, skipping, or weakening a test; lowering a coverage target; adding a conditional bypass.

**On architecture and dependencies (§0.7, §14.3, §1.2)**

- Overriding R or I — this file, an AGENTS instruction, and an ADR all rank below them.
- Installing a dependency without an ADR.
- Introducing anything I §22 rejects: Kubernetes, Kafka, NATS, RabbitMQ, a service mesh, gRPC, an
API gateway, ELK, Loki, the full OpenTelemetry stack, Redis Cluster, VPC endpoints/PrivateLink, a
NAT gateway, read replicas, Aurora, Lambda, Step Functions, Terraform Cloud. Each needs an ADR
addressing the specific trigger its rejection named. "We might need it eventually" is not a trigger.
- Adding an ORM, a query builder, or generated clients. R §9.3 rejects code generation; §4.2 fixes
the permitted Go dependency set to pgx, go-redis, and jwt-go.
- A synchronous call between services, or a cross-service foreign key.

**On secrets and data (§10.1)**

- Committing a secret, token, or credential.
- Copying production data into any test or development environment.

---

## 7. Local commands

The `Makefile` is the interface (§2.6, I §18.1). Phase 0 created it. Run `make help` for every
target with a description, and verify a target exists before telling anyone to run it.

| Task | Target | Notes |
|---|---|---|
| List commands | `make help` | Every defined target, with descriptions |
| One-time local setup | `make setup` | `.env` and `docker-compose.override.yml` from their examples |
| Local stack | `make dev` | `docker compose up --build` |
| Apply migrations | `make migrate` | Needs the stack running |
| Create an admin | `make superuser` | Interactive |
| Status / logs / shell | `make ps`, `make logs [S=…]`, `make shell [S=…]` | `S` defaults to `backend` |
| Lint (backend) | `make lint` | flake8 — the exact command CI runs |
| Lint (frontend) | `make lint-frontend` | eslint; CI does not run it, and it fails today |
| Format | `make fmt` | black, gofmt, `terraform fmt` |
| Format check | `make fmt-check` | A `make check` prerequisite |
| Build (frontend) | `make build-frontend` | `npm run build` — the exact command CI runs |
| Backend tests | `make test` | Needs the stack running |
| Everything | `make check` | fmt-check + lint + lint-frontend + build-frontend + test |
| Terraform | `make lint-terraform`, `make validate-terraform` | §2.6; both report 0 files until §20 Phase 7 |

**Not available yet** (I §18.7, until their phase lands): `bootstrap`, `build`, `build-*`,
`deploy`, `contract-test`, `e2e`, `e2e-headed`, `smoke`, `chaos`, `reset-data`, `test-race`,
`seed`, `reset-admin`, `rotate-keys`, `backup-db`, `restore-db`, `metrics`, `dashboards`,
`scan-terraform`. `make test-go` needs a `go.mod`, which does not exist.

**Known red today, all pre-existing:** `make fmt-check` (2 Python files are not black-formatted),
`make lint-frontend` (13 eslint errors), `make test` (needs `make dev`). `./lint.sh` still exists
and runs flake8 + pytest + the frontend build; `make check` is its replacement, and retiring
`lint.sh` is a separate change.

**PROHIBITED:** documenting a manual sequence that is not expressed as a Make target. Any operation
performed more than once must become one. (§2.6)

The merge gate is fixed by I §12.1 and mirrored by §19. Report only the gates you actually ran.

---

## 8. Completion report

Every task ends with a report in this shape. It is the PR description. (§15.5, §16.1, §18)

```markdown
## What I changed
One line per change, each naming the governing section it implements.

## Governing sections cited
`R §…`, `I §…`, `§…` — and any `docs/adr/NNNN-*.md` relied on.

## Change class
A / B / C / D (§4 here; §18 in the standard). One line of justification.

## Verification actually run
Exact commands, with pass/fail. Nothing that was not run. If a gate could not be run, say so and say
why.

## What I did not do, and why
Anything skipped, deferred, narrowed, or left open. Every open question I hit, with its §21.2 ID.

## Conflicts or ADR proposals
Any document contradiction found, and any ADR this task requires before implementation.
```

**MANDATORY:** state what you did not do. (§15.5) The value of this repository's documentation is
that its gaps are recorded rather than papered over; a report that hides a gap destroys that.

---

## 9. Change classification reference (§18)

Full table in §18. Summary of what each class requires:

| §18 class | Change | Requires |
|---|---|---|
| 1 | Typo / formatting | Nothing beyond CI |
| 2 | Implementation, same behaviour, one service | Tests pass (§16.1) |
| 3 | Behaviour change | Tests added; contract impact assessed |
| 4 | Schema change | §16.4 + ADR if breaking |
| 5 | API or contract change | §16.2/§16.3 + ADR if breaking |
| 6 | Repository structure change | ADR |
| 7 | Dependency, service, or platform addition | ADR |
| 8 | Practice change (a rule in the standard changes) | ADR |
| 9 | Architecture change (R or I changes) | ADR **and** both documents updated in the same PR |
| 10 | Emergency change | ADR afterwards within 24h; retrospective mandatory |

---

## 10. Related documents

| Document | Relationship |
|---|---|
| `ARCHITECTURE_REVIEW.md` | **Rank 1.** Domain and application architecture |
| `INFRASTRUCTURE_ARCHITECTURE.md` | **Rank 1.** Platform and infrastructure architecture |
| `REPOSITORY_ENGINEERING_STANDARD.md` | **Rank 2.** Repository practice, and §15 in full |
| `ARCHITECTURE_ANALYSIS.md` | Prior analysis. Supporting; not authoritative for anything here |
| `docs/adr/` | **Rank 3.** One decision per file. `README.md` is the index |
| `README.md` | **Rank 5.** How to run what exists today |