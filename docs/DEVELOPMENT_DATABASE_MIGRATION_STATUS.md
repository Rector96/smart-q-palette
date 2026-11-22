# Development database migration alignment

**Source of truth:** Supabase project `igntxwcitbjnafgrrcot` (smart-q-palette, eu-west-1).

The development project's recorded migration history was read on 2026-11-22. The active repository migration filenames were compared with those records.

## Changes made on the cleanup branch

- Ten February–April legacy migration files not present in the development project's migration history were moved unchanged to `supabase/migration-archive/legacy/`.
- Active migration filenames that matched an applied database migration by name were renamed to use the exact version recorded by the development database. SQL contents were not changed.
- The changes are repository-only. No SQL was applied, no database schema was altered, and the older Supabase project was not modified.

## Applied migrations whose SQL source is not currently in this repository

The development database records these versions, but no matching SQL file was found in the repository at the time of review:

| Version | Recorded migration |
|---|---|
| `20261119220543` | `add_exam_source_and_verification_metadata` |
| `20261119220601` | `preserve_pdf_and_independent_answer_keys` |
| `20261119221046` | `store_exam_type_and_year_on_sessions` |
| `20261119221308` | `preserve_exam_type_and_year_in_shared_sessions` |
| `20261120132307` | `referral_admin_controls_and_recovery_ledger` |

These migrations are already recorded as applied in the development database. Their SQL was not guessed or reconstructed. Recover their original SQL from a trusted backup/source-control history before declaring the migration set fully reproducible from scratch.

## Repository migrations not recorded as applied in the development database

The following active migration files remain pending or require a separate review before deployment:

- `add_spaced_question_reviews`
- `add_library_catalog_metadata`
- `add_library_cover_storage`

Do not run `supabase db push` or reset a database as part of this cleanup. First recover the five missing source migrations, review the pending migrations, and test a clean database build from the complete ordered migration set.

## Verification boundary

This alignment is based on the development project's migration-history records and repository filenames. It does not prove that every live table, policy, storage bucket, function, or application flow is correct. The older Supabase project was not modified or fully audited.
