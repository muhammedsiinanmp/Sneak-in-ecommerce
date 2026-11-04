# ADR-0003: `database/sql` + pgx with `QueryExecModeExec`

- Status: Accepted
- Date: 2026-10-06
- Deciders: Architecture owners
- Approved: Repository owner, 2026-10-06
- Supersedes: none
- Superseded by: none
- Governing sections: R §9.2, R §9.5, R §3.4, R §4.1, I §7.5, I §11.3, I §16.3, I §18, I §21.1
- Refs: `REPOSITORY_ENGINEERING_STANDARD.md` §1.4 C-11, §21.1 Q3

## Context

### The two statements

| Source | Statement |
|---|---|
| R §9.2 (dependency table) | `github.com/jackc/pgx/v5` — "`database/sql` defines the interface but **ships no `postgres` driver**. `pgx` also provides a connection pool" |
| R §9.5 (patterns, SQL row) | "SQL \| `database/sql` + `pgx`, **named/positional params, no string concatenation**" |
| R §9.5 (patterns, Transactions row) | "Transactions \| Explicit `BeginTx`/`Commit`/`Rollback`, `defer` the rollback" |
| R §9.5 (patterns, Concurrency row) | "`database/sql` pools connections. **Do not hand-roll a pool**" |
| I §7.5 (operational consequence table, Go row) | "Go + `pgx` \| Prepared statements break unless handled \| Set `max_prepared_statements` (supported in modern PgBouncer), or use `QueryExecModeSimpleProtocol`. **Must be decided before Commerce is written**, not discovered in production" |

### Finding 1 — the pooling abstraction is not in conflict

I §7.5 requires "Go + `pgx`". `database/sql` with `github.com/jackc/pgx/v5/stdlib` **is** Go + pgx —
it is the same module, registering a `database/sql` driver. Every infrastructure requirement I places
on the client is satisfiable through `database/sql`:

| I's requirement | Satisfied via `database/sql` |
|---|---|
| Transaction-mode PgBouncer compatibility | DSN parameter; no API dependency |
| `/readyz` must check Postgres (I §6.9, I §11.4) | `sql.DB.PingContext` |
| `db_pool_in_use`, `db_pool_wait_seconds` (I §11.3) | `sql.DB.Stats()` → `InUse`, `WaitCount`, `WaitDuration` |
| Migrations bypass the pooler as a separate role (I §16.3) | A second `*sql.DB` on a different DSN |
| `ignore_startup_parameters = extra_float_digits` (I §7.5) | Server-side; client needs nothing |

R §9.5's mandate therefore stands unchallenged. **There is no authority conflict on this axis.**

### Finding 2 — R §9.2's stated rationale does not support its own choice

This is a documentation defect and must be recorded, because it is the reason someone will eventually
try to "fix" this.

R §9.2 justifies `database/sql` with the clause "`pgx` **also provides a connection pool**". That is an
argument *for* pgx's own pool, not for `database/sql`. pgx's own README states the criteria for
preferring the native interface:

> The pgx interface is faster. Many PostgreSQL specific features such as LISTEN / NOTIFY and COPY are
> not available through the database/sql interface. The pgx interface is recommended when:
> - The application only targets PostgreSQL.
> - No other libraries that require database/sql are in use.

Both criteria hold here. The system targets only PostgreSQL, and R §9.2 fixes the dependency set at
exactly three modules — no ORM, no query builder, nothing that imports `database/sql`.

So the native interface is what the upstream documentation recommends for this project, and R's
rationale does not establish why it was not chosen. This ADR does **not** overrule R. R §9.5's choice
is satisfiable together with I §7.5, so the minimal correct action is to keep it and record the
rationale gap for a future, separate decision that would have to be taken against R rather than
alongside it.

The cost of keeping `database/sql` is concrete and worth stating: `pgx.Conn`'s `AfterConnect` hook and
`CopyFrom` are unavailable through the interface. Neither is required by R or I — R does not ask for
per-connection setup, and no SQL `COPY` or `pgx.Batch` usage appears anywhere in R or I. The escape
hatch exists (`stdlib.SQLConn()` via `sql.Conn.Raw()`), so the choice is reversible without a
dependency change.

### Finding 3 — I §7.5's recommended mitigation is not the one pgx recommends

pgx v5's documentation, section "PgBouncer":

> By default pgx automatically uses protocol-level named prepared statements. PgBouncer 1.21.0 and
> newer can use these prepared statements in transaction and statement pooling modes when its
> `max_prepared_statements` setting is greater than zero. In this configuration the default
> `QueryExecModeCacheStatement` mode may be used.
>
> When using an older PgBouncer version or when prepared statement support is disabled, set
> `ConnConfig.DefaultQueryExecMode` to `QueryExecModeExec`. `QueryExecModeCacheDescribe` and
> `QueryExecModeSimpleProtocol` are also compatible with PgBouncer. **Prefer `QueryExecModeExec` over
> `QueryExecModeSimpleProtocol` whenever possible.** Do not use `QueryExecModeDescribeExec` with
> transaction pooling because PgBouncer may assign a different server connection between the describe
> and execute steps.
>
> SQL-level prepared statements created with PREPARE are not supported by PgBouncer in transaction
> pooling mode.

I §7.5 offers `SimpleProtocol`. pgx explicitly prefers `Exec` over it. Three further consequences of
that quotation are absent from I §7.5 entirely and become binding here:

1. **`QueryExecModeDescribeExec` is unsafe under transaction pooling** — it looks safe because it
   uses no named statement, but PgBouncer may switch backends between the describe and the execute.
   Nothing in I warns against this. It is the most likely way to reintroduce the exact failure I §7.5
   exists to prevent.
2. **SQL-level `PREPARE`/`EXECUTE`/`DEALLOCATE` are unsupported** in transaction pooling. PgBouncer's
   `max_prepared_statements` documentation confirms it: it "does not work for SQL-level prepared
   statement commands, so PREPARE, EXECUTE and DEALLOCATE are forwarded straight to Postgres."
3. **PgBouncer's `server_reset_query` is not used in transaction mode**, because "clients must not use
   any session-based features, since each transaction ends up in a different connection". Session
   state cannot be relied on.

### Finding 4 — I does not pin a PgBouncer version, which makes the primary option unverifiable

`max_prepared_statements` requires PgBouncer **1.21.0 or newer**, and I nowhere states a PgBouncer
version or image. I §21.1 additionally leaves the deployment form open: "Container or RDS Proxy —
**decide before Commerce is written**". RDS Proxy is not PgBouncer and exposes no equivalent setting,
and I §22's rejection of RDS Proxy-adjacent complexity means the choice cannot be assumed.

So the option I §7.5 lists first cannot be relied upon from I as written. Choosing a mitigation that
depends on it would encode an unverifiable dependency.

### Finding 5 — expand/contract makes named prepared statements actively hazardous here

This system's migrations are expand/contract by mandate: I §16.4, "Every schema change is split across
at least two releases", and I §16.2 orders migrations ahead of the code that depends on them. PgBouncer's
`max_prepared_statements` documentation names the consequence:

> The reuse of prepared statements has one downside. If the return or argument types of a prepared
> statement changes across executions then PostgreSQL currently throws an error such as: `ERROR:
> cached plan must not change result type`

That is precisely what adding a column or changing a column type does to a cached plan. The PgBouncer
documentation's own remedy is to `RECONNECT` on the PgBouncer admin console after the migration — an
operational step, per database, on every expand migration, that I nowhere specifies. Choosing
`QueryExecModeExec` removes the hazard by construction: there is no cached plan to invalidate,
because the statement is unnamed and re-planned on each execution.

### Why the cost of `QueryExecModeExec` is negligible here

`QueryExecModeExec` uses the extended protocol with an unnamed statement. Parameters are still sent as
bound parameters, so R §9.5's "named/positional params, no string concatenation" is preserved exactly.
What is lost is per-connection statement caching. I §2.1 puts peak load at ~0.25 events/s across 27
endpoints. Per-connection plan caching is not a measurable factor at that scale, and R's stated
reasons for choosing pgx (PostgreSQL features, JSON-everywhere debuggability, human-reviewable SQL) are
all unaffected.

`QueryExecModeSimpleProtocol` is strictly worse for this system: it sends parameter values as
interpolated SQL text rather than bound parameters, which is the shape R §9.5's rule exists to keep
out of the codebase, and pgx recommends against it anyway.

## Decision

1. **Keep R §9.5's abstraction.** `database/sql` with `github.com/jackc/pgx/v5/stdlib`. R §9.2,
   §9.5 stand. Transactions remain explicit `BeginTx`/`Commit`/`Rollback` with a deferred `Rollback`,
   so the checkout transaction boundary stays visible in the source as R §9.5 requires.
2. **Set `default_query_exec_mode=exec` in every application DSN**, so no protocol-level named
   prepared statement can outlive a transaction. This is the single mitigation; it does not depend on a
   PgBouncer version, a deployment form, or an infrastructure feature.
3. **`PROHIBITED`** in application code: `QueryExecModeDescribeExec`; SQL-level `PREPARE`/`EXECUTE`;
   `PREPARE` prepared statements via `db.Prepare`; reliance on PgBouncer's `max_prepared_statements`;
   any assumption of session state surviving a transaction.
4. **Default `max_prepared_statements` explicitly.** PgBouncer's own default is `200`, not `0`. It is
   set to `0` in Terraform until a PgBouncer version is pinned, so no application may come to depend
   on the feature silently.
5. **Separate DSNs.** `sneakin_<service>` connects to PgBouncer on 6432; `sneakin_migrate` connects
   directly to PostgreSQL on 5432. Per I §16.3.
6. **A separate ADR is required** before switching to pgx's native `pgxpool`, because that would
   require changing R §9.5 rather than implementing it.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| `QueryExecModeSimpleProtocol` (I §7.5's suggestion) | pgx explicitly prefers `QueryExecModeExec` over it. It sends parameter values as interpolated SQL text rather than bound parameters, which is the shape R §9.5's "no string concatenation" rule exists to exclude. |
| Rely on `max_prepared_statements` (I §7.5's first suggestion) | Requires PgBouncer ≥ 1.21.0, a version I never pins, on a deployment form I §21.1 still leaves open (container vs RDS Proxy, where the setting does not exist). It also introduces the `cached plan must not change result type` failure mode directly into an expand/contract migration pipeline. |
| `QueryExecModeCacheDescribe` | Compatible with PgBouncer and safe, but strictly more machinery than needed. Worth revisiting only if measurement ever shows plan-parsing cost matters, which at ~0.25 events/s it does not. |
| pgx native `pgxpool` instead of `database/sql` | What pgx's own README recommends for this situation, and R §9.2's rationale does not exclude it. Rejected **for now** only because R §9.5 explicitly mandates `database/sql`, and overriding R is a separate decision requiring its own ADR against R §9.5. Recorded so it is not lost. |
| Session-mode PgBouncer for the application path | Defeats the stated purpose in I §7.5: session mode holds the server connection for the session, so server-side connections scale with replicas again and the 224-connection worst case returns. |
| Raise PostgreSQL `max_connections` and skip the pooler | I §7.5 names this as "the naive fix and the wrong one": server memory then forces sharing, degrading everyone under load. |

## Consequences

**Easier.** The application is correct on any PgBouncer version, in any pooler deployment form, with
identical behaviour in local Compose, CI, and production — which is the local/production parity gap I
§7.5 identifies as the reason this decision had to be made before Commerce was written. No
`RECONNECT` step is needed after any migration. One DSN parameter replaces two infrastructure-dependent
branches.

**Harder.** Every application DSN gains a parameter, so a DSN assembled from fragments can silently omit
it and reintroduce the bug in one environment. This is the ADR's main operational cost and the reason
`Verification` requires it to be asserted rather than reviewed.

**Must now be true.** The DSN is built in one place per service; `db.Prepare` is unused; no session
state is set outside a transaction; and no application behaviour may depend on
`max_prepared_statements` until a PgBouncer version is pinned.

## Verification

- **CI, job 11 (`test-django`) and job 9 (`test-go`) plus one new assertion** — integration tests
  connect through a **real PgBouncer** with `pool_mode=transaction`, never directly to PostgreSQL.
  This is I §18's local/production parity requirement made executable.
- **CI, new assertion in the Go gate** — `default_query_exec_mode=exec` is present in every DSN
  assembled by `services/` and `infra/`, and `QueryExecModeDescribeExec` appears nowhere in the
  repository.
- **Integration test, required before Commerce merges** — open `N` pooled connections, issue a query on
  each, and assert no `prepared statement "stmtcache/…" already exists` and no `cached plan must not
  change result type` is raised. This is the test that fails if the DSN parameter is ever dropped.
- **Migration test, required** — run an expand migration (add a column) while pooled connections are
  live and assert subsequent queries succeed without a PgBouncer `RECONNECT`. Directly exercises the
  failure mode in Finding 5.
- **CI `terraform plan` assertion** — `max_prepared_statements = 0` is asserted in
  `modules/database-proxy` until a version floor is pinned, so no environment enables it by default.
- **Review** — `ARCHITECTURE_REVIEW.md` §9.2's rationale clause is corrected by a separate ADR against
  R; this ADR does not edit R.