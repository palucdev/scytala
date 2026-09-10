---
project: scytala
created_at: 2026-08-17
platform: Cloudflare Workers
adapter: "@opennextjs/cloudflare@^1.20.2"
framework: Next.js 16.3.1
status: ready-to-deploy
---

# Deployment Plan — Cloudflare Workers

Scytala deploys to Cloudflare Workers via `@opennextjs/cloudflare`. The adapter runs the
full Next.js Node.js server on V8 isolates using the `nodejs_compat` compatibility flag.
Static assets (fonts, SVGs, `_next/` bundles) are served globally via Cloudflare Workers
Static Assets.

## Architecture

```
Browser → Cloudflare Edge (global PoP)
           ├── Static Assets (ASSETS binding): /_next/*, *.svg, *.ico, fonts
           └── Worker (V8 isolate): SSR, API routes, Server Actions
                └── Supabase (REST/HTTP via @supabase/supabase-js) [future]
```

## Configuration Files

| File | Purpose |
|------|---------|
| `wrangler.jsonc` | Cloudflare Workers project config (name, compat flags, asset binding) |
| `open-next.config.ts` | OpenNext adapter config (`defineCloudflareConfig()`) |
| `next.config.ts` | Next.js config (`images: { unoptimized: true }`, `outputFileTracingExcludes`, `typescript.tsconfigPath`) |
| `tsconfig.build.json` | Dedicated Next.js build TypeScript config (excludes all test files) |
| `public/.assetsignore` | Wrangler static assets ignore rules (excludes test fixtures, coverage, maps, docs) |

## Build Isolation & Cloudflare Build Watch Paths

Scytala applies a 5-layer isolation strategy:
1. **Cloudflare Git Build Watch Paths**: `path_includes: "*"` with `path_excludes` configured for `src/__tests__/*`, `*.test.ts(x)`, `vitest.config.ts`, `coverage/*`, `docs/*`, `context/*`, `AGENTS.md`, `.github/*`, etc.
2. **TypeScript Build Isolation**: `next.config.ts` uses `tsconfig.build.json` to compile only production code during `next build`. Root `tsconfig.json` remains active for IDE intellisense and CI `npm run typecheck`.
3. **App Router Routing**: Specialized route file conventions ensure tests in `src/__tests__/` or co-located files never create URL endpoints.
4. **Node File Tracing (NFT)**: `outputFileTracingExcludes` prevents test/coverage files from entering `.nft.json` serverless manifests.
5. **Static Assets Filtering**: `public/.assetsignore` copied to `.open-next/assets/.assetsignore` prevents test artifacts from uploading to Cloudflare CDN.

## Scripts

```bash
npm run build          # Standard Next.js production build
npm run build:worker   # OpenNext Cloudflare build → .open-next/
npm run preview        # Build + local Cloudflare dev server (Miniflare)
npm run db:reset       # Reset and reseed local Supabase database
npm run deploy         # Build + deploy to Cloudflare Workers production
```

## Database Schema & Migrations

Database schema changes are managed via versioned migration files in `supabase/migrations/`.

- **Local Development**: Run `npm run db:reset` (`npx supabase db reset`) to recreate the local database and apply all migrations in order.
- **Production (GitHub Integration)**: Whenever a commit or pull request modifying `supabase/migrations/` is merged to `main`, the **Supabase GitHub Integration** automatically runs the new migrations against the remote production database.

## First Deploy (One-Time Setup)

1. **Authenticate with Cloudflare** (browser OAuth):
   ```bash
   npx wrangler login
   ```

2. **Deploy**:
   ```bash
   npm run deploy
   ```
   The first deploy creates the Worker and assigns a `*.workers.dev` subdomain.

3. **Set Supabase secrets in Cloudflare**:
   ```bash
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_KEY
   ```

## Operational Runbook

### Rollback
```bash
npx wrangler versions rollback
```
Instant atomic rollback to any previous deployment version (< 2s).

### Logs
```bash
npx wrangler tail
```
Real-time production log tailing.

### Preview deploys
```bash
npm run preview
```
Runs a local Cloudflare Workers dev server (Miniflare) at `http://localhost:8787`.

### Secrets management
```bash
npx wrangler secret put <KEY>     # Set a secret
npx wrangler secret list          # List secret names (not values)
npx wrangler secret delete <KEY>  # Remove a secret
```

## Constraints & Limitations

- **No native C++ addons** — Workers V8 isolates cannot run `sharp`, `better-sqlite3`, etc.
- **Image optimization disabled** — `images: { unoptimized: true }` in `next.config.ts`. Use Cloudflare Images binding if optimization is needed later.
- **No ISR/data cache persistence** — Workers are stateless. Add a KV namespace binding in `wrangler.jsonc` if ISR is needed.
- **3 MB compressed bundle limit** on free tier (currently 2.3 KB — no concern).
- **Supabase connections** — Always use `@supabase/supabase-js` (REST/HTTP), not direct PostgreSQL TCP connections, to avoid connection pool exhaustion from distributed isolates.

## Compatibility

| Component | Version | Notes |
|-----------|---------|-------|
| Next.js | 16.3.1 | Full support via @opennextjs/cloudflare |
| React | 19.2.8 | RSC + Server Actions work without modifications |
| @opennextjs/cloudflare | ^1.20.2 | Uses `defineCloudflareConfig()` API |
| wrangler | ^4 | CLI for deploy, secrets, logs, rollback |
| compatibility_date | 2026-08-28 | Aligned with wrangler.jsonc |
| compatibility_flags | nodejs_compat | Required for Node.js standard library support |
