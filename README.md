# SmartCoat

Production-oriented SaaS foundation for painting contractors: **Smarter Estimates. Better Profits.**

## Implemented

- Next.js 16 App Router, React 19, strict TypeScript, responsive Tailwind design
- Supabase email/password registration, verification callback, SSR sessions, protected routes
- Shared-schema multi-tenancy with company memberships, role-aware RLS, explicit Data API grants, and audit storage
- Customer, property, estimate, room, project, employee, invoice, payment, and audit foundations
- Transparent room, surface, paint, labor, overhead, margin, tax, deposit, and balance calculations
- Integer-cent persistence, decimal-safe math, calculation snapshots, authenticated estimate saves
- Fictional six-room seed, unit tests, RLS test scaffold, security headers, CI

This is a strong foundation and an estimating vertical slice—not a claim that the entire master product brief is launch-ready. See [Launch readiness](docs/LAUNCH_READINESS.md).

## Local setup

Requirements: Node.js 22+, npm, Supabase CLI/Docker for the local database.

1. Copy `.env.example` to `.env.local`; add a Supabase project URL and publishable key. Never expose the service-role key through a `NEXT_PUBLIC_` variable.
2. Discover current CLI commands with `supabase --help`, then start the local stack and reset/apply migrations using the installed CLI version.
3. Create a test Auth user before applying `supabase/seed.sql`; the seed attaches the first local user as demo owner.
4. Run `npm install`, then `npm run dev`.

Useful checks: `npm run check`, `npm run build`, `npm run test:coverage`.

## Environment variables

Required at runtime: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_APP_URL`. Server-only placeholders for later integrations are documented in `.env.example`. Use distinct credentials for local, preview, staging, and production.

## Supabase production setup

Create separate staging and production projects. Apply version-controlled migrations, verify explicit grants and all RLS policies, run Database/Security Advisors, configure allowed redirect URLs (`/auth/callback`), customize verified SMTP/email templates, set short appropriate JWT lifetimes, enable backups/PITR, and execute `supabase/tests/tenant_isolation.sql` with disposable tenant fixtures. Storage buckets are not yet implemented.

## Integrations

- **Stripe:** not implemented. Add an adapter, Checkout/Portal routes, verified idempotent webhook ingestion, subscription/entitlement tables, and failed-payment behavior before selling access.
- **Resend:** not implemented. Add a lazy server-only adapter, verified domain, invitation/proposal templates, delivery tracking, and retry queue.
- **QuickBooks:** boundary deferred. Use OAuth with encrypted tokens, company-scoped mapping tables, sync event logs, reconciliation, and disconnect/revocation flows.
- **Google Calendar:** boundary deferred. Use company-scoped OAuth grants, calendar/event mappings, incremental sync tokens, retries, and explicit conflict policy.

## Deployment

Deploy the Next.js app to Vercel with preview/staging/production environment separation. Run CI and migrations before promotion. Do not reuse development credentials. Roll back application deployments through Vercel; database rollbacks require a reviewed forward-fix migration unless a reversible migration was explicitly rehearsed.

## Documentation

- [Assessment and execution plan](docs/IMPLEMENTATION_PLAN.md)
- [Architecture and ADRs](docs/ARCHITECTURE.md)
- [Security and threat model](docs/SECURITY.md)
- [Operations and recovery](docs/OPERATIONS.md)
- [Launch readiness and roadmap](docs/LAUNCH_READINESS.md)
