# Deployment & Build Isolation Architecture

This document describes Scytala's deployment pipeline to Cloudflare Workers via OpenNext (`@opennextjs/cloudflare` + `wrangler`), including the 5-layer build isolation strategy that separates automated tests, mocks, and local development artifacts from production builds and edge assets.

---

## 1. Overview & Architecture

Scytala is built on Next.js 16 (App Router) and deployed to Cloudflare Workers using OpenNext.

```
Browser / Client
      │
      ▼
Cloudflare Global Edge Network
      ├── Static Assets (ASSETS binding): /_next/*, *.svg, *.ico, fonts
      └── Worker (V8 isolate): SSR, API routes (/api/*), Server Actions
           └── Supabase (REST / PostgREST via @supabase/supabase-js)
```

---

## 2. 5-Layer Build & Test Isolation Strategy

To ensure that automated tests are strictly enforced during local development and CI/CD while remaining 100% transparent and non-interfering for production Cloudflare builds, isolation is implemented across 5 distinct architectural layers:

| Layer | Target Area | Mechanism | Production Impact | Dev & CI Impact |
| :--- | :--- | :--- | :--- | :--- |
| **1. Trigger Layer** | Cloudflare Git Integration | **Build Watch Paths** (`path_excludes`) | Skips Cloudflare builds entirely when only test/doc files change | Zero impact; CI runs full test & coverage suite on every commit/PR |
| **2. TypeScript Compilation** | Next.js Build (`next build`) | `typescript.tsconfigPath` $\rightarrow$ `tsconfig.build.json` | Next.js compiles and type-checks only production application code | IDE uses root `tsconfig.json` for full IntelliSense; CI runs `npm run typecheck` |
| **3. Routing & Bundling** | App Router & Webpack/Turbopack | Next.js App Router conventions | Route discovery ignores test files; tree-shaking drops test dependencies | Test files can be co-located or placed in `src/__tests__/` without bundle leakage |
| **4. Node File Tracing (NFT)** | Serverless Packaging (`@vercel/nft`) | `outputFileTracingExcludes` in `next.config.ts` | Test directories and coverage output are excluded from server bundles (`.nft.json`) | Tests and coverage reports remain accessible in local environment and CI artifacts |
| **5. Static Assets Upload** | Cloudflare Assets (`wrangler deploy`) | `public/.assetsignore` copied to `.open-next/assets/` | Test fixtures, docs, sourcemaps, and coverage are ignored by Wrangler static asset upload | Static edge CDN contains only production client assets and media |

---

## 3. Cloudflare Git Integration & Build Watch Paths

When connecting the GitHub repository to Cloudflare Workers & Pages Builds, configure **Build watch paths** to suppress redundant builds when non-application code is modified.

### Dashboard Configuration

Navigate to **Workers & Pages > scytala > Settings > Build > Build watch paths**:

| Setting | Value | Description |
| :--- | :--- | :--- |
| **Include paths (`path_includes`)** | `*` | Matches all repository files by default |
| **Exclude paths (`path_excludes`)** | *(See list below)* | Suppresses build if changes are restricted to excluded paths |

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

> **Note**: If a commit touches both application source code (e.g. `src/app/page.tsx`) and a test file (e.g. `src/__tests__/app/page.test.tsx`), Cloudflare will proceed with the build because at least one changed file is outside `path_excludes`.

---

## 4. CI/CD Separation of Responsibilities

Responsibilities are strictly separated between GitHub Actions (Quality Gate) and Cloudflare Workers (Deployment):

```
                     ┌─────────────────────────────────────────┐
                     │              Git Push / PR              │
                     └────────────────────┬────────────────────┘
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  ▼                                               ▼
    ┌───────────────────────────┐                   ┌───────────────────────────┐
    │    GitHub Actions (CI)    │                   │  Cloudflare Builds (CD)   │
    ├───────────────────────────┤                   ├───────────────────────────┤
    │ 1. npm ci                 │                   │ 1. Evaluate Watch Paths   │
    │ 2. npm run typecheck      │                   │    • Exclude test/docs    │
    │ 3. npm run lint           │                   │    • If ONLY tests/docs:  │
    │ 4. npm test (Vitest)      │                   │      ⏩ SKIP BUILD        │
    │    • 80% line threshold   │                   │ 2. If app code changed:   │
    │    • 80% branch threshold │                   │    • tsconfig.build.json  │
    │ 5. Upload coverage report │                   │    • OpenNext packaging   │
    │ 6. Block merge if failed  │                   │    • Deploy Worker+Assets │
    └───────────────────────────┘                   └───────────────────────────┘
```

| Check / Action | Local Dev | GitHub Actions CI (`test.yml`) | Cloudflare Deploy |
| :--- | :---: | :---: | :---: |
| **TypeScript Typecheck (`tsc --noEmit`)** | ✅ Real-time IDE | ✅ Strict blocking step | ⏩ Production code only (`tsconfig.build.json`) |
| **Vitest Tests & Coverage ($\ge 80\%$)** | ✅ Fast (`npm test`) | ✅ Strict blocking step | ❌ Completely omitted |
| **ESLint Linting (`eslint`)** | ✅ Real-time IDE | ✅ Strict blocking step | ⏩ Local & CI gate |
| **Worker Compilation (`build:worker`)** | ⏩ On demand (`preview`) | ❌ | ✅ Primary build task |
| **Asset & Worker Deploy (`deploy`)** | ❌ | ❌ | ✅ Primary release task |

---

## 5. Deployment Commands & Workflow

### Local Development & Preview

```bash
# Run Next.js local development server (Turbopack)
npm run dev

# Run full Vitest test suite with 80% coverage check
npm test

# Run TypeScript type check across all source and test files
npm run typecheck

# Run OpenNext build and launch local Cloudflare Worker environment (Miniflare)
npm run preview
```

### Production Deployment

```bash
# Build worker bundle and deploy to Cloudflare Workers
npm run deploy
```

### Rollback Runbook

```bash
# Instant atomic rollback to previous Cloudflare deployment version (< 2s)
npx wrangler versions rollback
```
