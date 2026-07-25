# Paint catalog migration and operations runbook

## Query name

`202607250002_paint_catalog_foundation`

This migration creates the normalized paint catalog, source and import audit tables,
tenant paint settings, estimate paint snapshots, secure search RPC, global platform
administrator allowlist, RLS policies, indexes, and controlled seed records. It does
not load manufacturer colors, products, coverage, availability, or pricing. All 11
official-web discovery sources start disabled as `pending_permission`.

## Preview deployment

1. Back up the preview database or create a fresh preview branch.
2. Apply migrations in timestamp order with the Supabase CLI migration workflow.
3. Run `supabase/tests/paint_catalog_security.sql`.
4. Run database advisors and resolve security/performance findings.
5. Deploy the feature branch to a Vercel preview with the preview Supabase variables.
6. Verify login, `/dashboard/estimates/new`, two-character search validation,
   zero-result manual fallback, coverage override reason, and estimate snapshot save.
7. Grant a preview-only platform administrator row and verify
   `/dashboard/admin/paint-catalog`; remove it after testing if not required.

## Authorized source activation

Never change `is_enabled` first. Add the authorization/license reference, confirm
the approved format and retention terms, set the appropriate authorized source type,
run a dry validation, review rejected records, then enable it. The database refuses
enabled sources whose authorization is `pending_permission` or `unavailable`.

## Monitoring

Alert on failed imports, warning rates above 1%, a source missing two expected
updates, duplicate stable identifiers, sharp catalog-count changes, and price rows
without provenance. Track unmatched searches as demand signals; never convert them
into catalog rows automatically.

## Rollback

Application rollback is a normal Vercel deployment rollback. The new tables are
additive, so code rollback does not require destructive database rollback. Disable
all sources and stop import workers first. Preserve `estimate_paint_items` and import
audit history. A destructive schema removal requires an explicit reviewed migration,
a verified backup, and confirmation that no deployed code reads these tables.

