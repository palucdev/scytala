---
change_id: exclude-tests-from-cloudflare-build
title: Exclude Test Files from Cloudflare Build and Deployment Process
status: impl_reviewed
created: 2026-08-28
updated: 2026-08-28
archived_at: null
---

## Notes

Research and solution matrix for isolating automated test files (`src/__tests__/**`, `*.test.ts(x)`, `vitest.config.ts`, coverage reports) so they remain active for local development and CI/CD pipelines, while remaining completely transparent and excluded from Cloudflare builds, bundling, asset uploads, and deployment triggers.
