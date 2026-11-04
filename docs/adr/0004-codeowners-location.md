# ADR-0004: `CODEOWNERS` lives at `.github/CODEOWNERS`

- Status: Accepted
- Date: 2026-10-06
- Deciders: Repository owner
- Approved: Repository owner, 2026-10-06 — owner selected the `.github/` location when the
  contradiction was raised during Phase 0
- Supersedes: none
- Superseded by: none
- Governing sections: §2.1, §2.2, §12.4
- Refs: `REPOSITORY_ENGINEERING_STANDARD.md` §1.3 step 4, §20 Phase 0

## Context

`REPOSITORY_ENGINEERING_STANDARD.md` states the location of `CODEOWNERS` three times, and the
three statements do not agree.

| Source | Statement |
|---|---|
| §12.4, first MANDATORY rule | "`CODEOWNERS` exists at the **repository root**" |
| §2.1 layout tree | `.github/CODEOWNERS` |
| §2.2 directory table, `.github/` row | "Workflows, CODEOWNERS, PR/issue templates" |

§1.3 step 4 classifies this: "A document contradicts itself → a defect in that document. Raise an
ADR recording the resolution, then correct both statements in the same PR." This ADR is that
record, and §12.4 is corrected alongside it.

Facts bearing on the choice:

- **GitHub accepts three locations** — the repository root, `.github/`, and `docs/` — and honours
  exactly one. Where more than one exists, the root copy wins silently and the others are ignored.
- **§2.1 and §2.2 agree with each other.** Two statements name `.github/`; one names the root.
- **§2.1 is the section §12.4 presupposes.** §12.4's rule continues "and covers, at minimum,
  `services/`, `contracts/`, `infra/`, `deploy/`, `.github/workflows/`, and `docs/adr/`" — those
  are §2.1 layout paths, so §12.4 is reading the §2.1 tree while naming a different location for
  the file that does the covering.
- **§20 Phase 0** requires `CODEOWNERS` as a deliverable, so the file must exist before this
  contradiction can be resolved by inaction.
- **The roster is a separate question.** §12.4 closes with "the roster is a human decision, not a
  technical one. It is listed in §21", and §21.2 Q4 is open. This ADR decides where the file lives,
  not who is listed in it.

## Decision

`CODEOWNERS` lives at `.github/CODEOWNERS`. §12.4's phrase "at the repository root" is corrected in
the same change to name that path, so §12.4, §2.1, and §2.2 state the same location.

## Alternatives considered

1. **Repository root, taking §12.4's literal wording.** Rejected: it would require correcting both
   §2.1 and §2.2 to match a single statement, against the section that defines the layout §12.4
   itself refers to. §12.4 is specific about `CODEOWNERS`, but it is not the only statement in the
   document, and a two-to-one agreement inside the same document is the stronger signal about which
   wording is the defect.
2. **A copy at both the root and `.github/`.** Rejected: GitHub honours only the root copy and
   ignores the other without warning, so the `.github/` file would read as authoritative while
   having no effect. A location rule that cannot be expressed as one file is not a location rule.
3. **Leave all three statements as they are and place the file at the root.** Rejected: §20 Phase 0
   would ship a `CODEOWNERS` that §2.1 and §2.2 both describe incorrectly, and PR4 forbids letting
   the document's own defect stand merely because one section agrees with the file. Doing nothing
   preserves the contradiction rather than resolving it.

## Consequences

- **Easier:** one location, matching the layout tree, and branch protection has a single path to
  point at. §20 Phase 0's `CODEOWNERS` requirement can be satisfied without inventing owners.
- **Harder:** nothing functionally — GitHub accepts `.github/CODEOWNERS` on the same terms as the
  root copy.
- **Must now be true:**
  - Branch protection must be configured against `.github/CODEOWNERS`, not a root copy (§12.4
    enforcement clause).
  - No root-level `CODEOWNERS` may be added later without superseding this ADR; a second file would
    silently take precedence.
  - §12.4, §2.1, and §2.2 may not be edited back to "repository root" without superseding this ADR
    (§14.4).
  - The roster in §21.2 Q4 remains open. Until it is resolved the file carries structure and no
    rules, so no path has a required reviewer and branch protection must not be enabled as though
    owners existed.

## Verification

- `test -f .github/CODEOWNERS` and `test ! -f CODEOWNERS` both hold at the repository root.
- `grep -n "repository root" REPOSITORY_ENGINEERING_STANDARD.md` returns no statement placing
  `CODEOWNERS` at the root; §12.4 names `.github/CODEOWNERS`.
- §12.4, §2.1, and §2.2 all name `.github/CODEOWNERS` — one location, three statements, no
  disagreement.
- `docs/adr/README.md` lists ADR-0004 as `Accepted` (§14.4 index rule).
- GitHub's documented locations for `CODEOWNERS` are the repository root, `.github/`, and `docs/`;
  the chosen path is one of them.
