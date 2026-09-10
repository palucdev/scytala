---
project: "Scytala"
context_type: greenfield
created: 2026-07-29
updated: 2026-07-29
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain category"
      decision: "workflow friction + missing capability + data trapped — three co-existing pain types"
    - topic: "core insight"
      decision: "both format (dashboard vs chat) and hosting model (self-hosted vs 3rd party) are wrong in current solutions"
    - topic: "primary persona scope"
      decision: "individuals across many contexts — families, friend groups, small teams"
    - topic: "auth model"
      decision: "login with manual ID + randomized strong password, set once at dashboard creation"
    - topic: "credential scope"
      decision: "per-dashboard — each dashboard has its own user list, no global accounts"
    - topic: "role model"
      decision: "flat — all users equal, no permission levels; creator is admin at infrastructure level only"
    - topic: "sync model"
      decision: "auto-sync on page load + manual button for refresh during session"
    - topic: "dashboard creation route"
      decision: "unauthenticated /new route — instance URL is the security boundary"
    - topic: "credential distribution"
      decision: "creator generates all credentials up front, distributes out-of-band"
    - topic: "note history depth"
      decision: "full version history — every edit saved, users can browse past versions"
    - topic: "core business rule"
      decision: "shareable dashboard as self-contained collaborative space — single URL + per-user credentials, no global identity"
    - topic: "conflict resolution"
      decision: "conflict detection with diff view — user manually merges, unchosen version preserved in history"
    - topic: "data model extensibility"
      decision: "notes only for MVP, but flexible item structure anticipating future content types"
    - topic: "product type"
      decision: "web-app"
    - topic: "target scale"
      decision: "small — single-digit users per instance"
    - topic: "scale insight"
      decision: "at 100x scale, diff-based conflict resolution breaks down; would need real-time collab — future concern, not MVP"
    - topic: "timeline"
      decision: "3-week MVP, hard deadline 2026-09-09, after-hours only"
  frs_drafted: 12
  quality_check_status: accepted
---

## Vision & Problem Statement

People who need to share private content with chosen people — teams, families, friend groups — are stuck between chat apps (where content gets buried and is unsearchable) and cloud platforms (where privacy is surrendered to 3rd parties). Existing self-hosted tools (wikis, file managers) are complex to set up and designed for persistent knowledge bases, not for lightweight, shared content dashboards.

Scytala's insight is twofold: (1) shared private content belongs on a **structured dashboard** — browseable and searchable — not in a chat stream, and (2) **self-hosting** is the only hosting model that genuinely solves the privacy problem, but it must be simple enough for non-technical users to deploy.

## User & Persona

### Primary persona

**Role:** An individual who coordinates content sharing in small groups — could be a team lead, a family organizer, a friend group coordinator.

**Context:** They need to share a collection of notes (and eventually files/media) with specific people, and want the content to be organized, findable, and private.

**Moment:** They reach for Scytala when they want to create a shared space for a specific group, where content stays organized instead of scrolling away in chat.

## Access Control

- **Auth model:** Login with manual ID + randomized strong password, set once at dashboard creation time. No self-registration, no password changes in MVP.
- **Credential scope:** Per-dashboard. Each dashboard has its own set of user IDs and passwords. No global accounts.
- **Role model:** Flat — all users are equal once inside a dashboard. Everyone can view and edit notes.
- **Dashboard management:** The dashboard creator manages the instance (creates dashboard, sets credentials) but this is an administrative/infrastructure concern, not an in-app role. Once created, all users (including the creator) have equal access to content.

## Success Criteria

### Primary

- A user can create a dashboard, set credentials for other users, share the link, and those users can log in, view the dashboard, and create/edit notes.

### Secondary

- Multiple users editing notes on the same dashboard see each other's changes after syncing.

### Guardrails

- Note content must not be accessible without valid credentials.
- Dashboard must remain usable with at least 5 concurrent users.
- Note edit history must be preserved — no silent data loss.
- Page load / sync must complete in under 3 seconds on a reasonable connection.

## Timeline Budget

- MVP weeks: 3
- Hard deadline: 2026-09-09
- After hours only: yes

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

> Socratic: Dashboard creation is on an unauthenticated `/new` route. Security relies on instance-level obscurity (self-hosted). User accepted this for MVP simplicity.

> Socratic: Note history is full version history, not just last-edit metadata. User confirmed they want browse-able past versions.

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

## Business Logic

**One-sentence rule:** A dashboard is a self-contained collaborative space where a single URL + per-user credentials — without any global identity system — gives a group private, structured access to shared notes with full version history and conflict-aware synchronization.

**Sync & conflict model:** When a user syncs, the system compares their local state against the server's latest. If another user edited the same note since last sync, the system detects the conflict and presents a diff view, letting the user manually merge the two versions. The unchosen version is preserved in history — no data is lost.

**Data entities (MVP):** Dashboard, User (per-dashboard), Note, NoteVersion. The data model should anticipate future content types (files, images) by using a flexible item structure, but only notes are implemented for MVP.

## Non-Functional Requirements

- Dashboard content is inaccessible without valid per-dashboard credentials.
- A user perceives page load and sync completion within 2 seconds on a typical broadband connection.
- The product remains usable on the latest two major versions of Chrome, Firefox, Safari, and Edge.
- No note content is lost due to sync — every version is preserved in history.
- The application handles at least 5 concurrent authenticated users per dashboard without degradation.

## Non-Goals

- No file/photo/video sharing — notes (plain text) only for MVP. Media comes in a future version.
- No real-time collaboration — sync is manual (button press) or on-enter, not live cursors / WebSocket push.
- No mobile app — web-only for MVP. Responsive design is fine but no native app.
- No rich text formatting (Markdown, HTML) — plain text only for MVP.
- No credential management after creation — user IDs and passwords are set once at dashboard creation and cannot be changed.
- No custom theming or styling — single visual style for MVP.
- No AI integration — no smart features, suggestions, or automation.
- No third-party integrations — Scytala is standalone, no webhooks, APIs, or imports.

## Quality cross-check

All 5 greenfield quality signals present. No gaps. Status: accepted.
