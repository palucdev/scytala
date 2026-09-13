<p align="center">
  <img src="public/logo_name.svg" alt="Scytala" width="800" />
</p>

# Scytala

Scytala is a private hypermedia and note sharing web platform. It allows users to create isolated, self-hosted dashboards for sharing private notes and media with selected participants without relying on centralized user accounts or third-party cloud note services.

Access is bound directly to a unique dashboard URL with per-dashboard credentials rather than a global account identity. Notes are displayed as tiles, edited via a full-page line-numbered editor, and tracked with immutable version history and optimistic concurrency control.

## Table of Contents

- [Overview](#overview)
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
- **Note Management**: Create, edit, and delete plain text notes presented as readable dashboard tiles.
- **Full-Page Editor**: Line-numbered text editor with atomic updates and version conflict detection.
- **Immutable Version History**: Every edit is automatically preserved as an immutable snapshot with timestamps.
- **Secure Deletion**: Password re-authentication is required to delete notes or dashboards.

## Architecture & Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router, Server Actions)
- **UI & Styling**: [Material-UI (MUI) 9](https://mui.com/) with Emotion (TailwindCSS is explicitly excluded)
- **Edge Deployment**: [Cloudflare Workers](https://workers.cloudflare.com/) deployed via [OpenNext](https://open-next.js.org/cloudflare) (`@opennextjs/cloudflare` and `wrangler`)
- **Database & Persistence**: [Supabase](https://supabase.com/) PostgreSQL with atomic Stored Procedures (RPCs) and DatabaseClient abstraction
- **Authentication & Cryptography**: Web Crypto API (PBKDF2 password hashing with timing equalization, HMAC-SHA256 signed HttpOnly cookies)
- **Validation**: [Zod](https://zod.dev/) runtime validation for environment variables and Server Action payloads
- **Testing**: [Vitest](https://vitest.dev/) with `happy-dom`, `@testing-library/react`, and v8 coverage runner

## General Principles

- **No Global Accounts**: Identity is scoped entirely to the dashboard. A user on one dashboard has no implicit association with another dashboard.
- **Defense-in-Depth Security**:
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
   NOTE_ENCRYPTION_KEY=<64-hex-char-key>   # openssl rand -hex 32
   DEPLOY_ID=development
   APP_VERSION=0.3.1
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
| `npm run typecheck`               | Runs TypeScript compiler checks without emitting files (`tsc --noEmit`)      |
| `npm run preview`                 | Builds and previews the Cloudflare Worker locally via OpenNext and Miniflare |
| `npm run db:reset`                | Resets the local Supabase database and applies all migrations                |
| `npm run deploy`                  | Builds the worker bundle and deploys to Cloudflare Workers                   |
| `npm run generate-session-secret` | Generates a cryptographically random 32-byte base64 secret string            |

## Roadmap

Development follows structured, test-verified slices. For complete details, see `context/foundation/roadmap.md`.

### Completed Milestones

- **F-01**: Database schema (`dashboards`, `dashboard_users`, `notes`, `note_versions`) and cryptographic authentication scaffolding.
- **F-02**: Structured JSON API error logger, App Router error boundaries, and health check route (`/api/health`).
- **S-01**: Dashboard Creation Wizard (`/new`) with title, description, and participant credential generation.
- **S-02**: Dashboard Login (`/dashboard/<hash>`) with signed HttpOnly sessions and note tiles view.
- **S-03 (North Star)**: Note CRUD operations with full-page line-numbered editor (`/dashboard/<hash>/note/<noteId>`), immutable version persistence, password-gated deletion, and optimistic concurrency control.
- **Infra Hardening**: Dual-layer rate limiting (Cloudflare Worker binding + Supabase RPC), Cloudflare 5-layer test build isolation, and dashboard logout session cleanup.

### Current & Upcoming Slices

| Slice ID | Title                                 | Description                                                                         | Status   |
| :------- | :------------------------------------ | :---------------------------------------------------------------------------------- | :------- |
| **S-04** | Note Version History Browser          | Chronological history drawer to view previous versions, timestamps, and authors     | Ready    |
| **S-05** | Manual Sync & Conflict Resolution     | Manual sync button and side-by-side diff merge modal for concurrent edit resolution | Ready    |
| **S-06** | Dashboard Management & Lifecycle      | Update dashboard metadata (title, description) and cascade dashboard deletion       | Ready    |
| **T-01** | Tenant Isolation & Session Guards     | Integration test suite for cross-dashboard data isolation and session boundaries    | Ready    |
| **T-02** | Concurrency & Version Integrity Tests | Concurrency test suite for atomic updates, version snapshots, and rollback handling | Ready    |
| **T-03** | Server Input Validation & Defense     | Automated security tests for payload limits, injection defense, and Zod schemas     | Ready    |
| **T-04** | CI Quality Gates & Coverage Hardening | Enforce coverage floors and automated quality gates in GitHub Actions               | Proposed |
| **O-01** | Edge Error Tracking & APM             | Centralized error reporting via Next.js `instrumentation.ts` (`onRequestError`)     | Proposed |

## Documentation

- [Deployment & Build Isolation Architecture](docs/deployment.md): Detailed documentation of the 5-layer test and build isolation strategy, Cloudflare Workers configuration, watch paths, and rollback runbooks.
- [Initial Idea & MVP Scope](docs/initial-idea.md): Original product problem statement, MVP feature boundaries, non-goals, and success metrics.
- [Repository Guidelines](AGENTS.md): Onboarding rules, architectural standards, forward-only migration policies, and testing guidelines for contributors and AI agents.
