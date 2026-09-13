# Repository Guidelines

Scytala is a private hypermedia and note sharing web platform built with Next.js 16.3 (App Router) + React 19, deployed via OpenNext on Cloudflare Workers, utilizing Supabase (PostgreSQL + RPCs) for backend persistence, Zod v4 for schema validation, and Material-UI v9 for styling. Current feature set: authentication, note CRUD with version persistence and version history browser, end-to-end note encryption (crypto core + `SESSION_SECRET`-derived env key), dashboard, rate limiting, and a health endpoint.

## Hard Rules & Agent Instructions
- **No TailwindCSS**: Tailwind was explicitly removed from this project. Use `@mui/material` for all styling.
- **Strict Coverage**: Tests must maintain an 80% coverage threshold across lines, functions, branches, and statements, enforced by `@vitest.config.ts`.
- **Forward-Only Database Migrations**: Database schema evolution is strictly forward-only (`supabase/migrations/<timestamp>_<name>.sql`). Do not create or maintain `down` migration scripts (`down.sql` / `DROP TABLE ... CASCADE`) to prevent catastrophic data loss in production. Rollbacks must be handled via additive forward migrations (fix-forward) or database Point-in-Time Recovery (PITR).
- **Build Isolation**: Production Next.js builds use `@tsconfig.build.json` and exclude test files from serverless edge bundles via `outputFileTracingExcludes` in `@next.config.ts`. Never import test utilities or mocks into production code.
- **Secrets & Environment Defense**: Server secrets (`SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`) must never leak to client components. Validate all runtime configuration with `@src/lib/env.ts`.

## Project Structure
- `@src/app/` - Next.js App Router pages, layouts, and route handlers (`api/health`, `api/auth`, `dashboard/[hash]`, `new/` with co-located components and hooks).
- `@src/actions/` - Next.js Server Actions: `auth.ts`, `dashboard.ts`, `notes.ts`, `audit.ts`.
- `@src/lib/` - Server utilities: Supabase clients, auth guards, session/crypto (`note-crypto.ts`, `crypto.ts`, `session.ts`), diffing, logger, and rate limiting.
- `@src/schemas/` - Zod schemas (`auth.ts`, `dashboard.ts`, `notes.ts`).
- `@src/components/` - Shared Material-UI presentation components and dialogs.
- `@src/theme/` + `@src/providers/` - MUI "papyrus" light theme and theme provider.
- `@src/client/` - Browser-side Supabase client (`db-client.ts`).
- `@src/utils/` - Small client-safe helpers (e.g. `clipboard.ts`).
- `@src/__tests__/` - Unit and integration tests mirroring `src/` modules (`src/__tests__/integration/` targets the live local Supabase PostgreSQL).
- `@e2e/` - Playwright browser tests (`golden-path`, `note-lifecycle`, `note-concurrency`, `seed`, `smoke`) with fixtures in `e2e/fixtures/` and rules in `e2e/README.md`.
- `@supabase/` - Supabase config and forward migrations (`supabase/migrations/`).
- `@docs/` - Project documentation, including `@docs/deployment.md` and `@docs/initial-idea.md`.

## Build & Test Commands
- `npm run dev` - Starts the Next.js development server.
- `npm run test` - Runs Vitest tests with coverage check.
- `npm run test:integration` - Runs Vitest integration tests against the live local Supabase PostgreSQL (load `.env.ai` in bash first, e.g. `set -a && [ -f .env.ai ] && . ./.env.ai && set +a && npm run test:integration`; when running inside Docker use the `.env.ai` variables, which point at `host.docker.internal`).
- `npm run test:e2e` - Runs local Playwright browser tests in headless mode (load `.env.ai` in bash first, e.g. `set -a && [ -f .env.ai ] && . ./.env.ai && set +a && npm run test:e2e`).
- `npm run test:e2e:ui` - Opens the interactive Playwright test runner UI.
- `npm run test:e2e:init` - Downloads Playwright browser binaries and dependencies.
- `npm run lint` - Runs ESLint against the codebase.
- `npm run check:type` - Runs TypeScript type checking (`tsc --noEmit`).
- `npm run check:ready` - Full pre-submit gate: lint, typecheck, unit tests, E2E tests, and OpenNext Worker build.
- `npm run preview` - Builds and previews the Cloudflare Worker locally via OpenNext.
- `npm run db:reset` - Resets the local Supabase database.
- `npm run deploy` - Builds via OpenNext and deploys to Cloudflare Workers.
- `npm run generate-session-secret` - Generates a `SESSION_SECRET` value (`openssl rand -base64 32`).

## Coding Style & Guidelines
- Use TypeScript with `strict` mode enabled per `@tsconfig.json`.
- Adhere to the ESLint configuration defined in `@eslint.config.mjs`, which extends Next.js Core Web Vitals and TypeScript configs.

## Testing Guidelines
- **Framework**: Vitest using the `happy-dom` environment.
- **Location**: Test files must be co-located or placed in `src/` matching the `*.test.ts` or `*.test.tsx` pattern.
- **Setup**: Global test setup runs from `@src/__tests__/setup.ts`.
- **Threshold**: CI will fail if branch, line, statement, or function coverage drops below 80%.
- **E2E Testing (Playwright)**: Always load `.env.ai` in the bash shell prior to running Playwright tests (`set -a && [ -f .env.ai ] && . ./.env.ai && set +a && npm run test:e2e` or `env $(grep -v '^#' .env.ai | xargs) npm run test:e2e`). This injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` into `process.env` so that `clearRateLimits()` in `e2e/fixtures/test-base.ts` can reset the PostgreSQL `rate_limits` table between test runs and avoid throttling. Follow the locator and test-writing rules in `@e2e/README.md`.

## Commit & Pull Request Guidelines
- Branch names follow the `feature/<name>` or `fix/<name>` pattern.
- Commits are generally capitalized descriptive sentences (e.g., "[S-02] Additional dashboard hardening", "Fix dashboard logout").
- All Pull Requests must pass the GitHub Actions CI pipeline (`@.github/workflows/test.yml`), which requires `npm run check:type`, `npm run lint`, and `npm test` (with 80% coverage) to succeed.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
