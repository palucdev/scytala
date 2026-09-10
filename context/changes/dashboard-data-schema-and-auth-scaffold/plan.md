# Dashboard Data Schema and Auth Scaffold Implementation Plan

## Overview

Scytala is an Edge-first collaborative dashboard application designed for private note sharing within small groups. This foundational change (`F-01`) establishes the core PostgreSQL data architecture and cryptographic security primitives required before any user-facing features can be built.

Specifically, this plan delivers:
1. The complete relational PostgreSQL database schema in Supabase (`dashboards`, `dashboard_users`, `notes`, `note_versions`) with strict Row Level Security (RLS), performance indexing, and cascading foreign keys.
2. An Edge/Cloudflare Workers-compatible cryptographic layer implementing native Web Crypto PBKDF2 (SHA-256) password hashing and secure random slug/credential generation with zero native C++ binary dependencies.
3. A stateless, Edge-compatible 24-hour signed JWT session and HttpOnly cookie management subsystem.
4. Domain model types and extended `DatabaseClient` Port/Adapter interfaces enabling clean, decoupled database interactions with >80% test coverage enforced.

## Current State Analysis

- **Frontend & Routing:** Next.js 16 App Router with MUI 9 theme provider configured in `src/providers/mui-theme-provider.tsx` and `src/app/layout.tsx`.
- **Database & Migration:** Supabase client initialized in `src/lib/supabase.ts` with only the `info` audit deployment table (`supabase/migrations/20260817000000_create_info_table.sql`). Domain tables for dashboards, participants, notes, and note version history are currently absent.
- **Port/Adapter Architecture:** `src/client/db-client.ts` defines a `DatabaseClient` umbrella port; `src/lib/supabase.ts` implements the `SupabaseDatabaseClient` adapter.
- **Deployment & Edge Runtime:** OpenNext Cloudflare deployment targeting V8 isolates (`@opennextjs/cloudflare`). Native Node.js C++ bindings (e.g. standard `bcrypt`) cannot run at runtime; all crypto must use Web Standards (`crypto.subtle`).
- **Quality Gates:** Vitest with `happy-dom` and v8 coverage enforces an 80% threshold across lines, functions, branches, and statements (`vitest.config.ts`).

## Desired End State

After this change lands:
1. Running `npm run db:reset` applies the new migration `20260819000000_create_dashboard_schema.sql` cleanly, producing 4 interconnected tables with strict RLS and cascade rules.
2. `src/lib/crypto.ts` exports PBKDF2 hashing/verification and NanoID-style 16-character dashboard slug generator functions that run seamlessly in Node.js and Cloudflare Workers isolates.
3. `src/lib/session.ts` exports HMAC-SHA256 JWT creation, verification, and cookie serialization utilities enforcing a 24-hour expiration window.
4. `src/client/db-client.ts` exports complete domain interfaces and methods for dashboard CRUD, user alias lookup, note creation with initial versioning, note updates with immutable history snapshots, and cascade deletions.
5. `src/lib/supabase.ts` implements these methods with full error handling and query mapping.
6. `npm test` runs with >= 80% coverage across all files, and `npm run lint` passes with 0 errors.

### Key Discoveries:

- `src/lib/supabase.ts:13-27` instantiates the Supabase client using environment variables `SUPABASE_URL` and `SUPABASE_KEY`. Server-side operations under strict RLS require using the backend `SUPABASE_SERVICE_ROLE_KEY` or configured server key to execute domain operations without public anon vulnerability.
- `vitest.config.ts:16-21` enforces strict 80% coverage thresholds on all 4 metrics (branches, lines, functions, statements).
- `wrangler.jsonc:108` includes `"compatibility_flags": ["nodejs_compat"]`, guaranteeing `crypto.subtle` is available in all execution contexts.

## What We're NOT Doing

- **No UI pages or routes:** Dashboard creation wizard (`/new`), login forms, note tiles UI, and history panels belong to downstream slices (`S-01`, `S-02`, `S-03`, `S-04`).
- **No rich-text / markdown / file attachments:** Plain-text content only per PRD Non-Goals.
- **No Supabase GoTrue Auth / Email sign-ups:** Authentication is purely per-dashboard username + password tokens.
- **No real-time WebSocket subscriptions:** Sync is on-demand and on-enter for MVP.

## Implementation Approach

1. **Schema & RLS Strategy:** Define relational tables with UUID PKs for internal joins and a dedicated unique 16-character `hash` column on `dashboards` for URL sharing. Enable RLS on all 4 tables with service role backend access to prevent direct anonymous PostgREST enumeration.
2. **Pure Web Crypto Primitives:** Leverage `globalThis.crypto.subtle` with PBKDF2 (SHA-256, 100,000 iterations, 16-byte random salt) serialized in standard format (`$pbkdf2$100000$<salt_hex>$<hash_hex>`), guaranteeing sub-millisecond execution and zero bundle bloat.
3. **Stateless 24h Signed Sessions:** Use HMAC-SHA256 with a configured `AUTH_SECRET` (falling back to a consistent hash of `SUPABASE_KEY` if omitted in dev) to sign JWTs containing `{ dashboard_id, user_id, user_alias, exp, iat }`, set in HttpOnly cookies.
4. **Port/Adapter Decoupling:** Keep domain types and interface definitions in `src/client/db-client.ts`, maintaining clean testability through dependency injection and mocks.

## Critical Implementation Details

- **Web Crypto Salt & Timing Safety:** PBKDF2 key derivation and constant-time string comparison (`crypto.subtle.timingSafeEqual` or equivalent bitwise comparison) must be used in `verifyPassword` to prevent timing attacks.
- **Strict Cascade Isolation:** `ON DELETE CASCADE` is attached to all foreign key references (`dashboard_users -> dashboards`, `notes -> dashboards`, `note_versions -> notes`). Deleting a dashboard atomically cleans up all associated users, notes, and versions in a single SQL operation.
- **Version Number Sequencing:** Creating a note inserts both into `notes` (setting `version = 1`) and creates the first immutable row in `note_versions` (`version = 1`). Note updates atomically update `notes` (`version = version + 1`, `content = new_content`, `updated_at = NOW()`) and insert a new snapshot into `note_versions`.

---

## Phase 1: Database Migration & Schema Design

### Overview

Create the Supabase SQL migration for `dashboards`, `dashboard_users`, `notes`, and `note_versions` with foreign key relations, cascade delete rules, performance indexes, and strict RLS policies.

### Changes Required:

#### 1. SQL Migration Script

**File**: `supabase/migrations/20260819000000_create_dashboard_schema.sql`

**Intent**: Create the complete relational schema with strict RLS, indexes, and automated `updated_at` triggers.

**Contract**:
- `public.dashboards`:
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `hash VARCHAR(16) UNIQUE NOT NULL`
  - `title TEXT NOT NULL`
  - `description TEXT`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())`
- `public.dashboard_users`:
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `dashboard_id UUID NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE`
  - `user_alias TEXT NOT NULL`
  - `password_hash TEXT NOT NULL`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())`
  - `CONSTRAINT uq_dashboard_user_alias UNIQUE (dashboard_id, user_alias)`
- `public.notes`:
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `dashboard_id UUID NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE`
  - `title TEXT NOT NULL DEFAULT ''`
  - `content TEXT NOT NULL DEFAULT ''`
  - `version INT NOT NULL DEFAULT 1`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())`
- `public.note_versions`:
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE`
  - `version INT NOT NULL`
  - `title TEXT NOT NULL DEFAULT ''`
  - `content TEXT NOT NULL DEFAULT ''`
  - `author_id UUID REFERENCES public.dashboard_users(id) ON DELETE SET NULL`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())`
  - `CONSTRAINT uq_note_version UNIQUE (note_id, version)`
- `RLS Policies`: Enable RLS on all 4 tables. Grant full permissions to `service_role`; deny all direct `anon` and `authenticated` PostgREST access.
- `Indexes`:
  - `idx_dashboards_hash` ON `dashboards(hash)`
  - `idx_dashboard_users_lookup` ON `dashboard_users(dashboard_id, user_alias)`
  - `idx_notes_dashboard` ON `notes(dashboard_id)`
  - `idx_note_versions_note_history` ON `note_versions(note_id, version DESC)`

### Success Criteria:

#### Automated Verification:

- Migration file `supabase/migrations/20260819000000_create_dashboard_schema.sql` is syntactically valid and matches project conventions
- PostgreSQL migration applies cleanly with `npm run db:reset` (when local Supabase is running) or passes SQL syntax linter

#### Manual Verification:

- Review SQL migration to ensure RLS rules and cascading constraints are strictly enforced

---

## Phase 2: Edge Cryptographic Utilities (Password Hashing & Random Slugs)

### Overview

Implement Web Crypto API (`crypto.subtle`) primitives for password hashing with PBKDF2 (SHA-256, 100k iterations, 16-byte random salt), constant-time password verification, secure 16-character URL slug generation, and strong password generation.

### Changes Required:

#### 1. Crypto Module

**File**: `src/lib/crypto.ts`

**Intent**: Provide lightweight, zero-dependency cryptographic utilities that run identically across Node.js and Cloudflare Workers V8 isolates.

**Contract**:
- `hashPassword(password: string): Promise<string>`: Generates a 16-byte random salt, derives a 256-bit key using PBKDF2 (SHA-256, 100,000 iterations), and returns `$pbkdf2$100000$<salt_hex>$<hash_hex>`.
- `verifyPassword(password: string, storedHash: string): Promise<boolean>`: Parses iterations, salt, and hash; derives key with the same parameters; compares with constant-time equality check.
- `generateDashboardSlug(length?: number): string`: Generates a URL-safe random string (default 16 chars from `[A-Za-z0-9_-]`) using `crypto.getRandomValues`.
- `generateRandomPassword(length?: number): string`: Generates a strong random password (default 16 chars with mixed case, digits, and symbols) for participant credentials.

### Success Criteria:

#### Automated Verification:

- Unit tests in `src/__tests__/lib/crypto.test.ts` pass with 100% code coverage
- Verifies hashing produces unique salts for identical passwords
- Verifies constant-time verification correctly handles valid passwords and rejects invalid passwords/malformed hashes
- Verifies slug generation produces correct length, URL-safe charset, and high entropy

#### Manual Verification:

- Inspect generated slug outputs for URL safety and absence of problematic characters

---

## Phase 3: Edge Session Token & Cookie Utilities (Signed JWT & Auth Guard)

### Overview

Implement stateless HMAC-SHA256 signed JWT session token creation, verification, and cookie serialization utilities enforcing a 24-hour expiration window.

### Changes Required:

#### 1. Session & Cookie Module

**File**: `src/lib/session.ts`

**Intent**: Manage authenticated per-dashboard user sessions via signed HttpOnly cookies without hitting the database for session validation.

**Contract**:
- `SessionPayload`:
  ```ts
  export interface SessionPayload {
    dashboard_id: string;
    dashboard_hash: string;
    user_id: string;
    user_alias: string;
    exp?: number;
    iat?: number;
  }
  ```
- `createSessionToken(payload: Omit<SessionPayload, 'exp' | 'iat'>, secret: string, ttlSeconds?: number): Promise<string>`: Encodes header (`{"alg":"HS256","typ":"JWT"}`) and claims (`exp = now + 86400`), creates HMAC-SHA256 signature with `crypto.subtle`, and returns `header.payload.signature` in base64url format.
- `verifySessionToken(token: string, secret: string): Promise<SessionPayload | null>`: Verifies signature and expiration; returns payload if valid, `null` if expired, malformed, or tampered.
- `buildSessionCookieHeader(token: string, maxAge?: number): string`: Returns standard `Set-Cookie` header attributes: `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`.
- `buildClearSessionCookieHeader(): string`: Returns `Set-Cookie` header expiring the session cookie immediately (`Max-Age=0`).

### Success Criteria:

#### Automated Verification:

- Unit tests in `src/__tests__/lib/session.test.ts` pass with 100% coverage
- Verifies valid tokens are decoded and verified correctly
- Verifies expired tokens (older than 24 hours) return `null`
- Verifies tampered tokens (modified payload or modified signature) return `null`
- Verifies cookie header builder generates proper security attributes (`HttpOnly`, `Secure`, `SameSite=Lax`)

#### Manual Verification:

- Verify session token expiration boundary edge cases

---

## Phase 4: Domain Type Definitions & Database Client Port/Adapter Extension

### Overview

Extend the `DatabaseClient` interface in `src/client/db-client.ts` with all domain entities and methods, and implement their execution in `SupabaseDatabaseClient` (`src/lib/supabase.ts`).

### Changes Required:

#### 1. Domain Types & Port Definition

**File**: `src/client/db-client.ts`

**Intent**: Define domain entity models and abstract database operations for dashboards, users, notes, and note version history.

**Contract**:
- Domain Models:
  - `Dashboard`: `{ id: string; hash: string; title: string; description: string | null; created_at: string; updated_at: string; }`
  - `DashboardUser`: `{ id: string; dashboard_id: string; user_alias: string; password_hash: string; created_at: string; }`
  - `Note`: `{ id: string; dashboard_id: string; title: string; content: string; version: number; created_at: string; updated_at: string; }`
  - `NoteVersion`: `{ id: string; note_id: string; version: number; title: string; content: string; author_id: string | null; created_at: string; }`
- Input Types:
  - `CreateDashboardInput`: `{ title: string; description?: string | null; hash?: string; users: Array<{ user_alias: string; password_hash: string; }>; }`
  - `CreateNoteInput`: `{ dashboard_id: string; title?: string; content: string; author_id?: string | null; }`
  - `UpdateNoteInput`: `{ note_id: string; title?: string; content: string; expected_version: number; author_id?: string | null; }`
- Port Methods on `DatabaseClient`:
  - `createDashboard(input: CreateDashboardInput): Promise<{ dashboard: Dashboard; users: DashboardUser[]; }>`
  - `getDashboardByHash(hash: string): Promise<Dashboard | null>`
  - `getDashboardById(id: string): Promise<Dashboard | null>`
  - `deleteDashboard(id: string): Promise<boolean>`
  - `getDashboardUserByAlias(dashboard_id: string, user_alias: string): Promise<DashboardUser | null>`
  - `listDashboardUsers(dashboard_id: string): Promise<Omit<DashboardUser, 'password_hash'>[]>`
  - `createNote(input: CreateNoteInput): Promise<{ note: Note; initialVersion: NoteVersion; }>`
  - `updateNote(input: UpdateNoteInput): Promise<{ note: Note; newVersion: NoteVersion; }>`
  - `getNotesByDashboard(dashboard_id: string): Promise<Note[]>`
  - `getNoteById(note_id: string): Promise<Note | null>`
  - `getNoteVersions(note_id: string): Promise<NoteVersion[]>`
  - `deleteNote(note_id: string): Promise<boolean>`

#### 2. Supabase Adapter Implementation

**File**: `src/lib/supabase.ts`

**Intent**: Implement all domain methods using Supabase client queries with error handling, transactional version creation, and cascade safety.

**Contract**:
- Update constructor in `SupabaseDatabaseClient` to read `const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;` and `const SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;` ensuring server-side domain operations authenticate with service-role privileges under strict RLS.
- Implement all port methods in `SupabaseDatabaseClient`.
- Ensure `createDashboard` inserts dashboard and users.
- Ensure `createNote` inserts note and initial `note_versions` row.
- Ensure `updateNote` validates version concurrency, updates note, and inserts new `note_versions` row.
- Wrap all Supabase errors into descriptive errors.

### Success Criteria:

#### Automated Verification:

- Type checking passes with zero errors: `npx tsc --noEmit`
- Unit tests in `src/__tests__/lib/supabase.test.ts` pass with 100% coverage
- Verifies correct handling of optimistic concurrency / version mismatch errors in `updateNote`
- Verifies null handling when records are not found

#### Manual Verification:

- Verify error message clarity and domain mapping consistency

---

## Phase 5: Comprehensive Test Suite & Quality Verification

### Overview

Consolidate all tests, ensure complete branch coverage across crypto, session, and database adapter modules, and verify adherence to repository guidelines (Vitest threshold >= 80%, ESLint 0 errors).

### Changes Required:

#### 1. Test Suite Consolidation

**Files**:
- `src/__tests__/lib/crypto.test.ts`
- `src/__tests__/lib/session.test.ts`
- `src/__tests__/lib/supabase.test.ts`

**Intent**: Ensure all edge cases, malformed inputs, error branches, and boundary conditions are rigorously tested.

**Contract**:
- Test all crypto hashing, salt generation, verification timing, and slug generation functions.
- Test JWT creation, verification, expiration, malformed base64, invalid signatures, and cookie header builders.
- Test Supabase domain methods with mocked responses covering success and failure paths.

### Success Criteria:

#### Automated Verification:

- `npm test` runs and all tests pass
- Coverage report confirms >= 80% coverage across Lines, Functions, Branches, and Statements
- `npm run lint` completes with zero errors

#### Manual Verification:

- Verify test run output in terminal matches all repository quality gates

---

## Testing Strategy

### Unit Tests:
- `src/__tests__/lib/crypto.test.ts`:
  - PBKDF2 hashing produces correct format `$pbkdf2$100000$<salt>$<hash>`
  - Hash verification with correct password returns `true`
  - Hash verification with wrong password returns `false`
  - Hash verification with invalid format returns `false`
  - Slug generator creates 16-character URL-safe string
  - Strong password generator includes expected character classes
- `src/__tests__/lib/session.test.ts`:
  - Create valid 24h JWT session token
  - Verify valid JWT returns original payload
  - Verify expired JWT returns `null`
  - Verify tampered JWT (modified payload or signature) returns `null`
  - Verify malformed JWT string returns `null`
  - Verify cookie header serialization includes `HttpOnly`, `Secure`, `SameSite=Lax`, `Max-Age=86400`
- `src/__tests__/lib/supabase.test.ts`:
  - Mock Supabase client to test `createDashboard`, `getDashboardByHash`, `deleteDashboard`
  - Test `createNote` inserting note and version record
  - Test `updateNote` incrementing version and adding version history snapshot
  - Test error handling when database queries return errors

### Integration Tests:
- Full end-to-end password hash -> database storage -> verification cycle
- Full session token generation -> cookie header -> verification cycle

### Manual Testing Steps:
1. Run `npm test` to verify 100% test execution and coverage summary.
2. Run `npm run lint` to confirm zero linting issues.
3. Validate SQL migration against PostgreSQL syntax rules.

## Performance Considerations

- **PBKDF2 Iteration Budget:** 100,000 iterations of SHA-256 takes ~5-10ms in modern V8 isolates—fast enough for login/creation requests without causing event loop starvation or UI delays.
- **Stateless JWT Verification:** Verifying HMAC-SHA256 tokens in Edge middleware / Server Actions takes < 0.2ms with zero database round-trips.
- **Database Indexes:** Compound indexes on `(dashboard_id, user_alias)`, `(note_id, version DESC)`, and `dashboards(hash)` ensure index-only / index-scan lookups (< 2ms query latency in Supabase PostgreSQL).

## Migration Notes

- Applies via `supabase/migrations/20260819000000_create_dashboard_schema.sql`.
- Coexists seamlessly with the existing `public.info` audit table.
- Does not modify or drop existing tables.

## References

- PRD: `context/foundation/prd.md` (FR-001, FR-002, FR-004, FR-011, Access Control)
- Roadmap: `context/foundation/roadmap.md` (`F-01`)
- Tech Stack: `context/foundation/tech-stack.md`
- Infrastructure Research: `context/foundation/infrastructure.md`
- Existing Database Client: `src/client/db-client.ts`
- Existing Supabase Adapter: `src/lib/supabase.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database Migration & Schema Design

#### Automated

- [x] 1.1 Migration file `supabase/migrations/20260819000000_create_dashboard_schema.sql` is syntactically valid and matches project conventions
- [x] 1.2 PostgreSQL migration applies cleanly with `npm run db:reset` or passes SQL syntax linter

#### Manual

- [ ] 1.3 Review SQL migration to ensure RLS rules and cascading constraints are strictly enforced

### Phase 2: Edge Cryptographic Utilities (Password Hashing & Random Slugs)

#### Automated

- [x] 2.1 Unit tests in `src/__tests__/lib/crypto.test.ts` pass with 100% code coverage
- [x] 2.2 Verifies hashing produces unique salts for identical passwords
- [x] 2.3 Verifies constant-time verification correctly handles valid passwords and rejects invalid passwords/malformed hashes
- [x] 2.4 Verifies slug generation produces correct length, URL-safe charset, and high entropy

#### Manual

- [ ] 2.5 Inspect generated slug outputs for URL safety and absence of problematic characters

### Phase 3: Edge Session Token & Cookie Utilities (Signed JWT & Auth Guard)

#### Automated

- [x] 3.1 Unit tests in `src/__tests__/lib/session.test.ts` pass with 100% coverage
- [x] 3.2 Verifies valid tokens are decoded and verified correctly
- [x] 3.3 Verifies expired tokens (older than 24 hours) return `null`
- [x] 3.4 Verifies tampered tokens (modified payload or modified signature) return `null`
- [x] 3.5 Verifies cookie header builder generates proper security attributes (`HttpOnly`, `Secure`, `SameSite=Lax`)

#### Manual

- [ ] 3.6 Verify session token expiration boundary edge cases

### Phase 4: Domain Type Definitions & Database Client Port/Adapter Extension

#### Automated

- [x] 4.1 Type checking passes with zero errors: `npx tsc --noEmit`
- [x] 4.2 Unit tests in `src/__tests__/lib/supabase.test.ts` pass with 100% coverage
- [x] 4.3 Verifies correct handling of optimistic concurrency / version mismatch errors in `updateNote`
- [x] 4.4 Verifies null handling when records are not found

#### Manual

- [ ] 4.5 Verify error message clarity and domain mapping consistency

### Phase 5: Comprehensive Test Suite & Quality Verification

#### Automated

- [x] 5.1 `npm test` runs and all tests pass
- [x] 5.2 Coverage report confirms >= 80% coverage across Lines, Functions, Branches, and Statements
- [x] 5.3 `npm run lint` completes with zero errors

#### Manual

- [ ] 5.4 Verify test run output in terminal matches all repository quality gates
