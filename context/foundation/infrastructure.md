---
project: scytala
researched_at: 2026-08-15T16:22:00Z
recommended_platform: Cloudflare Workers (@opennextjs/cloudflare)
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Next.js 16 (React 19)
  runtime: Node.js / Cloudflare workerd V8 isolates (Supabase PostgreSQL backend)
---

## Recommendation

**Deploy on Cloudflare Workers (via `@opennextjs/cloudflare`).**

Cloudflare Workers provides a zero-maintenance, globally distributed serverless environment with an exceptionally generous free tier (100,000 requests/day at $0/month with no commercial usage restrictions). It scored a perfect 5/5 on agent-readiness criteria—featuring first-class CLI automation via Wrangler, public machine-readable `llms.txt` documentation, deterministic instant rollbacks, and a generally available official MCP server. For Scytala's lightweight MVP (under 5 concurrent users, low QPS, stateless request/response model with Supabase handling the data layer), Cloudflare aligns directly with developer familiarity while keeping operational overhead and hosting costs at zero.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Cloudflare Workers** | Pass | Pass | Pass | Pass | Pass | **5 / 5** |
| **Vercel** | Pass | Pass | Pass | Pass | Partial | **4.5 / 5** |
| **Railway** | Pass | Pass | Partial | Pass | Pass | **4 / 5** |
| **Netlify** | Partial | Pass | Pass | Pass | Pass | **4 / 5** |
| **Render** | Pass | Pass | Pass | Pass | Pass | **4 / 5** |
| **Fly.io** | Pass | Pass | Partial | Pass | Partial | **3.5 / 5** |

### Platform Scoring Notes

- **Cloudflare Workers (5/5)**: Full lifecycle CLI management via `wrangler`, zero server management, native markdown and `llms.txt` docs endpoints, instant atomic version rollbacks, and GA official MCP integration. Free tier supports 100k requests/day with commercial rights.
- **Vercel (4.5/5)**: The native home of Next.js with zero configuration overhead for App Router and React Server Components. Excellent CLI (`vercel --prod`) and `llms.txt` docs. MCP server is currently in public beta. Hobby tier is non-commercial only; Pro is $20/seat/mo.
- **Railway (4/5)**: Seamless full-stack container PaaS powered by Nixpacks. Excellent DX and official MCP server, but lacks an official root `llms.txt` index and base hosting starts at $5/month.
- **Netlify (4/5)**: Solid serverless platform with OpenNext v5 support and an official MCP server. Partial score on CLI maintenance due to lack of a direct CLI rollback command (requires Web UI or raw API invocation).
- **Render (4/5)**: Reliable managed web service supporting Node.js and Docker with an official MCP server and `llms.txt` docs. Free tier suffers from 30–60s cold starts after 15 minutes of inactivity; paid Starter begins at $7/month.
- **Fly.io (3.5/5)**: Container-based MicroVM platform with granular control and low base costs, but requires custom Dockerfile authoring and standalone Next.js bundling. Docs lack an official root `llms.txt` index and MCP integration is currently experimental.

---

### Shortlisted Platforms

#### 1. Cloudflare Workers (@opennextjs/cloudflare) (Recommended)
Cloudflare Workers is the top pick because it delivers a production-grade edge deployment with zero hosting cost ($0/month), supports full commercial deployment under the free tier, and provides the highest level of agent-friendly tooling (`wrangler` CLI, full Markdown docs, and official MCP server). Using `@opennextjs/cloudflare` with `nodejs_compat`, Next.js 16 App Router runs natively on V8 isolates.

#### 2. Vercel
Vercel is the runner-up and the official creator of Next.js. It requires zero adapter layers, offering out-of-the-box support for App Router and Server Actions with standard Node.js serverless functions. The gap versus Cloudflare is driven by Vercel's strict non-commercial Hobby licensing and the requirement for a $20/seat/month Pro plan for commercial deployments.

#### 3. Railway
Railway scored third as the premier container PaaS option. With zero runtime isolate constraints and automatic Nixpacks builds for Next.js, it offers an outstanding developer experience and simple co-located PostgreSQL provisioning. The gap vs. the recommendation is a minimum $5/month compute cost and lack of an official `llms.txt` index.

---

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses
1. **No Native C++ Binary Addons**: Cloudflare's V8 isolate environment (`workerd`) cannot run compiled Node.js C++ binary bindings (e.g. `sharp` for server-side image processing, `better-sqlite3`). Image optimization must use Cloudflare Images or Wasm alternatives.
2. **Adapter Abstraction Layer**: Next.js 16 is bridged to Cloudflare using `@opennextjs/cloudflare`. Minor Next.js updates can occasionally introduce experimental APIs that require an adapter update before deploying cleanly.
3. **Database Connection Lifecycle**: Direct TCP PostgreSQL connections from distributed serverless isolates can exhaust database connection pools unless routed through Supabase's Supavisor connection pooler (`port 6543`) or accessed via HTTP (`@supabase/supabase-js`).
4. **Isolate Cache Boundary**: Local disk caching for Incremental Static Regeneration (ISR) and data caching is ephemeral across isolates; cross-isolate caching requires binding Cloudflare KV or R2 in OpenNext.

### Pre-Mortem — How This Could Fail
> The team deployed Scytala to Cloudflare Workers using Next.js 16 and Supabase. Three weeks into development, an innocent package addition that pulled in a native Node.js binary caused `@opennextjs/cloudflare` builds to fail due to missing V8 isolate runtime bindings. Concurrently, during a multi-user note synchronization test, direct database queries from edge workers exhausted Supabase's connection limits because requests bypassed the Supavisor pooler. The developer lost valuable iteration time debugging subtle isolate runtime differences instead of shipping product features.

### Unknown Unknowns
- **Adapter Migration**: `@cloudflare/next-on-pages` is deprecated. All modern Next.js 15/16 deployments must use `@opennextjs/cloudflare`.
- **Node Built-in Polyfills**: Standard Node globals (`Buffer`, `process`, `crypto`, `AsyncLocalStorage`) require `"compatibility_flags": ["nodejs_compat"]` in `wrangler.jsonc`.
- **Script Size Quota**: Workers Free tier enforces a 3 MB compressed / 10 MB uncompressed script size ceiling; dependencies must be cleanly tree-shaken.

---

## Operational Story

- **Preview deploys**: Every PR or feature branch deploy creates an isolated preview URL via `npx wrangler deploy --dry-run` or Cloudflare Pages/Workers preview environments with unique deterministic URLs.
- **Secrets**: Environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are encrypted in Cloudflare via `npx wrangler secret put <KEY>` or configured in the Cloudflare dashboard.
- **Rollback**: Instant atomic rollback to any previous deployment version using `npx wrangler rollback [version-id]` or `npx wrangler versions rollback` (< 2 seconds reversion time).
- **Approval**: Production deployments (`wrangler deploy --env production`) and secret modifications require human review; non-production preview deployments and test runs can be executed unattended by AI agents.
- **Logs**: Real-time production log tailing and error inspection via `npx wrangler tail` or `@cloudflare/mcp-server-cloudflare` read-only logging tools.

---

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
| :--- | :--- | :---: | :---: | :--- |
| **Native Node addon incompatibility (`sharp`, C++ bindings)** | Devil's advocate | Medium | High | Avoid native C++ dependencies; use `@supabase/supabase-js` (pure JS/fetch) and Wasm packages if image transformation is needed. |
| **Database connection pool exhaustion** | Pre-mortem | Medium | High | Always connect to Supabase using `@supabase/supabase-js` (REST/HTTP) or route PostgreSQL connection strings through Supavisor Transaction Pooler (`port 6543`). |
| **Adapter desynchronization on Next.js upgrades** | Devil's advocate | Low | Medium | Pin `@opennextjs/cloudflare` and `next` versions together; test builds locally using `npx @opennextjs/cloudflare build` before upgrading. |
| **Worker bundle size exceeding 3 MB free limit** | Unknown unknowns | Low | Medium | Keep dependencies lean; rely on Supabase client and Web standard APIs rather than heavy server libraries. |
| **Missing Node.js polyfills at runtime** | Unknown unknowns | Low | High | Ensure `"compatibility_flags": ["nodejs_compat"]` and recent `"compatibility_date"` are configured in `wrangler.jsonc`. |

---

## Getting Started

1. **Install Cloudflare Wrangler CLI and OpenNext Adapter**:
   ```bash
   npm install --save-dev wrangler @opennextjs/cloudflare
   ```

2. **Initialize Cloudflare Configuration (`wrangler.jsonc`)**:
   Create `wrangler.jsonc` in the project root with the `nodejs_compat` flag:
   ```json
   {
     "name": "scytala",
     "main": ".open-next/worker.js",
     "compatibility_date": "2024-09-23",
     "compatibility_flags": ["nodejs_compat"],
     "assets": {
       "directory": ".open-next/assets",
       "binding": "ASSETS"
     }
   }
   ```

3. **Configure Build Scripts in `package.json`**:
   Add deployment scripts targeting OpenNext:
   ```json
   "scripts": {
     "build:worker": "opennextjs-cloudflare build",
     "deploy": "opennextjs-cloudflare build && wrangler deploy",
     "preview": "opennextjs-cloudflare build && wrangler dev"
   }
   ```

4. **Set Supabase Secrets in Cloudflare**:
   ```bash
   npx wrangler secret put NEXT_PUBLIC_SUPABASE_URL
   npx wrangler secret put NEXT_PUBLIC_SUPABASE_ANON_KEY
   ```

5. **Deploy to Cloudflare Workers**:
   ```bash
   npm run deploy
   ```

---

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration & multi-stage container builds
- Full CI/CD pipeline automation (e.g. GitHub Actions workflows)
- Production-scale enterprise architecture (multi-region failover, 99.99% SLA clustering, dedicated VPC peering)
