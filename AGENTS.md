# Repository Guidelines

Scytala is a private hypermedia and note sharing web platform built with Next.js 16 (App Router), deployed via OpenNext on Cloudflare Workers, utilizing Supabase (PostgreSQL + RPCs) for backend persistence, and Material-UI (MUI) for styling.

## Hard Rules & Agent Instructions
- **No TailwindCSS**: Tailwind was explicitly removed from this project. Use `@mui/material` for all styling.
- **Strict Coverage**: Tests must maintain an 80% coverage threshold across lines, functions, branches, and statements, enforced by `@vitest.config.ts`.
- **Forward-Only Database Migrations**: Database schema evolution is strictly forward-only (`supabase/migrations/<timestamp>_<name>.sql`). Do not create or maintain `down` migration scripts (`down.sql` / `DROP TABLE ... CASCADE`) to prevent catastrophic data loss in production. Rollbacks must be handled via additive forward migrations (fix-forward) or database Point-in-Time Recovery (PITR).
- **Build Isolation**: Production Next.js builds use `@tsconfig.build.json` and exclude test files from serverless edge bundles via `outputFileTracingExcludes` in `@next.config.ts`. Never import test utilities or mocks into production code.
- **Secrets & Environment Defense**: Server secrets (`SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`) must never leak to client components. Validate all runtime configuration with `@src/lib/env.ts`.

## Project Structure
- `@src/app/` - Next.js App Router pages, layouts, and route handlers.
- `@src/actions/` - Next.js Server Actions for auth, dashboards, and note operations.
- `@src/lib/` - Server utilities: Supabase clients, auth guards, session encryption, and rate limiting.
- `@src/components/` - Shared Material-UI presentation components and dialogs.
- `@src/__tests__/` - Unit and integration tests mirroring `src/` modules.
- `@supabase/` - Supabase config and forward migrations (`supabase/migrations/`).
- `@docs/` - Project documentation, including `@docs/deployment.md` and `@docs/initial-idea.md`.

## Build & Test Commands
- `npm run dev` - Starts the Next.js development server.
- `npm run test` - Runs Vitest tests with coverage check.
- `npm run lint` - Runs ESLint against the codebase.
- `npm run typecheck` - Runs TypeScript type checking (`tsc --noEmit`).
- `npm run preview` - Builds and previews the Cloudflare Worker locally via OpenNext.
- `npm run db:reset` - Resets the local Supabase database.
- `npm run deploy` - Builds via OpenNext and deploys to Cloudflare Workers.

## Coding Style & Guidelines
- Use TypeScript with `strict` mode enabled per `@tsconfig.json`.
- Adhere to the ESLint configuration defined in `@eslint.config.mjs`, which extends Next.js Core Web Vitals and TypeScript configs.

## Testing Guidelines
- **Framework**: Vitest using the `happy-dom` environment.
- **Location**: Test files must be co-located or placed in `src/` matching the `*.test.ts` or `*.test.tsx` pattern.
- **Setup**: Global test setup runs from `@src/__tests__/setup.ts`.
- **Threshold**: CI will fail if branch, line, statement, or function coverage drops below 80%.

## Commit & Pull Request Guidelines
- Branch names follow the `feature/<name>` or `fix/<name>` pattern.
- Commits are generally capitalized descriptive sentences (e.g., "[S-02] Additional dashboard hardening", "Fix dashboard logout").
- All Pull Requests must pass the GitHub Actions CI pipeline (`@.github/workflows/test.yml`), which requires `npm run typecheck`, `npm run lint`, and `npm test` (with 80% coverage) to succeed.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
