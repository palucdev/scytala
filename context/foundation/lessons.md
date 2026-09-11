# Lessons Learned

Living repository of patterns, architectural decisions, and failure modes discovered during Scytala development.

---

## 1. Database Migrations: Forward-Only vs. Destructive Down Migrations

- **Context**: During production readiness review for `S-02`, down-migration SQL scripts (`down.sql`) with `DROP TABLE ... CASCADE` were temporarily added to mirror traditional ORM rollback conventions.
- **Problem**: Running `DROP TABLE ... CASCADE` in production causes irrecoverable data loss (deleting user dashboards, credentials, notes). Furthermore, the Supabase CLI is strictly forward-only and tracks migrations linearly in `supabase_migrations.schema_migrations`. Supabase has no native down migration runner.
- **Rule**:
  1. **Strictly Forward-Only**: All database changes in `supabase/migrations/` must be forward migrations (`<timestamp>_<name>.sql`). Never create or maintain `down.sql` scripts containing destructive `DROP` commands.
  2. **Fix-Forward**: If a migration causes an issue, write a subsequent forward migration using additive/non-destructive changes (the Expand/Contract pattern).
  3. **Disaster Recovery**: Rollbacks for data corruption or catastrophic failure must rely on Supabase Point-in-Time Recovery (PITR) or automated database snapshots, not manual destructive SQL scripts.

---

## Run Full Test Suite Only at Implementation End

- **Context**: Implementation phases during testing and verification
- **Problem**: Running the full test suite repeatedly during intermediate steps causes long execution delays, potential timeouts, and blocks iteration
- **Rule**: Always run targeted tests during intermediate phases and reserve the full test suite for the end of the implementation step as it is an expensive operation.
- **Applies to**: all
