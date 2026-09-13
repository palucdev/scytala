---
project: "Scytala"
version: 2
status: draft
created: 2026-07-29
updated: 2026-09-13
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-09-09
  after_hours_only: true
---

## Vision & Problem Statement

People who need to share private content with chosen people — teams, families, friend groups — are stuck between chat apps (where content gets buried and is unsearchable) and cloud platforms (where privacy is surrendered to 3rd parties). Existing self-hosted tools (wikis, file managers) are complex to set up and designed for persistent knowledge bases, not for lightweight, shared content dashboards.

Scytala's insight is twofold: (1) shared private content belongs on a **structured dashboard** — browseable and searchable — not in a chat stream, and (2) **self-hosting** is the only hosting model that genuinely solves the privacy problem, but it must be simple enough for non-technical users to deploy.

## User & Persona

### Primary persona

**Role:** An individual who coordinates content sharing in small groups — could be a team lead, a family organizer, a friend group coordinator.

**Context:** They need to share a collection of notes (and eventually files/media) with specific people, and want the content to be organized, findable, and private.

**Moment:** They reach for Scytala when they want to create a shared space for a specific group, where content stays organized instead of scrolling away in chat.

## Success Criteria

### Primary

- A user can create a dashboard, set credentials for other users, share the link, and those users can log in, view the dashboard, and create/edit notes.

### Secondary

- Multiple users editing notes on the same dashboard see each other's changes after syncing.

### Guardrails

- Note content must not be accessible without valid credentials — **and** the instance operator (an admin with production DB access and knowledge of any server secret) must be unable to read note titles or contents; zero-knowledge client-side end-to-end encryption, inspired by Tuta's architecture.
- Dashboard must remain usable with at least 5 concurrent users.
- Note edit history must be preserved — no silent data loss.
- Page load / sync must complete in under 3 seconds on a reasonable connection.
- **Accepted trade-off:** passwords are generated once at dashboard creation and cannot be changed; a forgotten password means the notes are permanently unreadable (no recovery path — server holds no usable key material).
- **Honest limit:** the server ships the client JavaScript, so a *hostile operator rewriting client code* could undermine this; the scheme protects against passive compromise (DB access, leaked secrets), not against malicious operator redeploying the client. Documented, not hidden.

## User Stories

### US-01: Dashboard creator creates and shares a dashboard

- **Given** a person who has access to the Scytala instance
- **When** they navigate to `/new` and fill in the dashboard title, description, and user credentials
- **Then** a new dashboard is created, credentials are generated, and the creator sees the shareable link (`/dashboard/<hash>`)

#### Acceptance Criteria

- Creator can set a title and description
- Creator can add at least 1 user with a manual ID
- System generates a strong random password for each user
- After creation, the creator sees the dashboard URL and all credentials to distribute
- Creator is redirected to the new dashboard

### US-02: User logs in and views dashboard content

- **Given** a user who has received a dashboard link and credentials
- **When** they open the link and enter their ID + password
- **Then** they see the dashboard with all notes displayed as readable tiles, auto-synced to latest state

#### Acceptance Criteria

- Login screen is shown at the dashboard URL for unauthenticated users
- Invalid credentials show a clear error message
- On successful login, dashboard content is auto-synced and displayed
- Notes are presented as readable tiles on the dashboard

### US-03: User creates, edits, and deletes notes

- **Given** an authenticated user on a dashboard
- **When** they create a new note, edit an existing note, or delete a note
- **Then** the changes are saved and reflected on the dashboard

#### Acceptance Criteria

- User can create a new plain text note with content
- User can edit the content of any existing note
- User can delete any note
- Notes are timestamped with creation and last-edit time
- All edits are saved to version history

### US-04: User syncs to see others' changes

- **Given** an authenticated user on a dashboard where other users have made changes
- **When** they press the manual sync button
- **Then** they see the latest version of all notes, including changes made by other users

#### Acceptance Criteria

- A visible sync button exists on the dashboard
- After sync, new notes from others appear
- After sync, edits by others are reflected
- After sync, deleted notes by others are removed

### US-05: User browses note version history

- **Given** an authenticated user viewing a note that has been edited
- **When** they open the note's history
- **Then** they see a list of all previous versions with timestamps

#### Acceptance Criteria

- Each version shows the content at that point in time
- Each version shows when the edit was made
- User can view any past version's content

## Functional Requirements

- FR-001: User can create a new dashboard with title and description via `/new` wizard (unauthenticated). Priority: must-have
- FR-002: User can generate credentials (manual ID + randomized strong password) for dashboard participants during creation. Priority: must-have
- FR-003: User can share a dashboard via its secure link (`/dashboard/<hash>`). Priority: must-have
- FR-004: User can log in to a dashboard with per-dashboard ID + password. Priority: must-have
- FR-005: Authenticated user can view all notes on a dashboard as readable tiles. Priority: must-have
- FR-006: Authenticated user can create a new plain text note. Priority: must-have
- FR-007: Authenticated user can edit an existing note. Priority: must-have
- FR-008: Authenticated user can delete a note. Priority: must-have
- FR-009: Dashboard creator can edit dashboard settings (title, description). Priority: must-have
- FR-010: Dashboard creator can delete a dashboard. Priority: must-have
- FR-011: Notes have full version history — every edit is saved and users can browse past versions. Priority: must-have
- FR-012: Dashboard auto-syncs on enter; user can manually sync during a session via button. Priority: must-have
- FR-013: Note titles and contents are encrypted **in the browser** with a per-dashboard random data key (DEK, AES-256-GCM, AAD = note ID), which is wrapped once per participant under a key derived client-side from their password (PBKDF2-SHA256, 600k iterations). The server stores only ciphertext, wrapped DEKs, KDF parameters, and a hash of a one-way password-derived verifier — never the password, KEK, or DEK. Priority: must-have
- FR-014: Login authenticates with the one-way password-derived verifier (raw password never transmitted); the login response bundles the participant's vault material (`kdf_salt`, `kdf_iterations`, `wrapped_dek`, `unwrap_verifier`) so the dashboard unlocks in the same step. Priority: must-have
- FR-015: If the browser holds a valid session but no unwrapped DEK (e.g. after page reload), the dashboard renders a passive "Vault locked" state with blurred note tiles until the participant re-enters their password; the DEK exists only in volatile memory and auto-wipes after 30 minutes idle or on logout. Priority: must-have
- FR-016: Note deletion requires the participant's password re-entered, verified client-side by re-deriving the KEK and successfully unwrapping the DEK (no server round trip for the re-auth step itself). Priority: must-have

> Socratic: Dashboard creation is on an unauthenticated `/new` route. Security relies on instance-level obscurity (self-hosted). User accepted this for MVP simplicity.

> Socratic: Note history is full version history, not just last-edit metadata. User confirmed they want browse-able past versions.

> Socratic (v2, 2026-09-13): Encryption model upgraded from server-side at-rest encryption (v1, superseded) to zero-knowledge client-side E2EE after the user challenge "can an admin with DB access + the encryption key decrypt every note?" — answer for v1 was yes; v2 makes it no. Tuta's `tuta.com/encryption` used as reference architecture. Trade-offs explicitly accepted: no password recovery, no credential change, no server-side content search (local-only search patterns apply for any future search feature).

## Non-Functional Requirements

- Note titles and contents are unreadable to anyone without the participant's password — including the instance operator — and cannot be decrypted from a database dump alone.
- The encryption passphrase equals the generated dashboard password (cryptographically strong, 16-char mixed class); users never choose weaker vault passphrases than the wizard generates.
- Dashboard content is inaccessible without valid per-dashboard credentials.
- A user perceives page load and sync completion within 2 seconds on a typical broadband connection (client-side KDF budget ~300–900 ms on weak devices is part of the perceived unlock latency).
- The product remains usable on the latest two major versions of Chrome, Firefox, Safari, and Edge (native WebCrypto only, no WASM dependency).
- No note content is lost due to sync — every version is preserved in history (encrypted envelopes).
- The application handles at least 5 concurrent authenticated users per dashboard without degradation.

## Business Logic

**Business Logic**

**One-sentence rule:** A dashboard is a self-contained collaborative space where a single URL + per-user credentials — without any global identity system — gives a group private, structured access to shared notes with full version history and conflict-aware synchronization, and where the *operator of the instance* is cryptographically excluded from reading the note content.

**Encryption & key model (v2):** Each dashboard has one random data key (DEK). Every participant's password derives (client-side, PBKDF2 600k) a key-encryption key that wraps/decrypts that same DEK, so all members of a dashboard can read all notes while the server can read none. Login authenticates via a one-way verifier derived from the password — the password itself never leaves the browser, in any request, over any transport. Wrong-passphrase recovery is impossible by design.

**Sync & conflict model:** When a user syncs, the system compares their local state against the latest state. If another user edited the same note since last sync, the system detects the conflict and presents a diff view, letting the user manually merge the two versions. The unchosen version is preserved in history — no data is lost. (Diffing is client-side, operating on decrypted content.)

## Access Control

- **Auth model:** Login with manual ID + password, set once at dashboard creation time. No self-registration, no password changes in MVP. Authentication uses a client-side-derived one-way verifier, never the raw password.
- **Credential scope:** Per-dashboard. Each dashboard has its own set of user IDs and passwords and its own DEK. No global accounts.
- **Role model:** Flat — all users are equal once inside a dashboard. Everyone can view and edit notes (and, cryptographically, unwrap the same dashboard DEK).
- **Key possession boundary:** Only participants who know their password can unwrap the DEK. The dashboard creator (instance operator) has no decryption path through server infrastructure; they distribute credentials and therefore *are* the trust anchor for who gets access at that layer.
- **Dashboard management:** The dashboard creator manages the instance (creates dashboard, sets credentials) but this is an administrative/infrastructure concern, not an in-app role. Once created, all users (including the creator) have equal access to content.

## Non-Goals

- No file/photo/video sharing — notes (plain text) only for MVP. Media comes in a future version.
- No real-time collaboration — sync is manual (button press) or on-enter, not live push of changes.
- No mobile app — web-only for MVP. Responsive design is fine but no native app.
- No rich text formatting (Markdown, HTML) — plain text only for MVP.
- No credential management after creation — user IDs and passwords are set once at dashboard creation and cannot be changed (this also means no password rotation, and — because passwords wrap the encryption keys — no recovery path for forgotten passwords).
- No recovery codes / recovery wrapping for the vault — a lost password is a permanent data loss (accepted; additive schema support can be added in a future change).
- No server-side content search over notes (impossible with zero-knowledge encryption; any future search relies on a locally-built encrypted index, Tuta-style).
- No custom theming or styling — single visual style for MVP.
- No AI integration — no smart features, suggestions, or automation.
- No third-party integrations — Scytala is standalone, no external service hooks, imports, or exports.

## Open Questions

No open questions — all shape signals are present and resolved (v2 encryption model settled interactively on 2026-09-13; see `context/changes/note-e2ee-zero-knowledge/plan-brief.md` for the decision log).
