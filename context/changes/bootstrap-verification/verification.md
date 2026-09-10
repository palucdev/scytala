---
bootstrapped_at: 2026-08-15T15:55:46Z
starter_id: next
starter_name: Next.js
project_name: scytala
language_family: js
package_manager: npm
cwd_strategy: subdir-then-move
bootstrapper_confidence: verified
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: next
package_manager: npm
project_name: scytala
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: cloudflare-builds
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: verified
  path_taken: custom
  quality_override: false
  self_check_answers:
    typed: true
    from_official_starter: true
    conventions: true
    docs_current: true
    can_judge_agent: true
  has_auth: false
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

Solo developer shipping a self-hosted collaborative notes dashboard (Scytala) in 3 weeks of after-hours work. Next.js is the most mainstream full-stack React meta-framework in the JS ecosystem, passing all four agent-friendly gates with verified bootstrapper confidence — scaffolding will be smooth. TypeScript-first preference, PostgreSQL via Supabase (added post-scaffold), and Cloudflare Pages deployment align with the project's simple auth model and self-hosting goal. The custom path was taken because the developer wanted to evaluate alternatives explicitly; Next.js won on mainstream community depth, verified scaffolding, and flexibility to layer Supabase + Tailwind on a clean base rather than inheriting an opinionated all-in-one starter.

## Pre-scaffold verification

| Signal             | Value                                        | Severity | Notes                              |
| ------------------ | -------------------------------------------- | -------- | ---------------------------------- |
| npm package        | create-next-app v16.3.1 published 2026-08-14 | fresh    | resolved from cmd_template         |
| GitHub repo        | vercel/next.js last pushed 2026-08-15        | fresh    | from card.docs_url                 |

## Scaffold log

**Resolved invocation**: `npx -y create-next-app@latest bootstrap-scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm`
**Strategy**: subdir-then-move
**Exit code**: 0
**Files moved**: 15 (AGENTS.md, CLAUDE.md, eslint.config.mjs, next-env.d.ts, next.config.ts, node_modules, package-lock.json, package.json, postcss.config.mjs, public, src, tsconfig.json, .next, README.md.scaffold, .gitignore)
**Conflicts (.scaffold siblings)**: README.md.scaffold
**.gitignore handling**: append-merged (Next.js ignore patterns de-duplicated and appended with `# from next` separator)
**bootstrap-scaffold cleanup**: deleted

Note: `{name}` substituted as `bootstrap-scaffold` (without leading dot) because npm naming restrictions reject names starting with a period. Functionally equivalent to the standard `.bootstrap-scaffold` approach — scaffolded into a temp subdirectory, conflict matrix applied, temp directory removed.

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW
**Direct vs transitive**: 17 prod / 384 dev / 88 optional dependencies audited. 0 findings across all categories. Clean tree.

## Hints recorded but not acted on

| Hint                       | Value                              |
| -------------------------- | ---------------------------------- |
| bootstrapper_confidence    | verified                           |
| quality_override           | false                              |
| path_taken                 | custom                             |
| self_check_answers         | typed: true, from_official_starter: true, conventions: true, docs_current: true, can_judge_agent: true |
| team_size                  | solo                               |
| deployment_target          | cloudflare-pages                   |
| ci_provider                | cloudflare-builds                  |
| ci_default_flow            | auto-deploy-on-merge               |
| has_auth                   | false                              |
| has_payments               | false                              |
| has_realtime               | false                              |
| has_ai                     | false                              |
| has_background_jobs        | false                              |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
