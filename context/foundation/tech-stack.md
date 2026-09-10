---
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
---

## Why this stack

Solo developer shipping a self-hosted collaborative notes dashboard (Scytala) in 3 weeks of after-hours work. Next.js is the most mainstream full-stack React meta-framework in the JS ecosystem, passing all four agent-friendly gates with verified bootstrapper confidence — scaffolding will be smooth. TypeScript-first preference, PostgreSQL via Supabase (added post-scaffold), and Cloudflare Pages deployment align with the project's simple auth model and self-hosting goal. The custom path was taken because the developer wanted to evaluate alternatives explicitly; Next.js won on mainstream community depth, verified scaffolding, and flexibility to layer Supabase + Tailwind on a clean base rather than inheriting an opinionated all-in-one starter.
