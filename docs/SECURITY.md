# Security and threat model

Primary threats are credential attacks, broken object authorization, tenant leakage, role escalation, malicious uploads, webhook spoofing/replay, payment fraud, integration-token theft, support impersonation, destructive exports/deletion, and sensitive payroll exposure.

Controls implemented: SSR session validation, no service key in clients, strict input/check constraints, explicit grants, RLS on exposed tables, role-scoped policies, restricted private helper functions, tenant indexes, immutable calculation snapshots, security headers, and a cross-tenant SQL test scaffold. User-editable metadata is never used for authorization.

Before beta: enable MFA options and Auth rate limits, add CSP nonces (the current development-compatible CSP permits inline/eval scripts), configure private storage buckets with signed URLs and content validation, add webhook signature/idempotency tables, redact structured logs, run Supabase advisors, dependency audit, SAST, E2E authorization tests, backup restore drill, and independent penetration review. Legal privacy/terms/retention language requires attorney review.
