# Dashboard Creation Wizard (`S-01`) Implementation Plan

## Overview

The **Dashboard Creation Wizard** is the entry point (`/new`) for creating isolated, self-contained Scytala dashboards with per-dashboard participant credentials without global accounts. It provides an intuitive 4-step Material-UI (MUI) wizard where the creator enters dashboard metadata, dynamically adds participants with auto-generated secure passwords, reviews configuration, and executes an atomic Next.js Server Action that hashes credentials with PBKDF2 before persisting them to Supabase PostgreSQL via RPC. Upon successful creation, the creator receives a shareable link (`/dashboard/<hash>`) and cleartext credentials with one-click clipboard copying for out-of-band distribution.

## Current State Analysis

- **Relational Schema & RPCs:** The underlying PostgreSQL database tables (`dashboards`, `dashboard_users`, `notes`, `note_versions`) and atomic stored procedure `create_dashboard_with_users` were delivered in `F-01` (`supabase/migrations/20260819000000_create_dashboard_schema.sql` and `supabase/migrations/20260820000000_create_dashboard_rpcs.sql`).
- **Database Client & Adapter:** [src/client/db-client.ts](../../../src/client/db-client.ts) and [src/lib/supabase.ts](../../../src/lib/supabase.ts) expose `createDashboard(input: CreateDashboardInput)` which executes the atomic RPC.
- **Cryptographic Primitives:** [src/lib/crypto.ts](../../../src/lib/crypto.ts) provides zero-dependency Web Crypto utilities: `generateRandomPassword()`, `generateDashboardSlug()`, and `hashPassword()` (100k iteration PBKDF2 SHA-256).
- **Styling & Theme:** Application theme `PapyrusThemeLight` is configured in [src/theme/papyrus-theme-light.ts](../../../src/theme/papyrus-theme-light.ts) with papyrus color palette and serif typography (`IM Fell English`, `Crimson Text`). TailwindCSS is strictly prohibited.
- **Missing Elements:**
  - Route `/new` and page container `src/app/new/page.tsx`.
  - Server Action `src/actions/dashboard.ts` coordinating Zod validation, slug generation, server-side PBKDF2 hashing, and database persistence.
  - Step components: `StepDetails`, `StepParticipants`, `StepReview`, and `StepSuccess`.
  - Comprehensive unit and integration test coverage for actions and UI.

## Desired End State

1. Navigating to `/new` displays a 4-step Material-UI Stepper embedded in a papyrus-themed container.
2. **Step 1 (Details):** User enters Title (required, 1-80 chars) and Description (optional, max 300 chars). Advancing is gated by title validation.
3. **Step 2 (Participants):** Opens with an empty list. User clicks "Add Participant" to create rows. Each row has an Alias input (2-30 chars, alphanumeric with `_` and `-`, case-insensitive unique) and an auto-generated 16-character secure password with show/hide toggle and regenerate action. User can remove participant rows. Advancing requires $\ge 1$ valid unique participant.
4. **Step 3 (Review):** Displays read-only summary cards of title, description, and participant alias count. Submitting invokes `createDashboardAction` with loading spinner. If server action encounters an error, an inline MUI Alert displays the error with a retry button while preserving all entered form state and passwords.
5. **Step 4 (Success):** Displays shareable link card with copy button, individual credential cards with one-click copy buttons, a master "Copy All Credentials" formatted clipboard utility, and an "Enter Dashboard" button navigating via `router.push('/dashboard/<hash>')`.
6. Test suite achieves $\ge 80\%$ statement, branch, function, and line coverage across all newly created files.

### Key Discoveries:

- [src/client/db-client.ts:85-93](../../../src/client/db-client.ts#L85-L93): `CreateDashboardInput` expects `{ title, description?, hash?, users: [{ user_alias, password_hash }] }`.
- [src/lib/crypto.ts:181-197](../../../src/lib/crypto.ts#L181-L197): `generateDashboardSlug(16)` provides a 16-character URL-safe string with 96 bits of entropy.
- [src/lib/crypto.ts:221-251](../../../src/lib/crypto.ts#L221-L251): `generateRandomPassword(16)` satisfies all character classes and can be called client-side when adding participant rows.
- [src/lib/crypto.ts:107-122](../../../src/lib/crypto.ts#L107-L122): `hashPassword(password)` must be executed on the server side in the server action before calling `db.createDashboard()`.

## What We're NOT Doing

- No persistent session authentication on `/new` (dashboard creation is unauthenticated per PRD FR-001).
- No post-creation password changes or user invites via email (passwords are distributed out-of-band by creator per PRD US-01).
- No multi-route nested wizard URLs (`/new/step-1`, `/new/step-2`) — keeping passwords in client memory during the session avoids storing cleartext secrets in cookies or query params.
- No downloadable `.txt` files — credential export is constrained to individual copy buttons and master clipboard formatted text copy per user decision.

## Implementation Approach

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Client: /new (Page State)                       │
│                                                                        │
│  [Step 1: Details] ──> [Step 2: Participants] ──> [Step 3: Review]     │
│  - Title & Desc         - Add/Remove Users        - Summary Card       │
│  - Zod Step Gate        - Auto Passwords          - Submit to Action   │
└───────────────────────────────────────────────┬────────────────────────┘
                                                │
                                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│               Server Action: createDashboardAction                     │
│                                                                        │
│  1. Zod Validation (createDashboardSchema)                             │
│  2. Generate 16-char Slug (generateDashboardSlug)                      │
│  3. Hash all user passwords in parallel (hashPassword - PBKDF2 100k)   │
│  4. Atomic DB RPC execution (createDatabaseClient().createDashboard)  │
└───────────────────────────────────────────────┬────────────────────────┘
                                                │
                                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    Client: Step 4 (Success View)                       │
│                                                                        │
│  - Shareable URL: /dashboard/<slug> (Copy Button)                      │
│  - Credential Cards (Individual Copy)                                  │
│  - Master Formatted Text Copy Button                                   │
│  - Enter Dashboard: router.push(/dashboard/<slug>)                     │
└────────────────────────────────────────────────────────────────────────┘
```

## Critical Implementation Details

### 1. Zod Validation Schemas & Action Contracts (`src/actions/dashboard.ts`):

```typescript
import { z } from "zod";
import { Dashboard } from "@/client/db-client";

export const ALIAS_REGEX = /^[a-zA-Z0-9_-]+$/;

export const participantUserSchema = z.object({
  id: z.string().optional(), // Client-side tracking ID
  user_alias: z
    .string()
    .trim()
    .min(2, "Alias must be at least 2 characters")
    .max(30, "Alias must be at most 30 characters")
    .regex(
      ALIAS_REGEX,
      "Alias can only contain letters, numbers, hyphens, and underscores",
    ),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(128, "Password must be at most 128 characters"),
});

export const createDashboardSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Dashboard title is required")
    .max(80, "Dashboard title must not exceed 80 characters"),
  description: z
    .string()
    .trim()
    .max(300, "Description must not exceed 300 characters")
    .optional()
    .nullable()
    .transform((val) => (val && val.length > 0 ? val : null)),
  users: z
    .array(participantUserSchema)
    .min(1, "At least one participant user is required")
    .refine((users) => {
      const aliases = users.map((u) => u.user_alias.toLowerCase());
      return new Set(aliases).size === aliases.length;
    }, "Participant aliases must be unique"),
});

export type ParticipantUserInput = z.infer<typeof participantUserSchema>;
export type CreateDashboardInputValues = z.infer<typeof createDashboardSchema>;

export interface ParticipantCredential {
  user_alias: string;
  password: string;
}

export type CreateDashboardActionResult =
  | {
      success: true;
      dashboard: Dashboard;
      credentials: ParticipantCredential[];
    }
  | {
      success: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
    };
```

### 2. Post-Creation Text Formatter Utility:

```typescript
export function formatCredentialsText(
  dashboardTitle: string,
  dashboardUrl: string,
  credentials: ParticipantCredential[],
): string {
  const lines = [
    `Dashboard: ${dashboardTitle}`,
    `URL: ${dashboardUrl}`,
    "",
    "Participant Credentials:",
    ...credentials.map((c) => `• ${c.user_alias}: ${c.password}`),
  ];
  return lines.join("\n");
}
```

### 3. Wizard State Machine Structure (`src/app/new/page.tsx`):

```typescript
export interface WizardFormState {
  activeStep: number;
  title: string;
  description: string;
  users: Array<{ id: string; user_alias: string; password: string }>;
  isSubmitting: boolean;
  submitError: string | null;
  createdResult: {
    dashboard: Dashboard;
    credentials: ParticipantCredential[];
  } | null;
}
```

---

## Implementation Phases

### Phase 1: Validation Schemas & Server Action Pipeline (`src/actions/dashboard.ts`)

- Install runtime dependency `zod` (`npm install zod`).
- Implement `src/actions/dashboard.ts` with Zod validation schemas (`createDashboardSchema`, `participantUserSchema`, `ALIAS_REGEX`).
- Implement `createDashboardAction(input: unknown): Promise<CreateDashboardActionResult>`:
  - Validates `input` with `createDashboardSchema.safeParse`.
  - Explicitly generates 16-character slug using `generateDashboardSlug(16)` and passes it to `db.createDashboard({ title, description, hash, users: hashedUsers })` for deterministic identifier control.
  - Hashes all participant passwords concurrently using `Promise.all(users.map(u => hashPassword(u.password)))`.
  - Instantiates `createDatabaseClient()` and calls `db.createDashboard({ title, description, hash, users: hashedUsers })`.
  - Handles database or duplicate constraint failures gracefully and returns `{ success: false, error: ... }`.
  - Returns `{ success: true, dashboard: result.dashboard, credentials: cleartextCredentials }`.
- Export `formatCredentialsText` utility function.
- Create unit test suite `src/__tests__/actions/dashboard.test.ts` testing:
  - Successful creation with title, description, and multiple participants.
  - Validation failures (empty title, invalid alias characters, alias too short/long, duplicate aliases).
  - Database exception handling and error formatting.
  - `formatCredentialsText` output formatting.

**Verification:**
```bash
npm run test -- src/__tests__/actions/dashboard.test.ts
```

---

### Phase 2: Wizard Step Components (`src/app/new/components/`)

- Install UI dependency `@mui/icons-material` (`npm install @mui/icons-material`).
- Create `src/app/new/components/StepDetails.tsx`:
  - Renders `TextField` for Title (`autoFocus`, required, max 80 characters, error display if touched and empty).
  - Renders `TextField` for Description (`multiline`, 3 rows, max 300 characters, helper character count).
- Create `src/app/new/components/StepParticipants.tsx`:
  - Renders list of participant rows.
  - If list is empty, renders an informative empty state prompt with an "Add Participant" button.
  - For each participant row:
    - `TextField` for `user_alias` with validation error indicators (duplicates, invalid chars).
    - `TextField` for `password` with visibility toggle (`IconButton` with `Visibility` / `VisibilityOff` icons from `@mui/icons-material`).
    - `Tooltip` + `IconButton` to regenerate password using `generateRandomPassword(16)`.
    - `Tooltip` + `IconButton` (`Delete` icon from `@mui/icons-material`) to remove participant row.
  - Primary button "+ Add Participant" that appends a new user with a generated 16-char password.
- Create `src/app/new/components/StepReview.tsx`:
  - Renders summary `Card` showing Dashboard Title, Description (or "No description provided"), and participant count.
  - Renders chip list of participant aliases.
  - Security warning `Alert` (severity "info"): "Passwords will be revealed only once on the next screen. Please ensure you copy them for distribution."
  - Inline error `Alert` (severity "error") if `submitError` is present, with retry prompt.
- Create `src/app/new/components/StepSuccess.tsx`:
  - Success banner `Alert` (severity "success"): "Dashboard successfully created!"
  - Shareable URL box with one-click copy button (`navigator.clipboard.writeText`) with copied tooltip/feedback (safely deriving base URL via `typeof window !== "undefined" ? window.location.origin : ""`).
  - Participant credentials list where each item has alias, password (monospace font), and a dedicated "Copy" button.
  - Master action "Copy All Credentials" formatted for messaging apps using `formatCredentialsText`.
  - Primary CTA "Enter Dashboard" invoking `router.push('/dashboard/' + hash)`.

**Verification:**
Components render with `PapyrusThemeLight` design system and pass syntax/lint checks.

---

### Phase 3: Wizard Page Container & State Machine (`src/app/new/page.tsx`)

- Implement `src/app/new/page.tsx` as a Client Component (`"use client"`):
  - Responsive `Container` (`maxWidth="md"`) with papyrus paper surface styling (`bgcolor: "background.paper"`, `border: "1px solid"`, `borderColor: "divider"`, `borderRadius: 2`, `p: { xs: 2, sm: 4 }`).
  - Top header with `IM Fell English` serif typography: "Create New Dashboard".
  - MUI `Stepper` with `Step` and `StepLabel`:
    - Steps: `1. Details`, `2. Participants`, `3. Review`, `4. Share & Connect`.
    - `alternativeLabel` for desktop viewports.
  - Wizard state management:
    - Step 1 validation check: Title non-empty $\le 80$ chars.
    - Step 2 validation check: $\ge 1$ participant, all aliases valid $\ge 2$ chars, alphanumeric, unique.
    - "Back" button (disabled on Step 1, hidden on Step 4).
    - "Next" button (advances step if current step validates).
    - "Create Dashboard" submit button on Step 3 with `CircularProgress` loading state.
    - Preserves all entered data and generated passwords in state when stepping back or encountering server errors.

**Verification:**
```bash
npm run lint
```

---

### Phase 4: Integration Test Suite & Quality Verification

- Create `src/__tests__/app/new/page.test.tsx`:
  - Test Step 1: renders form inputs, Next button disabled until title entered, character limit feedback.
  - Test Step 2: shows empty state, clicking "Add Participant" creates row with auto-generated password, alias uniqueness validation prevents advancing with duplicate names.
  - Test Step 2: regenerate password updates password value, delete button removes row.
  - Test Step 3: renders summary details, clicking "Create Dashboard" calls `createDashboardAction`.
  - Test Step 3 Error State: mock action failure renders inline Alert and keeps entered values intact.
  - Test Step 4 Success: renders shareable URL, clipboard copy buttons trigger `navigator.clipboard.writeText`, clicking "Enter Dashboard" triggers `router.push`.
- Execute full test suite with coverage enforcement to verify statement, branch, line, and function coverage exceed $80\%$.

**Verification:**
```bash
npm run test
npm run lint
```

---

## Testing Strategy

| Test File | Target | Key Test Cases |
|---|---|---|
| `src/__tests__/actions/dashboard.test.ts` | `createDashboardAction`, Zod schemas, `formatCredentialsText` | - Successful creation returns `{ success: true, dashboard, credentials }`<br>- Schema validation rejects empty title, invalid alias chars, duplicate aliases<br>- DB exception returns `{ success: false, error }`<br>- `formatCredentialsText` formats lines with title, URL, and bulleted credentials |
| `src/__tests__/app/new/page.test.tsx` | `src/app/new/page.tsx` + Step Components | - Step 1: title required to advance<br>- Step 2: empty state prompt, add user with auto password, duplicate alias validation error, remove user, regenerate password<br>- Step 3: summary review display, action submission with loading state, error alert on server failure with retry capability<br>- Step 4: shareable link display, individual copy button, copy all credentials button, router push to `/dashboard/<hash>` |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Lost Credentials on Accidental Navigation** | Creator navigates away before copying unhashed passwords; passwords cannot be retrieved once lost. | Step 4 prominently displays credentials, provides individual and master copy buttons, and warns the user that passwords are shown only once. |
| **Server Action Failure / DB Timeout** | Network or DB failure causes user frustration if wizard resets. | Error is displayed as an inline Alert on Step 3 without resetting state, allowing immediate retry. |
| **Duplicate Slug Collision (Unlikely)** | In the rare event of a 16-character slug collision, database RPC rolls back. | Action catches the unique constraint violation, returns user-friendly error message, or retries. |

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Validation Schemas & Server Action Pipeline (`src/actions/dashboard.ts`)

#### Automated

- [x] 1.1 Implement Zod validation schemas and ALIAS_REGEX in src/actions/dashboard.ts
- [x] 1.2 Implement createDashboardAction Server Action with password hashing and DB persistence
- [x] 1.3 Implement formatCredentialsText utility function
- [x] 1.4 Implement unit test suite in src/__tests__/actions/dashboard.test.ts

### Phase 2: Wizard Step Components (`src/app/new/components/`)

#### Automated

- [x] 2.1 Implement StepDetails component for Title and Description
- [x] 2.2 Implement StepParticipants component with dynamic row management and password generators
- [x] 2.3 Implement StepReview component with configuration summary and error alert
- [x] 2.4 Implement StepSuccess component with credential cards and clipboard copy utilities

### Phase 3: Wizard Page Container & State Machine (`src/app/new/page.tsx`)

#### Automated

- [x] 3.1 Implement src/app/new/page.tsx with 4-step Material-UI Stepper and state machine
- [x] 3.2 Verify linting and build checks

### Phase 4: Integration Test Suite & Quality Verification

#### Automated

- [x] 4.1 Implement integration test suite in src/__tests__/app/new/page.test.tsx
- [x] 4.2 Run test suite with coverage enforcement to verify >=80% coverage
