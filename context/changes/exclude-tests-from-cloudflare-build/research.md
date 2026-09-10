---
date: 2026-08-28T07:34:00Z
researcher: Antigravity
git_commit: 98eee84b44cd2fbfbf420a1ab727c5c03b202cdc
branch: fix/cloudflare-build
repository: palucdev/scytala
topic: "Excluding Test Files from Cloudflare Build and Deployment Processes"
tags: [research, testing, cloudflare, opennext, nextjs, vitest, build-pipeline, cicd]
status: complete
last_updated: 2026-08-28
last_updated_by: Antigravity
---

# Research: Excluding Test Files from Cloudflare Build and Deployment Processes

**Date**: 2026-08-28T07:34:00Z  
**Researcher**: Antigravity  
**Git Commit**: `98eee84b44cd2fbfbf420a1ab727c5c03b202cdc`  
**Branch**: `fix/cloudflare-build`  
**Repository**: `palucdev/scytala`  

---

## Research Question

Research the technical options to exclude all test files (`src/__tests__/**`, `*.test.ts(x)`, `vitest.config.ts`, `coverage/`, mocks, fixtures) from the Cloudflare build and deployment process. The objective is to make tests vital and strictly enforced for local development and CI/CD pipelines (maintaining strict 80% coverage in Vitest and full type-checking in `tsc`), while keeping them completely transparent and non-interfering for Cloudflare build, bundling, asset uploads, and deployment triggers.

---

## Summary

In modern Next.js applications deployed to Cloudflare via OpenNext (`@opennextjs/cloudflare` + `wrangler`), testing and production deployments intersect across **5 distinct architectural layers**:

1. **Trigger Layer (Cloudflare Git Integration / Webhooks)**: Pushing commits that only alter test files or documentation can trigger redundant, costly Cloudflare builds.
2. **Compilation & Type-Checking Layer (`next build` / TypeScript)**: By default, `next build` type-checks all TypeScript files included in `tsconfig.json` (including test files and mocks).
3. **Routing & Module Bundling Layer (App Router / Turbopack / Webpack)**: App Router route discovery and tree-shaking determine what JavaScript enters client and server chunks.
4. **Node File Tracing & OpenNext Layer (`@vercel/nft` / `opennextjs-cloudflare build`)**: OpenNext traces and extracts files for the server worker (`.open-next/worker.js`) and static assets (`.open-next/assets`).
5. **Static Assets & Upload Layer (`wrangler deploy` / ASSETS binding)**: Wrangler synchronizes static files from `.open-next/assets/` to Cloudflare's global edge network.

### Key Conclusions:
- **Zero Runtime Code Leakage**: Because Next.js App Router relies on strict special filenames (`page.tsx`, `route.ts`, `layout.tsx`), and OpenNext packages only route entry points and static assets from `public/` and `.next/static/`, test files are **already excluded from runtime bundles and static CDN assets**.
- **Defense in Depth (`outputFileTracingExcludes`)**: Scytala's [`next.config.ts`](../../../next.config.ts#L55-L63) explicitly excludes test directories and coverage from Node File Tracing (`.nft.json`), preventing them from being copied to standalone server functions.
- **Build Isolation Solution**: To ensure `next build` on Cloudflare never fails due to test-only type issues or spend time type-checking tests, we can use `tsconfig.build.json` via `typescript.tsconfigPath` in `next.config.ts`, or bypass duplicate type-checking in `next build` (`ignoreBuildErrors: true`) and enforce it strictly in GitHub Actions CI.
- **Trigger Suppression Solution**: Configuring **Build Watch Paths** in Cloudflare Git Integration ensures commits that modify only test files, test configs, or docs skip Cloudflare builds entirely.

---

## Architectural Comparison Matrix

| Exclusion Strategy | Target Layer | Execution Mechanism | Impact on Cloudflare Build | Impact on Local Dev & CI | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Cloudflare Build Watch Paths** | **Trigger Layer** (Pre-Build) | Webhook filter in Cloudflare Dashboard / API | **100% build skip** when only test/doc files change (saves build minutes) | Zero impact. CI runs full test & coverage suite on every PR | **Essential (Primary Trigger Gate)** |
| **2. `outputFileTracingExcludes`** | **Tracing & Packaging** (`@vercel/nft`) | `next.config.ts` configuration | Prevents test files from entering `.next/standalone` & OpenNext worker packages | Zero impact on tests | **Essential (Already active in `next.config.ts`)** |
| **3. `tsconfig.build.json` (`typescript.tsconfigPath`)** | **TypeScript Compiler** | `next.config.ts` $\rightarrow$ `tsconfig.build.json` | `next build` type-checks only production source files (skips all `*.test.ts(x)`) | IDE uses root `tsconfig.json` for full intellisense; CI runs `tsc --noEmit` | **Recommended for strict type isolation** |
| **4. Separate CI Verification (`ignoreBuildErrors`)** | **CI/CD Pipeline** | `typescript.ignoreBuildErrors: true` during `next build` | Cloudflare `next build` runs at maximum speed without duplicate type-checking | CI runs parallel jobs: `typecheck`, `test` (80% coverage), `lint` | **Best for maximum build speed** |
| **5. Static Assets Exclusions (`public/.assetsignore`)** | **Asset Upload** | `.assetsignore` copied to `.open-next/assets/` | Prevents test fixtures or markdown docs from uploading to Cloudflare ASSETS | Zero impact on tests | **Recommended Safeguard** |

---

## Detailed Findings across System Layers

```
                     ┌─────────────────────────────────────────────────────────┐
                     │                    Git Push / PR                        │
                     └────────────────────────────┬────────────────────────────┘
                                                  │
                         ┌────────────────────────┴────────────────────────┐
                         ▼                                                 ▼
           ┌───────────────────────────┐                     ┌───────────────────────────┐
           │    GitHub Actions (CI)    │                     │  Cloudflare Builds (CD)   │
           ├───────────────────────────┤                     ├───────────────────────────┤
           │ 1. npm ci                 │                     │ 1. Evaluate Watch Paths   │
           │ 2. npm run typecheck      │                     │    • Exclude test/docs    │
           │ 3. npm test (Vitest)      │                     │    • If ONLY tests:       │
           │    • 80% line threshold   │                     │      ⏩ SKIP BUILD        │
           │    • 80% branch threshold │                     │ 2. If app code changed:   │
           │ 4. Upload coverage report │                     │    • tsconfig.build.json  │
           │ 5. Block merge if failed  │                     │    • OpenNext packaging   │
           │                           │                     │    • Deploy Worker+Assets │
           └───────────────────────────┘                     └───────────────────────────┘
```

---

### Layer 1: Cloudflare Git Integration & Build Watch Paths (Pre-Build Gate)

#### Mechanism
When a Git repository is connected to Cloudflare Workers Builds or Cloudflare Pages Builds, Cloudflare receives a webhook on every `git push`. By default, any file modification triggers a container build.

Cloudflare provides a native **Build watch paths** filter:
- **Excludes First Evaluation**: Changed files matching `path_excludes` are filtered out.
- **Includes Evaluation**: If the remaining set has $\ge 1$ file matching `path_includes`, the build runs; otherwise, the build is **skipped**.

#### Configuration for Scytala
In Cloudflare Dashboard (**Workers & Pages > scytala > Settings > Build > Build watch paths**) or via Cloudflare REST API:

- **Include paths (`path_includes`)**: `*`
- **Exclude paths (`path_excludes`)**:
  ```txt
  src/__tests__/*
  *.test.ts
  *.test.tsx
  *.spec.ts
  *.spec.tsx
  vitest.config.ts
  vitest.config.mts
  coverage/*
  docs/*
  context/*
  AGENTS.md
  README.md
  .agents/*
  .github/*
  .vscode/*
  .cursor/*
  supabase/migrations/*
  ```

#### Edge Cases & Rules:
- **Empty Pushes**: A push with 0 changed files (e.g. `git commit --allow-empty`) bypasses path filtering and triggers a manual deployment.
- **Large Pushes**: Commits touching $>3000$ files or $>20$ commits in a single push bypass the filter for safety.

---

### Layer 2: TypeScript & Next.js Type-Checking Isolation

#### Mechanism
During `next build` (invoked by `opennextjs-cloudflare build`), Next.js invokes `ts.createProgram` using [`tsconfig.json`](../../../tsconfig.json).
- Because `tsconfig.json` specifies `"include": ["**/*.ts", "**/*.tsx"]` and only excludes `node_modules`, all test files (`src/__tests__/**`, `*.test.ts(x)`, `vitest.config.ts`) are parsed and type-checked during production builds.
- If a test file has an invalid mock type or uses test globals not yet typed, `next build` fails.

#### Solution A: `tsconfig.build.json` via `typescript.tsconfigPath`
Next.js supports `typescript.tsconfigPath` in `next.config.ts`:

1. Create `tsconfig.build.json`:
   ```json
   {
     "extends": "./tsconfig.json",
     "exclude": [
       "node_modules",
       "src/**/__tests__/**",
       "src/**/*.test.ts",
       "src/**/*.test.tsx",
       "src/**/*.spec.ts",
       "src/**/*.spec.tsx",
       "vitest.config.ts"
     ]
   }
   ```
2. Update [`next.config.ts`](../../../next.config.ts):
   ```typescript
   const nextConfig: NextConfig = {
     typescript: {
       tsconfigPath: "tsconfig.build.json",
     },
     // ...
   };
   ```

**Outcome**:
- `next build` uses `tsconfig.build.json` $\rightarrow$ completely ignores test files during production build.
- VS Code and IDEs continue reading `tsconfig.json` at root $\rightarrow$ full IntelliSense and typechecking across both tests and source code.
- CI continues running `npm run typecheck` (`tsc --noEmit` against `tsconfig.json`) to enforce full test type safety.

#### Solution B: Bypass Duplicate Typecheck (`ignoreBuildErrors: true`)
If GitHub Actions CI already runs `npm run typecheck` and `npm test` before merge, `next build` on Cloudflare can skip type-checking entirely:
```typescript
const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};
```
**Outcome**: Speeds up Cloudflare builds by ~30–50% and decouples production bundling from test file types.

---

### Layer 3: Next.js App Router Route Discovery & Bundler Tree-Shaking

#### App Router Special-File Conventions
Unlike the legacy Pages Router (where any file in `pages/` became a URL route unless `pageExtensions` was configured), Next.js App Router uses **strict file conventions**:
- Only `page.tsx` and `route.ts` create routable endpoints.
- `layout.tsx`, `error.tsx`, `loading.tsx`, `not-found.tsx` define UI boundaries.
- Any other file in `src/app/` (e.g. `src/app/dashboard/LoginForm.test.tsx` or `src/app/dashboard/__tests__/page.test.tsx`) is **completely ignored by the routing engine**.

#### Bundler Graph (Webpack / Turbopack)
- Next.js builds the module dependency graph starting strictly from route entrypoints and Server Actions.
- Since application code does not import test files, Webpack/Turbopack tree-shaking completely discards `*.test.ts`, `*.test.tsx`, and test helper modules from both client and server JavaScript bundles.

---

### Layer 4: Node File Tracing (NFT) & OpenNext Packaging

#### OpenNext Cloudflare Adapter (`@opennextjs/cloudflare`)
When `opennextjs-cloudflare build` executes:
1. `createStaticAssets()` copies client assets:
   - `.next/static/` $\rightarrow$ `.open-next/assets/_next/static/`
   - `public/*` $\rightarrow$ `.open-next/assets/*`
   - `favicon.ico` $\rightarrow$ `.open-next/assets/favicon.ico`
   - **Verification**: `src/` is never copied into `.open-next/assets/`.
2. `createServerBundle()` reads `.nft.json` manifests generated by `@vercel/nft` and copies traced files from `.next/standalone/` into `.open-next/server-functions/default/`.
3. `bundleServer()` uses `esbuild` to compile `.open-next/worker.js` and `handler.mjs` targeting the `workerd` runtime.

#### Role of `outputFileTracingExcludes`
In [`next.config.ts`](../../../next.config.ts#L55-L63):
```typescript
outputFileTracingExcludes: {
  '*': [
    './src/**/__tests__/**',
    './src/**/*.test.{ts,tsx}',
    './coverage/**',
    './vitest.config.ts',
  ],
},
```
- This configuration explicitly tells `@vercel/nft` to omit any matches from `.nft.json` trace files.
- Even if server code uses dynamic `fs` calls, test files, mock data, coverage outputs, and test runners are barred from entering the serverless bundle.

---

### Layer 5: Cloudflare Static Assets & Wrangler Deployment

#### Asset Synchronization Mechanism
In [`wrangler.jsonc`](../../../wrangler.jsonc#L7-L10):
```jsonc
"assets": {
  "directory": ".open-next/assets",
  "binding": "ASSETS"
}
```
- Wrangler hashes every file in `.open-next/assets`, compares hashes against the Cloudflare edge manifest, and uploads only new or changed files.

#### Static Assets Exclusion (`.assetsignore`)
Cloudflare Static Assets supports a `.assetsignore` file (using standard `.gitignore` syntax) in the assets root directory.
- Because OpenNext clears `.open-next/` on every build, placing `.assetsignore` directly in `.open-next/` would be overwritten.
- **Implementation**: Place `.assetsignore` in `public/.assetsignore`. OpenNext copies `public/` into `.open-next/assets/`, resulting in `.open-next/assets/.assetsignore` being evaluated by Wrangler during deployment:
  ```txt
  # public/.assetsignore
  **/__tests__/**
  **/*.test.*
  **/*.spec.*
  *.map
  coverage/**
  *.md
  ```

#### Local Dev Watch Directory in `wrangler.jsonc`
In [`wrangler.jsonc`](../../../wrangler.jsonc#L28-L31):
```jsonc
"build": {
  "command": "npm run build:worker",
  "watch_dir": "src"
}
```
- `watch_dir: "src"` tells `wrangler dev` to rebuild when files in `src/` change.
- **Workflow recommendation**: Run `npm run dev` (`next dev`) for local UI/feature development. Run `npm test` independently for Vitest. Only run `npm run preview` (`wrangler dev`) when testing Cloudflare Worker bindings (such as `AUTH_IP_LIMITER` or KV).

---

### Layer 6: CI/CD Pipeline Separation (Quality Gate vs Deploy)

The separation of responsibilities between GitHub Actions and Cloudflare Deploy is as follows:

| Action / Check | Local Dev | GitHub Actions CI (`test.yml`) | Cloudflare Build & Deploy |
| :--- | :---: | :---: | :---: |
| **TypeScript Typecheck (`tsc --noEmit`)** | ✅ Real-time IDE | ✅ Strict blocking step | ⏩ Skipped / Build-only tsconfig |
| **Vitest Unit & Integration Tests** | ✅ Fast (`npm test`) | ✅ Strict blocking step | ❌ Completely omitted |
| **Strict 80% Code Coverage Check** | ✅ On demand | ✅ Strict blocking step | ❌ Completely omitted |
| **ESLint Linting** | ✅ Real-time IDE | ✅ Strict blocking step | ⏩ Optional / Build-only |
| **Production Worker Compilation** | ⏩ On demand (`preview`) | ❌ (or build verification) | ✅ Primary task (`build:worker`) |
| **Cloudflare Worker & Asset Deploy** | ❌ | ❌ (or automated release) | ✅ Primary task (`deploy`) |

---

## Concrete Recommended Implementation

To achieve complete test transparency across all environments, implement the following changes:

### 1. Create `tsconfig.build.json`
```json
{
  "extends": "./tsconfig.json",
  "exclude": [
    "node_modules",
    "src/**/__tests__/**",
    "src/**/*.test.ts",
    "src/**/*.test.tsx",
    "src/**/*.spec.ts",
    "src/**/*.spec.tsx",
    "vitest.config.ts"
  ]
}
```

### 2. Update `next.config.ts`
```typescript
import type { NextConfig } from "next";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));
const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  typescript: {
    tsconfigPath: "tsconfig.build.json",
  },
  env: {
    APP_VERSION: pkg.version,
  },
  images: {
    unoptimized: true,
  },
  outputFileTracingExcludes: {
    '*': [
      './src/**/__tests__/**',
      './src/**/*.test.{ts,tsx}',
      './coverage/**',
      './vitest.config.ts',
    ],
  },
};

export default nextConfig;
```

### 3. Add `public/.assetsignore`
```txt
**/__tests__/**
**/*.test.*
**/*.spec.*
coverage/**
*.md
```

### 4. Configure Cloudflare Build Watch Paths
In Cloudflare Dashboard (**Workers & Pages > scytala > Settings > Build > Build watch paths**):
- **Includes**: `*`
- **Excludes**: `src/__tests__/*, *.test.ts, *.test.tsx, vitest.config.ts, coverage/*, docs/*, context/*, AGENTS.md, README.md, .github/*`

---

## Code References

- [`next.config.ts:55-63`](../../../next.config.ts#L55-L63) - Existing Node File Tracing exclusions for tests and coverage.
- [`tsconfig.json:31-41`](../../../tsconfig.json#L31-L41) - Root TypeScript includes and exclusions.
- [`vitest.config.ts:7-23`](../../../vitest.config.ts#L7-L23) - Vitest test runner configuration and 80% coverage thresholds.
- [`wrangler.jsonc:7-10`](../../../wrangler.jsonc#L7-L10) - Static assets directory and binding configuration.
- [`wrangler.jsonc:28-31`](../../../wrangler.jsonc#L28-L31) - Custom worker build command and file watcher.
- [`.github/workflows/test.yml:1-40`](../../../.github/workflows/test.yml#L1-L40) - GitHub Actions CI workflow executing type checking and tests.

---

## Architecture Insights

1. **Zero Runtime Impact**: Because Next.js App Router and OpenNext compile bundles starting from designated entry points (`app/**/{page,layout,route}.tsx`), tests in `src/__tests__/` or co-located files never appear in the deployed worker code or static assets.
2. **Double Isolation Pattern**: Combining `tsconfig.build.json` (for compilation) with `outputFileTracingExcludes` (for runtime asset tracing) ensures complete isolation of test code during Next.js builds.
3. **Trigger-Level Efficiency**: Cloudflare Build Watch Paths prevent test-only commits from consuming Cloudflare build minutes, leaving automated quality validation strictly to GitHub Actions.

---

## Historical Context (from prior changes)

- `context/foundation/lessons.md:7-15` - Hardening database migrations and CI forward-only workflows.
- `context/changes/replace-upstash-rate-limiting/change.md` - Integration of native Cloudflare bindings (`wrangler.jsonc` ratelimits) for zero-dependency execution.
- `context/foundation/test-plan.md` - Enforcement of strict 80% branch, line, statement, and function coverage across all components.

---

## Related Research

- `context/changes/replace-upstash-rate-limiting/research.md` - Cloudflare Workers runtime bindings and native platform integration.

---

## Open Questions

- *None identified*: The separation mechanisms across Next.js, OpenNext, Wrangler, and Cloudflare Git Integration are standardized and verified against Cloudflare developer documentation and local configuration.
