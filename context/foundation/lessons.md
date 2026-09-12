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

---

## Never write full filesystem paths in public markdown

- **Context**: All phases and all markdown files committed to the repository (`context/`, `docs/`, `README.md`, `AGENTS.md`, and any other public markdown).
- **Problem**: Full filesystem paths from the developer's machine (e.g. `/home/user/projects/scytala/`) are doxxed into version-controlled files, leaking private directory structure and usernames.
- **Rule**: Never write full filesystem paths in `context/`, `docs/`, `README.md`, or any other public markdown. Always use paths relative to the project root and document only project-related files.
- **Applies to**: all
