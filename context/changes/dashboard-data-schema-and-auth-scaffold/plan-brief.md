# Dashboard Data Schema and Auth Scaffold — Plan Brief

> Full plan: `context/changes/dashboard-data-schema-and-auth-scaffold/plan.md`
> Roadmap: `context/foundation/roadmap.md` (F-01)
> PRD: `context/foundation/prd.md` (FR-001, FR-002, FR-004, FR-011)

## What & Why

Scytala requires a robust, self-contained data persistence and authentication foundation before user-facing dashboard creation and note management can be built. This change delivers the core PostgreSQL schema for dashboards, participant credentials, notes, and immutable note versions, paired with Edge-compatible Web Crypto password hashing (PBKDF2) and 24-hour signed JWT session cookies that run natively on Cloudflare Workers without external binary dependencies.

## Starting Point

The repository currently contains Next.js 16 with MUI 9, OpenNext Cloudflare deployment scripts, and a minimal Supabase adapter configured only for deployment audit logging (`public.info`). No tables, cryptographic helpers, or session verification utilities exist for domain entities.

## Desired End State

A complete, production-ready backend foundation where PostgreSQL tables (`dashboards`, `dashboard_users`, `notes`, `note_versions`) are created with strict Row Level Security, Edge-compatible Web Crypto utilities handle password hashing and 24h JWT sessions, and the `DatabaseClient` interface provides fully-tested domain methods with >80% test coverage.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| :--- | :--- | :--- | :--- |
| **Password Hashing** | Web Crypto PBKDF2 (SHA-256) + 16B salt | 100% native in Cloudflare Workers and Node.js with zero dependencies or Wasm overhead. | Plan |
| **Dashboard URLs** | Dual UUID PK + 16-char random slug | Clean, non-enumerable shareable links (`/dashboard/<hash>`) while retaining fast 128-bit UUID internal joins. | Plan |
| **Session Model** | Stateless HMAC-SHA256 JWT in HttpOnly cookie | Sub-millisecond edge verification on every request without hitting the database for auth lookups. | Plan |
| **Session TTL** | 24-hour fixed expiration | Ensures high baseline security for shared devices without stale open sessions. | Plan |
| **Note Versioning** | Relational `notes` + `note_versions` tables | Provides fast active-state queries while preserving an append-only immutable edit history with full metadata. | Plan |
| **RLS Policy** | Strict RLS (backend service-role only) | Prevents direct PostgREST enumeration of private notes/hashes if the anon Supabase key is inspected. | Plan |
| **Cascade Policy** | Schema-level `ON DELETE CASCADE` | Guarantees atomic cleanup of notes, versions, and credentials when a dashboard is deleted. | Plan |

## Scope

**In scope:**
- PostgreSQL migration for `dashboards`, `dashboard_users`, `notes`, `note_versions`, indexes, triggers, and RLS.
- Web Crypto PBKDF2 password hashing (`hashPassword`, `verifyPassword`) and URL slug generation (`generateDashboardSlug`, `generateRandomPassword`).
- Edge-compatible HMAC-SHA256 signed JWT session token creation, verification, and cookie header serialization (`createSessionToken`, `verifySessionToken`).
- Domain models and port methods added to `DatabaseClient` (`src/client/db-client.ts`).
- Concrete Supabase queries in `SupabaseDatabaseClient` (`src/lib/supabase.ts`).
- Comprehensive Vitest test suite enforcing >= 80% coverage on lines, functions, branches, statements.

**Out of scope:**
- UI components, pages (`/new`, `/dashboard/[hash]`), and interactive forms (handled in `S-01`, `S-02`, `S-03`).
- Supabase GoTrue / email sign-ups or OAuth identity providers.
- Real-time WebSockets / live subscriptions.
- Rich-text / Markdown formatting or media attachments.

## Architecture / Approach

```
┌─────────────────────────────────────────────────────────────┐
│ Next.js Server Actions & Route Handlers                     │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
               ▼                               ▼
┌─────────────────────────────┐ ┌─────────────────────────────┐
│ Edge Auth & Crypto Layer    │ │ DatabaseClient Port         │
│ - PBKDF2 Hash / Verify      │ │ - CRUD & Version Methods    │
│ - 24h JWT Session Cookies   │ │                             │
│ (src/lib/crypto.ts,         │ │ (src/client/db-client.ts)   │
│  src/lib/session.ts)        │ └──────────────┬──────────────┘
└─────────────────────────────┘                │
                                               ▼
                                ┌─────────────────────────────┐
                                │ Supabase Database Adapter   │
                                │ (src/lib/supabase.ts)       │
                                └──────────────┬──────────────┘
                                               │ Service Role
                                               ▼
                                ┌─────────────────────────────┐
                                │ Supabase PostgreSQL (RLS)   │
                                │ - dashboards                │
                                │ - dashboard_users           │
                                │ - notes                     │
                                │ - note_versions             │
                                └─────────────────────────────┘
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| :--- | :--- | :--- |
| **1. Database Migration & Schema Design** | SQL migration creating 4 core tables, RLS policies, cascade rules, and indexes. | Ensuring RLS denies public anon access while allowing service-role operations. |
| **2. Edge Cryptographic Utilities** | Pure Web Crypto PBKDF2 hashing/verification and random slug/credential generators. | Constant-time string comparison to prevent timing attacks. |
| **3. Edge Session Token & Cookie Utilities** | Stateless HMAC-SHA256 JWT creation, verification, and HttpOnly cookie helpers. | Proper expiration and tampering rejection in Edge isolates. |
| **4. Domain Types & DatabaseClient Port/Adapter** | Domain interfaces in `db-client.ts` and Supabase query implementations in `supabase.ts`. | Correct version incrementing and transactional consistency on note updates. |
| **5. Test Suite & Quality Verification** | Complete Vitest test coverage across all modules, achieving >= 80% thresholds. | Maintaining 80% branch and function coverage across error branches. |

**Prerequisites:** Existing Next.js 16 + Supabase setup.
**Estimated effort:** ~1-2 focused implementation sessions across 5 phases.

## Open Risks & Assumptions

- **Cloudflare Workerd Isolate Compatibility:** Relies on Web Crypto API (`globalThis.crypto.subtle`) and `nodejs_compat` in `wrangler.jsonc`. (Verified available).
- **Environment Variable Availability:** Assumes `SUPABASE_URL` and `SUPABASE_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) and optional `AUTH_SECRET` are configured in `.env`.

## Success Criteria (Summary)

- Database migration applies cleanly with complete cascade and RLS rules.
- Password hashing and session JWT verification execute with sub-millisecond latency on Edge runtimes.
- Domain methods provide complete CRUD and version history persistence for dashboards and notes.
- Vitest passes with >= 80% coverage across all metrics and ESLint reports 0 errors.
