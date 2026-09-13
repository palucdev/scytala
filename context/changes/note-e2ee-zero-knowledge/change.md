---
change_id: note-e2ee-zero-knowledge
title: Zero-knowledge note encryption (client-side E2EE, Tuta-style)
status: planned
created: 2026-09-13
updated: 2026-09-13
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame. -->

- Supersedes `note-encryption` (S-07, v1 server-key AES-256-GCM envelopes, `impl_reviewed` 2026-09-13). No data migration: local and prod DBs are reset — legacy v1 envelopes are not read in the new path.
- Design settled interactively 2026-09-13: Tuta-inspired key hierarchy (per-dashboard DEK wrapped per member under a passphrase-derived KEK), client-side auth verifier (password never crosses the wire), vault bundle returned in the login action response, inline wrong-passphrase retry without a server call, passive "vault locked" banner + 30-minute idle auto-lock, client-side unwrap check for note deletion, unit-crypto + adapted suites + Playwright testing depth.
- Shared-dashboard constraint discovered during research: dashboards are collaborative (all members read all notes), so the DEK is per-**dashboard**, wrapped once per **participant** — the per-user-DEK idea from early research was corrected during planning.
- PRD + roadmap updated as part of this planning session (see plan-brief' Key Decisions).
