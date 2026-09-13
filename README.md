<p align="center">
  <img src="public/logo_name.svg" alt="Scytala" width="800" />
</p>

# Scytala

Scytala is a private hypermedia and note sharing web platform. It allows users to create isolated, self-hosted dashboards for sharing private notes and media with selected participants without relying on centralized user accounts or third-party cloud note services.

Access is bound directly to a unique dashboard URL with per-dashboard credentials rather than a global account identity. Notes are displayed as tiles, edited via a full-page line-numbered editor, browsed through an immutable version history drawer with word-level diff previews, and tracked with optimistic concurrency control.

## Table of Contents

- [Overview](#overview)
- [Security, Privacy & Self-Hosting](#security-privacy--self-hosting)
- [Architecture & Tech Stack](#architecture--tech-stack)
- [General Principles](#general-principles)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Configuration](#environment-configuration)
  - [Database Setup](#database-setup)
  - [Running the Application](#running-the-application)
- [Available Scripts](#available-scripts)
- [Roadmap](#roadmap)
- [Documentation](#documentation)

## Overview

Traditional sharing platforms often rely on fast-moving chat streams that make content difficult to search and organize, or third-party cloud services that introduce privacy and vendor lock-in concerns.

Scytala provides:

- **Isolated Dashboards**: Dashboards are accessed via unique hashed URLs (`/dashboard/<hash>`). No global account registration is required.
- **Per-Dashboard Credentials**: Each dashboard defines its own participant user IDs and randomized high-entropy passwords during creation.
- **Egalitarian Ownership**: Dashboards are owned collectively by all of their participants — there is no admin role, no owner hierarchy, and no special creator privileges once the dashboard exists; every member holds identical rights over content and settings (see [General Principles](#general-principles)).
- **Note Management**: Create, edit, and delete plain text notes presented as readable dashboard tiles.
- **Full-Page Editor**: Line-numbered text editor with atomic updates and version conflict detection.
- **Version History Browser**: Chronological history drawer with timestamps, authors, and character-delta badges; past versions can be inspected read-only, diffed word-level against the current state, and restored non-destructively.
- **Encrypted at Rest**: Note titles and contents (including every version snapshot) are AES-256-GCM encrypted in the database adapter before storage — the database alone never holds readable note content.
- **Secure Deletion**: Password re-authentication is required to delete notes or dashboards.

**Where it's heading:** Scytala is evolving from a notes dashboard into a complete private sharing platform — beyond notes, the roadmap is to support **file, image, and media sharing, surveys, calendars, chats and more**, so friends, collaborators, and family can keep every kind of shared content in one organized, searchable, private place instead of scattered across chat streams and cloud services.

## Security, Privacy & Self-Hosting

Scytala is built around a simple threat model: your notes — and eventually your files, images, surveys, calendars, and chats — are for the people you choose — not for whoever can look at the database, and not for a SaaS provider's employees or analytics pipelines. Whatever content type a dashboard gains, it inherits the same privacy stance: encrypted, participant-only access.

**What is true today (v1, at-rest encryption):**

- Note titles and contents — including every version snapshot — are encrypted inside the persistence adapter with AES-256-GCM (`v1:<iv>:<ciphertext>` envelopes, 128-bit random IV, note-ID-bound AAD) before anything reaches PostgreSQL. A database dump without the application's `NOTE_ENCRYPTION_KEY` yields unreadable ciphertext.

**What we are building next (v2, zero-knowledge end-to-end encryption):**

- A database leak will not be the only scenario covered — the current v1 design still allows anyone holding *both* the DB and the server-side key material to read everything. The next slice (S-08, zero-knowledge client-side E2EE, modeled on Tuta's architecture) removes that residual access:
  - Notes are encrypted **in the browser** under a random per-dashboard data key (DEK); the DEK is wrapped per participant under a key derived client-side from their password (PBKDF2-SHA256, 600k iterations, non-extractable keys).
  - Login authenticates with a one-way password-derived verifier — the raw password never crosses the network, even over TLS, so the server holds nothing usable to derive decryption keys.
  - The encryption keys exist only in the participant's browser memory (passive "Vault locked" state after reload, 30-minute auto-lock), and the operator of the instance — even an admin with full production DB access — cannot read note content.
- **Accepted trade-off of zero-knowledge:** there is deliberately no server-side recovery. A forgotten password means the notes are permanently unreadable — that is the point. Passwords are generated once at dashboard creation and never change.

**Self-hosting as the privacy endgame:**

- Scytala's premise is that true privacy comes from *controlling the infrastructure*: the goal is to make the application servable on **local hardware** — the operator's own machine or home server, running the app and its Supabase/PostgreSQL stack directly — **without relying on Cloudflare** (or any other edge cloud) at all, so that nobody but the instance owner holds any key material or hosts any ciphertext.
- Self-hosting also complements the E2EE residual limits of web apps: since the server-side JavaScript is shipped by the operator, the strongest zero-knowledge guarantee is the one where *you* are the operator running Scytala on your own box. That is the direction the product is being steered in, and the reason the crypto core is kept small, auditable, and dependency-free.
- Today's Cloudflare Workers + OpenNext deployment is the convenient managed path; local-hardware serving (e.g. Node.js server or self-hosted edge runtime alongside self-hosted Supabase containers) is an explicitly planned future direction, kept feasible by the codebase's zero-native-dependency, edge-compatible-by-construction design.

**Defense-in-depth measures already in place:**

- Server secrets (`SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `NOTE_ENCRYPTION_KEY`) are strictly validated at runtime via `src/lib/env.ts` and never leaked to client bundles.
- Authentication uses constant-time comparisons and signed, HttpOnly, SameSite session cookies (`scytala_session_<hash>`).
- Sensitive operations (login and note mutations) are protected by dual-layer rate limiting: Cloudflare edge bindings and a PostgreSQL token bucket RPC.

## Architecture & Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router, Server Actions)
- **UI & Styling**: [Material-UI (MUI) 9](https://mui.com/) with Emotion (TailwindCSS is explicitly excluded)
- **Edge Deployment**: [Cloudflare Workers](https://workers.cloudflare.com/) deployed via [OpenNext](https://open-next.js.org/cloudflare) (`@opennextjs/cloudflare` and `wrangler`)
- **Database & Persistence**: [Supabase](https://supabase.com/) PostgreSQL with atomic Stored Procedures (RPCs) and DatabaseClient abstraction
- **Authentication & Cryptography**: Web Crypto API (PBKDF2 password hashing with timing equalization, AES-256-GCM envelopes via `src/lib/note-crypto.ts`, HMAC-SHA256 signed HttpOnly cookies)
- **Validation**: [Zod](https://zod.dev/) runtime validation for environment variables and Server Action payloads
- **Testing**: [Vitest](https://vitest.dev/) with `happy-dom`, `@testing-library/react`, and v8 coverage runner

## General Principles

- **No Global Accounts**: Identity is scoped entirely to the dashboard. A user on one dashboard has no implicit association with another dashboard.
- **Egalitarian Rights & Collective Ownership**: A goal Scytala is committed to is that every dashboard is *fully owned by all of its participants* — flat rights, no privileged roles, no creator-vs-member asymmetry. Whoever is inside a dashboard can do everything anyone else inside can: create, edit, restore, delete content, and manage dashboard settings. The person who created the dashboard and distributes credentials is a facilitator, not an owner; their only special moment is the brief window *before* other members join. Long-term, this extends cryptographically: every participant wraps the same dashboard encryption key, so as far as the data is concerned, all members are equal holders of the space.
- **Defense-in-Depth Security** (see [Security, Privacy & Self-Hosting](#security-privacy--self-hosting) for the full E2EE/zero-knowledge model):
  - Server secrets (`SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `NOTE_ENCRYPTION_KEY`) are strictly validated at runtime via `src/lib/env.ts` and never leaked to client bundles.
  - Authentication uses constant-time comparisons and signed, HttpOnly, SameSite session cookies (`scytala_session_<hash>`).
  - Sensitive operations (login and note mutations) are protected by dual-layer rate limiting: Cloudflare edge bindings and a PostgreSQL token bucket RPC.
- **Data Integrity & Concurrency**:
  - Database schema evolution is forward-only (`supabase/migrations/`). Down migrations (`DROP TABLE ... CASCADE`) are prohibited to eliminate accidental production data loss.
  - Note updates execute through transactional RPCs that enforce optimistic concurrency checks (`expected_version`). Concurrent edits prompt diff resolution instead of silent overwrites.
- **Build & Test Isolation**:
  - Cloudflare production builds strictly exclude test files, coverage reports, and mocks via `tsconfig.build.json`, `outputFileTracingExcludes` in `next.config.ts`, and `public/.assetsignore`.
  - Cloudflare Git integration evaluates build watch paths to skip unnecessary deployments when only tests or documentation are changed.
- **Strict Quality Gates**:
  - The test suite enforces an 80% coverage threshold across lines, functions, branches, and statements via Vitest.
  - All pull requests must pass TypeScript strict type checking (`tsc --noEmit`), ESLint, and test coverage checks.

## Getting Started

### Prerequisites

- **Node.js**: Version 20.x or higher
- **npm**: Version 10.x or higher
- **Docker**: Required to run the local Supabase environment
- **Supabase CLI**: Can be invoked directly via `npx supabase`

### Environment Configuration

1. Copy the example environment file:

   ```bash
   cp .env.example .env.local
   ```

2. Generate a secure 32-character session secret:

   ```bash
   npm run generate-session-secret
   ```

3. Update `.env.local` with your configuration:
   ```env
   SUPABASE_URL=http://127.0.0.1:54321
   SUPABASE_ANON_KEY=<your-supabase-anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
   SESSION_SECRET=<generated-session-secret>
   NOTE_ENCRYPTION_KEY=<64-hex-char-key>   # openssl rand -hex 32 (note encryption at rest)
   DEPLOY_ID=development
   APP_VERSION=0.5.0
   LOG_LEVEL=info
   SUPABASE_TIMEOUT_MS=8000
   ```

### Database Setup

1. Start the local Supabase containers:

   ```bash
   npx supabase start
   ```

2. Reset the database to run all forward migrations:
   ```bash
   npm run db:reset
   ```

### Running the Application

1. Start the Next.js development server:

   ```bash
   npm run dev
   ```

2. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

| Command                           | Description                                                                  |
| :-------------------------------- | :--------------------------------------------------------------------------- |
| `npm run dev`                     | Starts the Next.js local development server                                  |
| `npm run build`                   | Builds the production Next.js application                                    |
| `npm run start`                   | Starts the Next.js production server locally                                 |
| `npm test`                        | Runs the Vitest test suite with an 80% coverage threshold                    |
| `npm run lint`                    | Runs ESLint against all source and test files                                |
| `npm run check:type`              | Runs TypeScript compiler checks without emitting files (`tsc --noEmit`)      |
| `npm run check:ready`             | Full pre-submit gate: lint, typecheck, unit tests, E2E tests, worker build   |
| `npm run preview`                 | Builds and previews the Cloudflare Worker locally via OpenNext and Miniflare |
| `npm run db:reset`                | Resets the local Supabase database and applies all migrations                |
| `npm run deploy`                  | Builds the worker bundle and deploys to Cloudflare Workers                   |
| `npm run generate-session-secret` | Generates a cryptographically random 32-byte base64 secret string            |
| `npm run test:e2e`                | Runs the Playwright E2E suite in headless mode (load `.env.ai` first)        |

## Roadmap

Development follows structured, test-verified slices. For complete details, see `context/foundation/roadmap.md`.

### Completed Milestones

- **F-01**: Database schema (`dashboards`, `dashboard_users`, `notes`, `note_versions`) and cryptographic authentication scaffolding.
- **F-02**: Structured JSON API error logger, App Router error boundaries, and health check route (`/api/health`).
- **S-01**: Dashboard Creation Wizard (`/new`) with title, description, and participant credential generation.
- **S-02**: Dashboard Login (`/dashboard/<hash>`) with signed HttpOnly sessions and note tiles view.
- **S-03 (North Star)**: Note CRUD operations with full-page line-numbered editor (`/dashboard/<hash>/note/<noteId>`), immutable version persistence, password-gated deletion, and optimistic concurrency control.
- **S-04**: Note Version History Browser — chronological drawer, read-only snapshot previews, word-level diff against current state, and non-destructive restore.
- **S-07**: Note Encryption at Rest — AES-256-GCM envelopes (`v1:` format, note-ID-bound AAD) for note titles and contents, including all version snapshots; deployed to production. Superseded as the next-release design by S-08 (see below).
- **T-05**: Playwright E2E suite — Golden Path (wizard → credentials → login → note authoring → version history → restore → logout) and note lifecycle flows across Chromium and Firefox, with 5-layer build isolation.
- **Infra Hardening**: Dual-layer rate limiting (Cloudflare Worker binding + Supabase RPC), Cloudflare 5-layer test build isolation, and dashboard logout session cleanup.

### Current & Upcoming Slices

| Slice ID | Title                                 | Description                                                                         | Status   |
| :------- | :------------------------------------ | :---------------------------------------------------------------------------------- | :------- |
| **S-08** | Zero-Knowledge Note Encryption (E2EE) | Client-side AES-256-GCM under a per-dashboard DEK wrapped per participant; verifier-based login; **operator cannot read notes** — see [Security, Privacy & Self-Hosting](#security-privacy--self-hosting) | Ready |
| **S-05** | Manual Sync & Conflict Resolution     | Manual sync button and side-by-side diff merge modal for concurrent edit resolution | Ready    |
| **S-06** | Dashboard Management & Lifecycle      | Update dashboard metadata (title, description) and cascade dashboard deletion       | Ready    |
| **B-01** | Version History Count Fix             | Unify modification-count semantics between the history drawer and preview popup     | Ready    |
| **B-02** | Duplicate Participant Alias Fix       | Block duplicate participant aliases in the creation wizard (UI + server validation)  | Ready    |
| **T-01** | Tenant Isolation & Session Guards     | Integration test suite for cross-dashboard data isolation and session boundaries    | Ready    |
| **T-02** | Concurrency & Version Integrity Tests | Concurrency test suite for atomic updates, version snapshots, and rollback handling | Ready    |
| **T-03** | Server Input Validation & Defense     | Automated security tests for payload limits, injection defense, and Zod schemas     | Ready    |
| **T-04** | CI Quality Gates & Coverage Hardening | Enforce coverage floors and automated quality gates in GitHub Actions               | Proposed |
| **O-01** | Edge Error Tracking & APM             | Centralized error reporting via Next.js `instrumentation.ts` (`onRequestError`)     | Proposed |
| **H-01** | Production Hardening                  | Env validation unification, session secret fail-fast, action body limits, read retries, nonce-based CSP | Proposed |

## Documentation

- [Deployment & Build Isolation Architecture](docs/deployment.md): Detailed documentation of the 5-layer test and build isolation strategy, Cloudflare Workers configuration, watch paths, and rollback runbooks.
- [Initial Idea & MVP Scope](docs/initial-idea.md): Original product problem statement, MVP feature boundaries, non-goals, and success metrics.
- [Repository Guidelines](AGENTS.md): Onboarding rules, architectural standards, forward-only migration policies, and testing guidelines for contributors and AI agents.
