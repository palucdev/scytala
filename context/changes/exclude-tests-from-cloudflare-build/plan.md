# Exclude Test Files from Cloudflare Build Implementation Plan

## Overview

Establish complete isolation for test files (`src/**/__tests__/**`, `*.test.ts(x)`, `vitest.config.ts`, `coverage/`, test fixtures) across all five build and deployment layers of Scytala. Tests remain strictly enforced and blocking for local development and CI/CD pipelines (maintaining 80% coverage and full TypeScript type checking), while remaining completely transparent and excluded from Next.js production builds, OpenNext packaging, Wrangler static asset uploads, and Cloudflare Git build triggers.

## Current State Analysis

- **Module Bundling & Routing**: Next.js App Router route discovery and Webpack/Turbopack tree-shaking already prevent test files from entering client and server JS bundles.
- **Node File Tracing (NFT)**: [`next.config.ts`](../../../next.config.ts#L55-L63) contains `outputFileTracingExcludes` for `src/**/__tests__/**`, `src/**/*.test.{ts,tsx}`, `coverage/**`, and `vitest.config.ts`.
- **TypeScript Compilation Overlap**: `next build` (invoked during `npm run build:worker` / `opennextjs-cloudflare build`) reads root [`tsconfig.json`](../../../tsconfig.json#L31-L41) which includes `**/*.ts` and `**/*.tsx`. This causes Next.js to unnecessarily type-check all test files during production builds.
- **Static Assets Upload**: Wrangler copies `.open-next/assets/` to Cloudflare edge storage. Without `.assetsignore`, any test fixtures or docs accidentally placed in `public/` would be deployed to Cloudflare CDN.
- **Cloudflare Build Triggers**: Pushes modifying only test files or documentation currently trigger full Cloudflare Worker builds unless Build Watch Paths are configured.

## Desired End State

1. **Type-Checking Isolation**: Next.js production builds use `tsconfig.build.json` via `typescript.tsconfigPath` in `next.config.ts`, cleanly excluding all test and spec files. Root `tsconfig.json` continues providing full type-checking and IntelliSense in IDEs and CI (`npm run typecheck`).
2. **Static Assets Defense-in-Depth**: `public/.assetsignore` prevents test fixtures, test files, coverage outputs, and markdown docs from syncing to Cloudflare CDN.
3. **Automated Verification Suite**: A dedicated Vitest test suite (`src/__tests__/build-isolation.test.ts`) verifies the presence and integrity of `tsconfig.build.json`, `next.config.ts` configuration, and `.assetsignore` patterns.
4. **Trigger Gate & Deployment Documentation**: Cloudflare Build Watch Paths settings and the 5-layer isolation architecture are clearly documented in `docs/deployment.md` and `context/deployment/deploy-plan.md`.

### Key Discoveries:

- [`next.config.ts:55-63`](../../../next.config.ts#L55-L63): Next.js supports `outputFileTracingExcludes` to prevent files matching globs from being traced into standalone output bundles.
- [`tsconfig.json:31-41`](../../../tsconfig.json#L31-L41): Root `tsconfig.json` includes `**/*.ts` and `**/*.tsx`, which is ideal for IDE IntelliSense and CI `tsc --noEmit`.
- Next.js native `typescript.tsconfigPath` configuration allows overriding the TypeScript configuration file specifically during `next build`.
- OpenNext copies `public/*` directly to `.open-next/assets/*`, enabling `public/.assetsignore` to automatically guard Wrangler uploads.

## What We're NOT Doing

- We are NOT removing or relaxing test coverage thresholds (strict 80% coverage on lines, functions, branches, statements is preserved in `vitest.config.ts`).
- We are NOT disabling TypeScript type checking in GitHub Actions CI (`npm run typecheck` continues running against root `tsconfig.json`).
- We are NOT changing the test runner or test framework (`happy-dom`, Vitest, and React Testing Library remain untouched).
- We are NOT altering Next.js App Router directory conventions or route layouts.

## Implementation Approach

We apply a defense-in-depth approach across 3 structured phases:

1. **Phase 1 (TypeScript Build Isolation)**: Create `tsconfig.build.json` and wire it into `next.config.ts`. This isolates `next build` to production source code without impacting IDE intellisense or CI typecheck.
2. **Phase 2 (Static Assets & Wrangler Safeguards)**: Add `public/.assetsignore` to prevent test artifacts from reaching the Cloudflare CDN edge.
3. **Phase 3 (Verification & Documentation)**: Add automated tests to prevent regressions and document Cloudflare Build Watch Paths settings for Git deployment integration.

---

## Phase 1: TypeScript Build Isolation

### Overview

Create a dedicated `tsconfig.build.json` file extending `tsconfig.json` that excludes all test and mock files, and configure `next.config.ts` to use it during `next build`.

### Changes Required:

#### 1. Dedicated Build TSConfig

**File**: `tsconfig.build.json`

**Intent**: Define a TypeScript configuration specifically for Next.js production builds that excludes all test files, test configurations, and test directories.

**Contract**: Extends `./tsconfig.json` and excludes `node_modules`, `src/**/__tests__/**`, `src/**/*.test.ts`, `src/**/*.test.tsx`, `src/**/*.spec.ts`, `src/**/*.spec.tsx`, and `vitest.config.ts`.

#### 2. Next.js Config TSConfig Path

**File**: `next.config.ts`

**Intent**: Configure Next.js to use `tsconfig.build.json` for compilation during `next build`, while keeping existing headers, env, and `outputFileTracingExcludes` intact.

**Contract**: Add `typescript: { tsconfigPath: "tsconfig.build.json" }` to `nextConfig`.

### Success Criteria:

#### Automated Verification:

- Type checking passes with root `tsconfig.json`: `npm run typecheck`
- Next.js build runs cleanly with `tsconfig.build.json`: `npm run build`

#### Manual Verification:

- IDE continues to provide autocomplete and error highlighting in `src/__tests__/**` files and `vitest.config.ts`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Static Assets Filtering & Wrangler Defense

### Overview

Add a `.assetsignore` file in `public/` so OpenNext automatically places it into `.open-next/assets/.assetsignore`, ensuring Wrangler ignores any non-production artifacts during asset uploads.

### Changes Required:

#### 1. Public Assets Ignore File

**File**: `public/.assetsignore`

**Intent**: Specify ignore rules for Wrangler static assets deployment to prevent test fixtures, test files, coverage directories, sourcemaps, and markdown documents from being uploaded to Cloudflare CDN.

**Contract**: Contains standard glob ignore patterns for `**/__tests__/**`, `**/*.test.*`, `**/*.spec.*`, `coverage/**`, `*.md`, and `*.map`.

### Success Criteria:

#### Automated Verification:

- OpenNext build succeeds and generates assets directory: `npm run build:worker`
- Verified `.open-next/assets/.assetsignore` exists after build

#### Manual Verification:

- Inspect `.open-next/assets/` directory to confirm only production static assets (`_next/static/`, favicons/images) and `.assetsignore` are present.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Automated Test Verification & Deployment Documentation

### Overview

Write automated tests to lock in the build isolation configuration and document the Cloudflare Build Watch Paths in the deployment documentation.

### Changes Required:

#### 1. Build Isolation Unit Test Suite

**File**: `src/__tests__/build-isolation.test.ts`

**Intent**: Provide regression protection ensuring `tsconfig.build.json`, `next.config.ts`, and `public/.assetsignore` maintain their isolation configurations.

**Contract**: Vitest suite checking that `tsconfig.build.json` excludes test files, `next.config.ts` specifies `typescript.tsconfigPath` and `outputFileTracingExcludes`, and `public/.assetsignore` includes test/coverage exclusions.

#### 2. Deployment Documentation Update

**File**: `docs/deployment.md` and `context/deployment/deploy-plan.md`

**Intent**: Document the Cloudflare Build Watch Paths configuration (`path_includes` and `path_excludes`) and the 5-layer isolation strategy.

**Contract**: Add explicit dashboard settings table for Build Watch Paths and instructions for CI vs CD separation.

### Success Criteria:

#### Automated Verification:

- Vitest tests pass with $\ge 80\%$ coverage: `npm test`
- TypeScript type checking passes: `npm run typecheck`
- ESLint linting passes: `npm run lint`

#### Manual Verification:

- Review `docs/deployment.md` and `context/deployment/deploy-plan.md` for completeness and accuracy against Cloudflare dashboard settings.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `src/__tests__/build-isolation.test.ts`:
  - Validates `tsconfig.build.json` exists, extends `./tsconfig.json`, and explicitly excludes test file globs.
  - Validates `next.config.ts` has `typescript.tsconfigPath` set to `tsconfig.build.json`.
  - Validates `next.config.ts` contains `outputFileTracingExcludes` covering test files and coverage directories.
  - Validates `public/.assetsignore` exists and contains globs for test files, coverage, and markdown.

### Integration Tests:

- `npm run build:worker`: Ensures OpenNext properly builds worker bundles and copies `.assetsignore` to `.open-next/assets/`.
- `npm run typecheck`: Validates full project type safety using root `tsconfig.json`.

### Manual Testing Steps:

1. Create a temporary syntax/type error inside a dummy test file in `src/__tests__/dummy.test.ts`.
2. Run `npm run build` and verify Next.js build succeeds without failing on the test file.
3. Run `npm run typecheck` and verify `tsc --noEmit` correctly catches the type error in the test file.
4. Remove the temporary test file.

## Performance Considerations

- Using `tsconfig.build.json` reduces Next.js build time by avoiding duplicate AST parsing and type checking for test suites during worker compilation.
- Cloudflare Build Watch Paths prevent unnecessary builds on Git pushes that only touch test files or documentation, preserving build minutes.

## Migration Notes

- Zero database or runtime state migration required.
- Additive configuration files (`tsconfig.build.json`, `public/.assetsignore`) are backward-compatible with existing developer workflows.

## References

- Research Document: `context/changes/exclude-tests-from-cloudflare-build/research.md`
- Next.js TypeScript Config: [`next.config.ts`](../../../next.config.ts)
- Root TypeScript Config: [`tsconfig.json`](../../../tsconfig.json)
- Vitest Test Config: [`vitest.config.ts`](../../../vitest.config.ts)
- OpenNext Deployment Plan: `context/deployment/deploy-plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: TypeScript Build Isolation

#### Automated

- [x] 1.1 Type checking passes with root tsconfig.json (`npm run typecheck`)
- [x] 1.2 Next.js build runs cleanly with tsconfig.build.json (`npm run build`)

#### Manual

- [ ] 1.3 IDE continues to provide autocomplete and error highlighting in test files and vitest.config.ts

### Phase 2: Static Assets Filtering & Wrangler Defense

#### Automated

- [x] 2.1 OpenNext build succeeds and generates assets directory (`npm run build:worker`)
- [x] 2.2 Verified .open-next/assets/.assetsignore exists after build

#### Manual

- [ ] 2.3 Inspect .open-next/assets/ directory to confirm only production static assets are present

### Phase 3: Automated Test Verification & Deployment Documentation

#### Automated

- [x] 3.1 Vitest tests pass with at least 80% coverage (`npm test`)
- [x] 3.2 TypeScript type checking passes (`npm run typecheck`)
- [x] 3.3 ESLint linting passes (`npm run lint`)

#### Manual

- [ ] 3.4 Review docs/deployment.md and context/deployment/deploy-plan.md for completeness
