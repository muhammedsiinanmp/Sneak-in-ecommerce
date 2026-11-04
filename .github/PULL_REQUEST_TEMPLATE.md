<!--
REPOSITORY_ENGINEERING_STANDARD.md §12.2: a PR states what changed, why, how it was
verified, and which documents or ADRs it is constrained by. Fill in every section.
Leave "Nothing" where a section genuinely does not apply — do not delete it.
-->

## Change classification (§18)

<!-- One of 1–10. See §18 for the table; AGENTS.md §4 collapses them into A/B/C/D. -->

- Class: <!-- 1 typo / 2 implementation / 3 behaviour / 4 schema / 5 contract / 6 structure / 7 dependency / 8 practice / 9 architecture / 10 emergency -->
- Work class: <!-- A read-and-report / B scoped implementation / C boundary change / D architecture -->

## What changed and why

<!-- One line per change, each naming the governing section it implements. -->

-

## Governing sections cited

<!-- `R §…`, `I §…`, `§…` — and any `docs/adr/NNNN-*.md` relied on. A bare `§` pointing at
another document is rejected in review (§0.2). -->

- `R §`
- `I §`
- `§`

## Verification actually run

<!-- Exact commands with pass/fail. Nothing that was not run. If a gate could not be run, say
so and say why (§15.6). `make lint` and the relevant `make test` target are mandatory before
requesting review (§12.2). -->

| Command | Result |
|---|---|
| `make lint` | |
| `make test` | |

## Architecture decisions affected

<!-- Does this change a domain model, an event contract, a datastore topology, a technology
decision, or a rule in the standard? If yes and no ADR is attached, stop — that is class D. -->

- [ ] Nothing in R or I changes
- [ ] A rule in the standard changes
- [ ] A domain model / event contract / datastore / technology choice changes

## ADRs created or updated

- [ ] None
- [ ] `docs/adr/NNNN-*.md` — <!-- filename and status -->

## What was intentionally not changed

<!-- Mandatory (§15.5). Anything skipped, deferred, narrowed or left open, with its §21.2
open-question ID where one applies. -->

-

## Known risks

-

## Checklist

- [ ] This PR is one logical change (§12.2)
- [ ] The Makefile was used for every gate this PR reports (§2.6)
- [ ] Tests were added or updated for any behaviour change (§16.1)
- [ ] No secret, token or credential is committed (§10.1)
- [ ] No placeholder, stub, commented-out block or TODO is left in the diff (§15.5)
- [ ] No architecture decision was made silently: R and I were either followed, or an ADR
      proposes the change (PR1 / PR4 / §15.8)
- [ ] A draft PR is used while this is still in progress (§12.2)
