---
date: 2026-09-12T20:13:00Z
researcher: Antigravity
git_commit: f2bd3118368ad3e7f98d73e63416565a8d8e4f4b
branch: feature/integration_test
repository: palucdev/scytala
topic: "Risk #3: Concurrent Note Mutation Overwrite and Silent Version History Loss"
tags: [research, concurrency, optimistic-locking, note-versioning, rpc, vitest, playwright]
status: complete
last_updated: 2026-09-12
last_updated_by: Antigravity
---

# Research: Risk #3: Concurrent Note Mutation Overwrite and Silent Version History Loss

**Date**: 2026-09-12T20:13:00Z  
**Researcher**: Antigravity  
**Git Commit**: [f2bd3118368ad3e7f98d73e63416565a8d8e4f4b](https://github.com/palucdev/scytala/commit/f2bd3118368ad3e7f98d73e63416565a8d8e4f4b)  
**Branch**: `feature/integration_test`  
**Repository**: `palucdev/scytala`  

## Research Question

Risk #3 from `context/foundation/test-plan.md`:
1. How is the risk connected to code (files, functions, modules)?
2. What kind of business action will prove stability?
3. What is the cheapest and most local approach to test it? (using Exa and Context7)

---

## Summary

Risk #3 ("Concurrent note mutation overwrite and silent version history loss", Impact: High, Likelihood: Medium) describes the scenario where two concurrent updates race on the same note, resulting in a lost update, an unhandled exception, or non-sequential version corruption in `note_versions`.

1. **Code Connection**: The system defends against this via a 4-tier optimistic concurrency control (OCC) pipeline:
   - **PostgreSQL PL/pgSQL RPC** (`update_note_with_version`): Performs an atomic conditional update (`WHERE id = p_note_id AND version = p_expected_version`), increments `version = version + 1`, and inserts a snapshot into `note_versions`. If `version` does not match, PostgreSQL's row-level write lock causes the loser to hit `IF NOT FOUND THEN RAISE EXCEPTION`, triggering a complete transaction rollback.
   - **Database Client Adapter** (`SupabaseDatabaseClient.updateNote`): Translates RPC rejections into a caught error with the message prefix `[SupabaseDatabaseClient] updateNote failed: Version mismatch...`.
   - **Server Action** (`updateNoteAction`): Validates input with Zod (`expectedVersion: z.number().int().positive()`), executes session and rate limiting guards, catches the database exception, matches `"version mismatch"`, and returns a typed failure contract: `{ success: false, versionConflict: true, error: "..." }`.
   - **Frontend UI** (`NoteEditor.tsx` & `page.tsx`): Keys the editor component by `${note.id}-${note.version}`. On conflict, it renders a warning `Alert` with a "Reload" CTA that invokes `router.refresh()` to fetch the fresh state and reset local version state.

2. **Business Action Proving Stability**:
   - **Simultaneous Collaborative Edits**: Two users (or tabs) load note version $v1$. User A saves "Draft A" $\rightarrow$ succeeds, advancing the note to $v2$ with snapshot $v2$ in history. User B submits "Draft B" with `expectedVersion: 1`.
   - **Proof of Stability**:
     1. User B's save is rejected with `{ versionConflict: true }` and user-friendly guidance.
     2. User A's content is **not overwritten**.
     3. `notes.version` stays at 2 (no corrupt jumps).
     4. `note_versions` preserves exact contiguous sequencing `[v1, v2]` with no duplicates (enforced by `CONSTRAINT uq_note_version UNIQUE (note_id, version)`) or lost history.
     5. User B clicks "Reload" and successfully loads User A's version $v2$.

3. **Cheapest & Most Local Testing Approach**:
   - **Cheapest High-Signal Layer**: A **local Vitest integration test** against the running local Supabase instance using `Promise.allSettled([db.updateNote(...), db.updateNote(...)])` with two competing requests holding `expected_version: 1`. It runs in ~50ms without headless browser overhead, verifies real PostgreSQL transaction rollback, and asserts database state (`notes.version === 2`, `note_versions.length === 2`).
   - **Complementary Local E2E Test**: A **Playwright multi-tab / multi-context test** (`e2e/note-concurrency.spec.ts`) verifying the user journey: Tab 1 saves $\rightarrow$ Tab 2 attempts save $\rightarrow$ Warning alert appears $\rightarrow$ Clicking "Reload" revalidates and pulls Tab 1's content. Execution is strictly developer-side (`npm run test:e2e`).

---

## Detailed Findings

### 1. Database Schema & RPC Layer

- **Tables & Constraints** ([`supabase/migrations/20260819000000_create_dashboard_schema.sql`](https://github.com/palucdev/scytala/blob/f2bd3118368ad3e7f98d73e63416565a8d8e4f4b/supabase/migrations/20260819000000_create_dashboard_schema.sql#L42-L74)):
  - `notes` defines `version INT NOT NULL DEFAULT 1`.
  - `note_versions` defines `note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE`, `version INT NOT NULL`, and `author_id UUID REFERENCES public.dashboard_users(id) ON DELETE SET NULL`.
  - A strict unique constraint guarantees no duplicate versions can ever exist:
    ```sql
    CONSTRAINT uq_note_version UNIQUE (note_id, version)
    ```
  - Indexing: `idx_note_versions_note_history ON public.note_versions(note_id, version DESC)` ensures descending history lookups are $O(\log n)$.

- **Atomic Stored Procedure** ([`supabase/migrations/20260820000000_create_dashboard_rpcs.sql`](https://github.com/palucdev/scytala/blob/f2bd3118368ad3e7f98d73e63416565a8d8e4f4b/supabase/migrations/20260820000000_create_dashboard_rpcs.sql#L87-L134)):
  - `update_note_with_version(p_note_id, p_expected_version, p_content, p_title, p_author_id)` executes within an atomic transaction.
  - The SQL predicate enforces optimistic locking:
    ```sql
    UPDATE public.notes
    SET
        title = p_title,
        content = p_content,
        version = p_expected_version + 1,
        updated_at = TIMEZONE('utc'::text, NOW())
    WHERE id = p_note_id AND version = p_expected_version
    RETURNING * INTO v_note;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Version mismatch or note not found (expected version %)', p_expected_version;
    END IF;

    INSERT INTO public.note_versions (note_id, version, title, content, author_id)
    VALUES (v_note.id, v_note.version, v_note.title, v_note.content, p_author_id)
    RETURNING * INTO v_version;
    ```
  - **Transaction Mechanics**: When two concurrent updates hit the same row, PostgreSQL's `UPDATE` statement acquires a `ROW EXCLUSIVE` lock on the row. Transaction 1 executes and commits `version = version + 1`. When Transaction 2 inspects the row, its `version = p_expected_version` clause evaluates to false. It matches 0 rows, hits `IF NOT FOUND THEN RAISE EXCEPTION`, and rolls back completely without writing to `note_versions`.

### 2. Adapter & Server Action Layer

- **Database Client Adapter** ([`src/lib/supabase.ts`](https://github.com/palucdev/scytala/blob/f2bd3118368ad3e7f98d73e63416565a8d8e4f4b/src/lib/supabase.ts#L437-L456)):
  - `updateNote(input: UpdateNoteInput)` invokes `this.client.rpc("update_note_with_version", { ... })`.
  - When the RPC raises an exception, the Supabase client returns `{ data: null, error }`. The adapter wraps this:
    ```ts
    throw new Error(`[SupabaseDatabaseClient] updateNote failed: ${error?.message || "Unknown error"}`);
    ```
- **Validation Schema** ([`src/schemas/notes.ts`](https://github.com/palucdev/scytala/blob/f2bd3118368ad3e7f98d73e63416565a8d8e4f4b/src/schemas/notes.ts#L24-L48)):
  - `updateNoteSchema` enforces `expectedVersion: z.number().int().positive()`.
- **Server Action** ([`src/actions/notes.ts`](https://github.com/palucdev/scytala/blob/f2bd3118368ad3e7f98d73e63416565a8d8e4f4b/src/actions/notes.ts#L162-L268)):
  - Validates session with `verifyDashboardSession`.
  - Checks rate limit (`noteMutation`, 30 requests/minute per `${dashboard_id}:${user_id}`).
  - Confirms tenant ownership (`note.dashboard_id === session.dashboard_id`).
  - Executes `db.updateNote(...)`.
  - Catches the error and performs conflict extraction:
    ```ts
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.toLowerCase().includes("version mismatch")) {
      log.warn("Note update version conflict", { noteId, expectedVersion });
      return {
        success: false,
        versionConflict: true,
        error: "This note has been modified by someone else. Please reload and try again.",
      };
    }
    ```

### 3. Frontend UI State & Recovery

- **SSR Page Component** ([`src/app/dashboard/[hash]/note/[noteId]/page.tsx`](https://github.com/palucdev/scytala/blob/f2bd3118368ad3e7f98d73e63416565a8d8e4f4b/src/app/dashboard/%5Bhash%5D/note/%5BnoteId%5D/page.tsx#L82-L92)):
  - Keyed by `key={`${note.id}-${note.version}`}`. Any server-side version change forces React to unmount and mount a fresh `NoteEditor` instance.
- **Editor Component** ([`src/app/dashboard/[hash]/note/[noteId]/components/NoteEditor.tsx`](https://github.com/palucdev/scytala/blob/f2bd3118368ad3e7f98d73e63416565a8d8e4f4b/src/app/dashboard/%5Bhash%5D/note/%5BnoteId%5D/components/NoteEditor.tsx#L107-L128,L194-L213)):
  - Submits `expectedVersion: initialVersion`.
  - On conflict (`result.versionConflict === true`):
    - Sets `versionConflict: true`.
    - Renders an MUI `Alert` with `severity="warning"`:
      *"This note has been modified by someone else. Please reload and try again."*
    - Provides a "Reload" `<Button>` that invokes `router.refresh()`.
- **Version Restoration Flow** ([`NoteEditor.tsx:143-182`](https://github.com/palucdev/scytala/blob/f2bd3118368ad3e7f98d73e63416565a8d8e4f4b/src/app/dashboard/%5Bhash%5D/note/%5BnoteId%5D/components/NoteEditor.tsx#L143-L182)):
  - Restoring a past version does not mutate prior history. It calls `updateNoteAction` with `expectedVersion: currentActiveVersion` and the historical snapshot's content.
  - The database records a brand-new forward version ($N + 1$).

### 4. Existing Test Analysis & Defect Blind Spot

- **What Vitest Tests Today**:
  - `src/__tests__/actions/notes.test.ts` (lines 406–436) mocks `db.updateNote` with `new Error("Version mismatch...")` and checks that `updateNoteAction` returns `{ versionConflict: true }`.
  - `src/__tests__/lib/supabase.test.ts` (lines 758–776) mocks `rpc` to return `{ error: { message: "Version mismatch..." } }`.
  - `src/__tests__/app/dashboard/note/NoteEditor.test.tsx` (lines 379–415) mocks the action and tests the alert banner.
- **The Blind Spot**:
  - **No tests currently execute real concurrent mutations**.
  - All existing unit tests mock the database layer. They test the *application's response to an error*, but do not test whether PostgreSQL actually enforces serializability, whether `uq_note_version` prevents duplicate rows during races, or whether the transaction rolls back cleanly when an update fails under real connection concurrency.
  - In Playwright E2E (`e2e/`), all tests run sequentially in a single page context (`workers: 1`). No test opens two pages to trigger a conflict banner.

---

## Code References

- [`supabase/migrations/20260819000000_create_dashboard_schema.sql:42-69`](https://github.com/palucdev/scytala/blob/f2bd3118368ad3e7f98d73e63416565a8d8e4f4b/supabase/migrations/20260819000000_create_dashboard_schema.sql#L42-L69) - `notes` and `note_versions` schema with `uq_note_version` constraint.
- [`supabase/migrations/20260820000000_create_dashboard_rpcs.sql:87-134`](https://github.com/palucdev/scytala/blob/f2bd3118368ad3e7f98d73e63416565a8d8e4f4b/supabase/migrations/20260820000000_create_dashboard_rpcs.sql#L87-L134) - `update_note_with_version` RPC with conditional `WHERE` and `IF NOT FOUND THEN RAISE EXCEPTION`.
- [`src/client/db-client.ts:218-221`](https://github.com/palucdev/scytala/blob/f2bd3118368ad3e7f98d73e63416565a8d8e4f4b/src/client/db-client.ts#L218-L221) - `updateNote` interface contract.
- [`src/lib/supabase.ts:437-456`](https://github.com/palucdev/scytala/blob/f2bd3118368ad3e7f98d73e63416565a8d8e4f4b/src/lib/supabase.ts#L437-L456) - `SupabaseDatabaseClient.updateNote` calling Supabase RPC.
- [`src/schemas/notes.ts:24-48`](https://github.com/palucdev/scytala/blob/f2bd3118368ad3e7f98d73e63416565a8d8e4f4b/src/schemas/notes.ts#L24-L48) - `updateNoteSchema` validating `expectedVersion`.
- [`src/actions/notes.ts:162-268`](https://github.com/palucdev/scytala/blob/f2bd3118368ad3e7f98d73e63416565a8d8e4f4b/src/actions/notes.ts#L162-L268) - `updateNoteAction` handling optimistic concurrency error and returning `versionConflict: true`.
- [`src/app/dashboard/[hash]/note/[noteId]/page.tsx:82-92`](https://github.com/palucdev/scytala/blob/f2bd3118368ad3e7f98d73e63416565a8d8e4f4b/src/app/dashboard/%5Bhash%5D/note/%5BnoteId%5D/page.tsx#L82-L92) - Server component keying `NoteEditor` by `${note.id}-${note.version}`.
- [`src/app/dashboard/[hash]/note/[noteId]/components/NoteEditor.tsx:107-128,194-213`](https://github.com/palucdev/scytala/blob/f2bd3118368ad3e7f98d73e63416565a8d8e4f4b/src/app/dashboard/%5Bhash%5D/note/%5BnoteId%5D/components/NoteEditor.tsx#L107-L128) - Editor submitting `expectedVersion`, rendering warning banner, and reload handling.

---

## Architecture Insights

### 1. Database-Enforced OCC vs. In-Memory Locks
Scytala executes on Cloudflare Workers edge runtime (`workerd`), which runs distributed V8 isolates without shared in-memory state. In-memory locks or Node mutexes cannot protect against concurrent mutations across different isolates. Concurrency control **must** be enforced in PostgreSQL at the data persistence boundary via atomic SQL predicates (`WHERE version = p_expected_version`).

### 2. Transactional Rollback Safety
Because `update_note_with_version` is a PL/pgSQL function:
- All operations inside the function share a single PostgreSQL transaction.
- When `RAISE EXCEPTION` occurs, any preliminary operations (such as row updates or trigger executions) are rolled back completely.
- This guarantees that a failed concurrent update cannot leave a dirty title/content in `notes` or an orphaned row in `note_versions`.

### 3. Client Re-Sync Paradigm
The Next.js App Router relies on `router.refresh()` to fetch updated Server Components. By keying `NoteEditor` with `${note.id}-${note.version}`, Scytala guarantees that refreshing the page unmounts stale client state and mounts the current active version. However, this means clicking "Reload" replaces any unsaved local draft content. Full 3-way manual diff merging is scheduled for slice `S-05` (`manual-sync-and-conflict-diff-resolution`).

---

## Comparison of Testing Approaches (Cheapest & Most Local)

| Strategy | Layer | Cost / Speed | Execution Context | What it Proves | What it Misses | Recommendation |
|---|---|---|---|---|---|---|
| **A. Mocked Vitest Action Test** | Unit / Mock | ~1ms | In-memory (Vitest) | Action error parsing, `versionConflict` schema return | Does NOT test database transaction rollback, PostgreSQL locks, or actual races | Current baseline; insufficient alone |
| **B. Vitest Integration against Local Supabase** | Integration (RPC) | ~50ms | Node / Vitest + Local Docker Postgres | Real PostgreSQL row locking, atomic rollback, `uq_note_version` constraint, exact version incrementing under `Promise.allSettled` | Does not test client-side React warning banner or DOM interactions | **Cheapest & Highest Signal for Risk #3** (Core recommendation) |
| **C. Playwright Multi-Context / Multi-Tab** | E2E Browser | ~3–5s | Local Chrome / Firefox (`playwright.config.ts`) | Complete user journey: 2 open tabs, save race, warning banner rendering, "Reload" click resetting state | Heavy execution overhead; runs developer-side only (no CI) | **High Value for UI Verification**; pairs with Strategy B |

### Recommended Concrete Testing Implementation

#### 1. Vitest Integration Test (The Cheapest Local Test)
Create `src/__tests__/integration/note-concurrency.test.ts` (configured to run against local Supabase when `SUPABASE_URL` is available):
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { createDatabaseClient } from "@/client/db-client";

describe("Note Concurrency & Optimistic Locking Integration", () => {
  it("races two concurrent updates on expected_version 1: one succeeds, one rolls back cleanly", async () => {
    const db = createDatabaseClient();
    
    // 1. Create note (version 1)
    const { note } = await db.createNote({
      dashboard_id: testDashboardId,
      title: "Base Title",
      content: "Base Content",
    });

    // 2. Race two simultaneous updates with expected_version: 1
    const [resA, resB] = await Promise.allSettled([
      db.updateNote({ note_id: note.id, expected_version: 1, content: "Writer A Content" }),
      db.updateNote({ note_id: note.id, expected_version: 1, content: "Writer B Content" }),
    ]);

    // 3. Exactly one succeeds, exactly one fails
    const fulfilled = [resA, resB].filter((r) => r.status === "fulfilled");
    const rejected = [resA, resB].filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toContain("Version mismatch or note not found (expected version 1)");

    // 4. Verify database state integrity
    const updatedNote = await db.getNoteById(note.id);
    expect(updatedNote?.version).toBe(2);

    const versions = await db.getNoteVersions(note.id);
    expect(versions).toHaveLength(2);
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2]);
  });
});
```

#### 2. Playwright Multi-Page E2E Test (UI Stability Proof)
Add `e2e/note-concurrency.spec.ts`:
```ts
test("concurrent edit conflict displays warning alert and allows reload recovery", async ({
  context,
  createTestDashboard,
  loginToDashboard,
}) => {
  const dash = await createTestDashboard();
  
  // Tab 1
  const page1 = await context.newPage();
  await loginToDashboard(dash.hash, dash.alias, dash.password, page1);
  // Create note v1
  const noteId = await createTestNote(page1, "Initial Note");

  // Tab 2 opens the same note
  const page2 = await context.newPage();
  await page2.goto(`/dashboard/${dash.hash}/note/${noteId}`);

  // Tab 1 edits and saves -> increments to v2
  await page1.getByLabel("Note content").fill("Content from Tab 1");
  await page1.getByRole("button", { name: "Save note" }).click();
  await expect(page1.getByText("v2")).toBeVisible();

  // Tab 2 (still on v1) attempts to save
  await page2.getByLabel("Note content").fill("Content from Tab 2");
  await page2.getByRole("button", { name: "Save note" }).click();

  // Assert Tab 2 receives warning alert without overwriting
  await expect(page2.getByRole("alert")).toContainText(
    "This note has been modified by someone else. Please reload and try again."
  );

  // Click Reload in Tab 2
  await page2.getByRole("button", { name: "Reload" }).click();
  await expect(page2.getByLabel("Note content")).toHaveValue("Content from Tab 1");
  await expect(page2.getByText("v2")).toBeVisible();
});
```

---

## Historical Context (from prior changes)

- `context/changes/note-crud-and-version-persistence/plan.md` (lines 55–56):
  Documented the original OCC contract: `update_note_with_version` raises `'Version mismatch or note not found (expected version %)'` and `updateNoteAction` maps this to `{ success: false, versionConflict: true }`.
- `context/changes/note-version-history-browser/plan.md` (lines 50–54):
  Decided that version restoration must be append-only forward increments ($N + 1$) rather than rewriting database history, keeping historical snapshots immutable under OCC.
- `context/changes/testing-playwright-e2e-critical-flows/change.md` (lines 12–14):
  Established that E2E tests are local-only on the developer machine due to compute cost and absence of cloud nonprod Supabase instances.

---

## Related Research

- [`context/changes/note-crud-and-version-persistence/plan.md`](https://github.com/palucdev/scytala/blob/f2bd3118368ad3e7f98d73e63416565a8d8e4f4b/context/changes/note-crud-and-version-persistence/plan.md)
- [`context/changes/note-version-history-browser/research.md`](https://github.com/palucdev/scytala/blob/f2bd3118368ad3e7f98d73e63416565a8d8e4f4b/context/changes/note-version-history-browser/research.md)
- [`context/changes/testing-playwright-e2e-critical-flows/research.md`](https://github.com/palucdev/scytala/blob/f2bd3118368ad3e7f98d73e63416565a8d8e4f4b/context/changes/testing-playwright-e2e-critical-flows/research.md)

---

## Open Questions

1. **User Draft Retention on Reload**:
   Currently, clicking "Reload" on a version conflict alert wipes unsaved client draft input because `page.tsx` unmounts `NoteEditor` when `version` changes. While acceptable for MVP, does slice `S-05` need to preserve the dirty draft in local storage or session memory so the user can copy their unsaved thoughts before/after reload?
2. **Integration Test Environment in CI vs Local**:
   Can a lightweight local integration test against Supabase run in CI if Supabase is booted in GitHub Actions via `supabase start`? Currently GitHub Actions runs `npm run test` without a live database container, relying on unit mocks. An integration test against real Postgres would either run locally only (like E2E) or require a Supabase CLI action in `.github/workflows/test.yml`.
