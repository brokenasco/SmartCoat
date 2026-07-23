# Launch readiness — 2026-07-22

## Complete in this stage

Application/test foundation; responsive public/auth/dashboard surfaces; Supabase SSR auth plumbing; core tenant/RBAC schema and RLS; explicit API grants; audit table; customer/property/estimate/project/employee/invoice/payment foundations; measured-room and financial domain services; authenticated estimate calculation/save; realistic seed; CI; architecture/security/operations documentation.

## Partial

Onboarding currently relies on setup/seed rather than a complete guided company-creation transaction. Estimating supports one-room drafts and calculation snapshots but not catalogs, multi-room editing, versions, approval, proposal PDF, sending, or project conversion. Audit storage exists but event triggers/services are incomplete. The schema provides downstream foundations but production/finance UI workflows are not built.

## Requires external credentials/resources

Supabase hosted projects/SMTP/storage, Stripe account and webhook secrets, Resend/domain verification, Vercel project, monitoring provider, QuickBooks developer app, Google Cloud OAuth app, legal policy text, and production backup plan selection.

## Requires legal review

Terms, privacy notice, cookies/consent, data retention/deletion, electronic signatures, warranty/cancellation language, tax behavior, payroll handling, DPAs/subprocessors, and incident-notification obligations.

## Launch blockers (priority order)

1. Complete onboarding, invitation lifecycle, authorization matrix, audit event capture, tenant/security integration tests, and hosted Supabase verification.
2. Complete estimate versions/approval/proposal/acceptance/project-conversion workflows and document generation.
3. Complete project field workflow, assignment/time/material/inspection/change-order flows, including secure media storage and mobile testing.
4. Complete invoices/payment allocation and Stripe subscription/customer-payment flows with signed idempotent webhooks.
5. Add production monitoring/logging/rate limiting, CSP nonces, dependency remediation, accessibility/E2E/load/security tests, backups and restore drill.
6. Complete legal/customer-facing policies, support process, admin tools, exports/deletion, billing lifecycle, and operational runbooks.

## Post-launch roadmap

CRM pipeline and follow-ups; paint/material vendor catalogs; calendar/accounting adapters; customer portal; offline-tolerant PWA field mode; estimated-vs-actual analytics; rules-based recommendations/anomaly detection; explainable tenant-isolated AI services; native mobile apps.

**Verdict:** suitable for local development and foundation review; not yet beta- or production-launch ready.

## Current dependency advisory

`npm audit --omit=dev` reports one moderate PostCSS advisory and two high libvips/Sharp advisories through Next.js 16.2.11. npm's automated forced remediation incorrectly proposes a breaking downgrade to Next 9.3.3, so it was not applied. Track patched Next.js/Sharp releases, retest, and block production promotion until the high-severity image-processing exposure is resolved or demonstrably mitigated.
