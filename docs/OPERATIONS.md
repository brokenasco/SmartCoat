# Operations, backup, and incident response

## Environments and observability

Use isolated Supabase and Vercel projects for preview/staging/production. Production secrets belong only in managed secret stores. Add structured JSON logging with correlation IDs and redaction, Sentry (or equivalent), webhook/sync event logs, health checks, and alert ownership before beta.

## Backup and recovery

Enable managed daily backups and point-in-time recovery where the Supabase plan supports them. Define targets before launch (proposed: RPO ≤ 15 minutes, RTO ≤ 4 hours), retain migration artifacts, back up private storage separately, and rehearse quarterly restoration into an isolated project. Financial records should use corrections/reversals rather than destructive edits. Preserve provider event IDs so Stripe and integration events can be replayed safely.

Disaster checklist: declare incident owner; contain credentials/access; preserve audit evidence; identify affected companies; restore database/storage in isolation; verify tenant policies and balances; rotate secrets; promote recovered services; communicate accurately; record timeline/root cause; track corrective work.

## Incident response

Security incidents require immediate key/session revocation, scope analysis, audit-log preservation, affected-user/legal notification assessment, and a written post-incident review. Never include tokens, passwords, full payment details, or compensation data in logs or support tickets.
