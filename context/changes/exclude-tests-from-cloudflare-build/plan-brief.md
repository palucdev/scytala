# Exclude Test Files from Cloudflare Build — Plan Brief

> Full plan: `context/changes/exclude-tests-from-cloudflare-build/plan.md`  
> Research: `context/changes/exclude-tests-from-cloudflare-build/research.md`

## What & Why

Exclude all test files (`src/**/__tests__/**`, `*.test.ts(x)`, `vitest.config.ts`, `coverage/`) from Cloudflare builds, bundling, static asset uploads, and Git build triggers. This optimizes build duration and avoids test-related build failures on Cloudflare, while strictly preserving full type safety and 80% test coverage gates in local development and GitHub Actions CI.

## Starting Point

Next.js App Router tree-shaking and `outputFileTracingExcludes` in `next.config.ts` prevent test code from entering runtime worker bundles, but `next build` currently type-checks test files via root `tsconfig.json`, static asset uploads lack `.assetsignore`, and test-only Git commits trigger redundant Cloudflare builds.

## Desired End State

Production builds use a dedicated `tsconfig.build.json` to skip test files during `next build`, `public/.assetsignore` guards Cloudflare static assets, automated tests in `src/__tests__/build-isolation.test.ts` guarantee configuration integrity, and Cloudflare Build Watch Paths are documented for trigger suppression.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| :--- | :--- | :--- | :--- |
| **TypeScript Isolation** | Dedicated `tsconfig.build.json` via `next.config.ts` | Excludes test files from `next build` while root `tsconfig.json` preserves IDE & CI type checking. | Research / Plan |
| **Asset Filtering** | `public/.assetsignore` | OpenNext copies it to `.open-next/assets/` where Wrangler ignores test artifacts, fixtures, and docs. | Research / Plan |
| **Trigger Filtering** | Cloudflare Build Watch Paths | Skips Cloudflare builds entirely when a commit only touches tests, configs, or markdown docs. | Research / Plan |
| **Regression Prevention** | Vitest build isolation test suite | Automatically validates config files and ignore patterns to prevent regressions in CI. | Plan |

## Scope

**In scope:**
- Create `tsconfig.build.json` and configure `typescript.tsconfigPath` in `next.config.ts`.
- Create `public/.assetsignore` with patterns for tests, fixtures, coverage, and markdown.
- Create automated test suite `src/__tests__/build-isolation.test.ts`.
- Update deployment documentation (`docs/deployment.md` and `context/deployment/deploy-plan.md`).

**Out of scope:**
- Modifying Vitest test coverage thresholds (80% strict requirement remains intact).
- Disabling CI type checking or CI test runs (`npm run typecheck` and `npm test` remain blocking in CI).
- Modifying Cloudflare runtime worker bindings or database migrations.

## Architecture / Approach

The isolation strategy operates across 5 defense-in-depth layers:

1. **Trigger Layer**: Cloudflare Build Watch Paths (`path_excludes`) skips builds on test/doc changes.
2. **Compilation Layer**: `tsconfig.build.json` excludes test files during `next build`.
3. **Routing Layer**: Next.js App Router route entrypoints ignore non-routable test files.
4. **Packaging Layer**: `outputFileTracingExcludes` in `next.config.ts` blocks tests from `.nft.json` tracing.
5. **Asset Upload Layer**: `public/.assetsignore` blocks test artifacts and markdown from Cloudflare CDN.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| :--- | :--- | :--- |
| 1. TypeScript Build Isolation | `tsconfig.build.json` & `next.config.ts` configuration | TS path alias resolution differences between configs |
| 2. Static Assets Filtering | `public/.assetsignore` copied to `.open-next/assets/` | Missing glob patterns for temporary artifacts |
| 3. Automated Verification & Docs | `src/__tests__/build-isolation.test.ts` & deployment documentation | Outdated dashboard settings instructions |

**Prerequisites:** Working Node.js 20+, Vitest, and OpenNext local environment.  
**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- Assumes repository owner configures Cloudflare Build Watch Paths in the Cloudflare Dashboard according to documented globs.
- Assumes Next.js continues supporting `typescript.tsconfigPath` in `next.config.ts`.

## Success Criteria (Summary)

- `npm run build` cleanly compiles production bundles without parsing test files.
- `npm run typecheck` and `npm test` maintain strict type safety and $\ge 80\%$ test coverage in CI.
- Wrangler asset synchronization excludes test files, coverage outputs, and documentation.
