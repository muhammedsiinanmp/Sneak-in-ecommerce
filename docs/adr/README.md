# Architecture Decision Records

One decision per file. Each records a single decision within the scope its `Governing sections`
delegate to it, and may not change a domain model, an event contract, a datastore topology, or a
technology decision. (§1.2 PR3, §14)

## Index

| ADR | Decision | Status | Governing sections | Closes |
|---|---|---|---|---|
| [ADR-0001](0001-redis-stream-key.md) | One Redis stream key, `sneakin:<env>:events` | Accepted | I §4.6, I §8.1, I §8.2, I §3.3, R §2.5 | C-1 / Q1 |
| [ADR-0002](0002-data-tier-terraform-modules.md) | Three data-tier Terraform modules, not one `datastores` | Accepted | I §3.1, I §3.2, I §3.10, I §4.6, I §7.5, I §8.2, I §21.1 | C-7 / Q2 |
| [ADR-0003](0003-go-postgres-layer-and-prepared-statements.md) | `database/sql` + pgx with `QueryExecModeExec` | Accepted | R §9.2, R §9.5, R §3.4, R §4.1, I §7.5, I §11.3, I §16.3, I §18, I §21.1 | C-11 / Q3 |
| [ADR-0004](0004-codeowners-location.md) | `CODEOWNERS` lives at `.github/CODEOWNERS` | Accepted | §2.1, §2.2, §12.4 | §12.4 self-contradiction (§1.3 step 4) |

## Status meanings

| Status | Meaning |
|---|---|
| **Proposed** | Recorded and binding as the implementation decision, not yet formally accepted by an owner |
| **Accepted** | An owner recorded approval; the header cites where |
| **Superseded by ADR-MMMM** | Replaced by a later ADR |
| **Deprecated** | No longer in force, and nothing replaces it |

**MANDATORY:** only a repository owner changes `Status` to `Accepted`, and the ADR header must cite
the approval record. An agent may not self-accept an ADR. (§14.4, §15.7)

ADR-0001 through ADR-0004 are `Accepted`, owner-approved on 2026-10-06. ADR-0001, ADR-0002, and
ADR-0003 closed the three conflicts that were blocking Phase 0, and R and I are corrected to match
them. ADR-0004 resolved a contradiction inside the standard itself — §12.4 placed `CODEOWNERS` at
the repository root while §2.1 and §2.2 both place it at `.github/` — and §12.4 is corrected to
match. Reverting a corrected section to its pre-ADR wording requires superseding the ADR, not
editing the section. (§14.4)

## Writing a new ADR

1. Classify the change per §18. Anything architectural is class 9 — the ADR and both document
   updates land in one PR.
2. Use the template in §14.2. `Alternatives considered` and `Verification` are both mandatory.
3. Register the ADR in the table above and update §21 in the same PR. (§1.3 step 6)