# Architecture

SmartCoat uses Next.js App Router with Server Components for tenant data reads and narrow Client Components for authentication and estimate interaction. Supabase Auth owns identity; PostgreSQL membership rows own authorization. The browser receives only the publishable key. A proxy refreshes sessions, but RLS and server checks enforce access.

Money is stored as integer cents. Percentages in persistent settings should use basis points; accepted estimates retain calculation JSON snapshots so changing defaults cannot rewrite history. `src/lib/domain` is vendor-neutral business logic and is independently tested. Tenant tables carry `company_id`, composite tenant-first indexes, foreign keys, checks, and RLS.

External systems must be introduced through adapters (`billing`, `email`, `accounting`, `calendar`, `storage`, `ai`) rather than referenced by domain calculations. Webhooks must verify signatures, persist provider event IDs, and be idempotent before production use.

## ADR-001: shared-schema tenancy

Use one PostgreSQL database and shared tables with mandatory `company_id`, RLS, and server authorization. This supports efficient operations at early scale while retaining a future tenant partitioning path. Cross-tenant tests are mandatory for every new tenant table.

## ADR-002: financial snapshots

Use integer minor units plus versioned input/output snapshots. Calculations use `decimal.js`; accepted commercial records are not recomputed from mutable company defaults.
