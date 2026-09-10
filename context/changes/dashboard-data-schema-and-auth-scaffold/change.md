---
id: dashboard-data-schema-and-auth-scaffold
roadmap_id: F-01
status: impl_reviewed
created: 2026-08-18
updated: 2026-08-20
---

# Change: Wire per-dashboard Data Schema and Auth Scaffold

Foundational data persistence and cryptographic authentication scaffold for Scytala. Creates the PostgreSQL schema in Supabase for `dashboards`, `dashboard_users`, `notes`, and `note_versions` with strict RLS and cascading foreign keys, provides Edge/Cloudflare Workers-compatible Web Crypto utilities for PBKDF2 password hashing and 24h signed JWT sessions, and extends the `DatabaseClient` port/adapter with domain methods and strict test coverage.
