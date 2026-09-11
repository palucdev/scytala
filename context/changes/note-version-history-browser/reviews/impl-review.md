<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Note Version History Browser

- **Plan**: context/changes/note-version-history-browser/plan.md
- **Scope**: Full Plan (Phases 1 to 5)
- **Date**: 2026-09-11
- **Verdict**: NEEDS ATTENTION
- **Findings**: 1 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|---|---|
| Plan Adherence | WARNING ⚠️ (1 finding) |
| Scope Discipline | PASS ✅ |
| Safety & Quality | FAIL ❌ (2 findings) |
| Architecture | PASS ✅ |
| Pattern Consistency | WARNING ⚠️ (1 finding) |
| Success Criteria | PASS ✅ |

## Findings

### F1 — Permanent State Lock & Potential Edit Loss Post-Restoration

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/app/dashboard/[hash]/note/[noteId]/components/NoteEditor.tsx:197
- **Detail**: In `handleRestoreVersion`, successful restoration invokes `setIsSaved(true)`. Because `EditorToolbar` computes `isSaving = isPending || isSaved`, this locks the Save button into a permanently disabled "Saving..." state with a spinner. Furthermore, `isDirty` evaluates to `false` when `isSaved === true`, and neither `handleTitleChange` nor `handleContentChange` resets `isSaved` to `false`. If the user types before or during `router.refresh()`, their input is blocked from saving; when `router.refresh()` finishes and `page.tsx` re-renders with the incremented version key (`key={`${note.id}-${note.version}`}`), React remounts `NoteEditor`, silently wiping out new draft edits.
- **Fix A ⭐ Recommended**: Remove `setIsSaved(true)` from `handleRestoreVersion` and add `if (isSaved) setIsSaved(false)` to both `handleTitleChange` and `handleContentChange`.
  - Strength: Prevents the editor toolbar from locking in "Saving..." state, ensures `isDirty` and the Save button properly activate immediately upon user typing, and defends against state synchronization lag.
  - Tradeoff: Minor — two small call-site changes within `NoteEditor.tsx`.
  - Confidence: HIGH — identical to standard Next.js form state patterns in the app.
  - Blind spot: None significant.
- **Fix B**: Retain `isSaved(true)` in `handleRestoreVersion` but only reset `setIsSaved(false)` inside `handleTitleChange` and `handleContentChange`.
  - Strength: Explicitly signals the restored state was clean before modifications.
  - Tradeoff: Still leaves the Save button momentarily displaying "Saving..." until the user begins typing.
  - Confidence: MEDIUM — leaves a window where the UI appears busy when it is not.
  - Blind spot: User may be confused by "Saving..." spinner while reading restored text.
- **Decision**: FIXED (Fix A)

### F2 — Main-Thread UI Lag from Keystroke Re-Diffing in Persistent Drawer

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/dashboard/[hash]/note/[noteId]/components/NoteEditor.tsx:323
- **Detail**: `NoteEditor.tsx` passes `currentContent={content}` to `NoteVersionHistoryDrawer`. Because the desktop history drawer is persistent and non-dimming, it remains open beside the editor while the user types. On every keystroke, `content` changes, causing `NoteVersionHistoryDrawer` to recompute word diffs for up to 50 versions against `currentContent` synchronously on the main thread, causing frame drops on large notes. Moreover, `plan.md:31` specifies that timeline delta summaries must be computed relative to immediate predecessor $v_{K-1}$ (with $v_1$ displaying `+${v1.content.length}`), which is immutable and static.
- **Fix A ⭐ Recommended**: Omit `currentContent={content}` from `NoteVersionHistoryDrawer` in `NoteEditor.tsx` so deltas compute against immutable predecessor versions (`versions[i + 1]`), making `versionDeltas` dependent solely on `[versions]` and costing 0 CPU on keystrokes.
  - Strength: Exactly matches `plan.md:31` specification, completely eliminates typing latency, and git-style predecessor deltas are more intuitive for historical timelines.
  - Tradeoff: Removes the live "delta from current draft" comparison on the timeline tiles (though inline diff in preview dialog remains available).
  - Confidence: HIGH — predecessor fallback logic is already implemented in `NoteVersionHistoryDrawer.tsx:90`.
  - Blind spot: None.
- **Fix B**: Debounce or compute deltas against `currentContent` only when the drawer is opened or refreshed, not on live keystrokes.
  - Strength: Preserves draft-relative delta information on the timeline tiles.
  - Tradeoff: Adds debounce state complexity and retains drift from `plan.md`.
  - Confidence: MEDIUM — more moving parts for marginal UX benefit.
  - Blind spot: Delta numbers may momentarily show stale counts during active typing.
- **Decision**: FIXED (Fix A)

### F3 — Stale Drawer Versions List Post-Restoration

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/dashboard/[hash]/note/[noteId]/components/NoteEditor.tsx:197
- **Detail**: Restoring a version creates a new snapshot ($v_{N+1}$) in the database via `updateNoteAction`. While `router.refresh()` updates the server-rendered page, the client-side `versions` state in `NoteEditor` is not refreshed. If the user opens the history drawer after restoring, the timeline still displays the old version list until the user manually clicks "Refresh".
- **Fix**: In `handleRestoreVersion`, invoke `fetchVersionHistory()` upon `result.success` to immediately update the drawer's version timeline with the new snapshot.
- **Decision**: FIXED (await fetchVersionHistory)

### F4 — Code Duplication in `computeVersionDelta`

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/dashboard/[hash]/note/[noteId]/components/NoteVersionHistoryDrawer.tsx:42
- **Detail**: `NoteVersionHistoryDrawer.tsx` defines a local duplicate of `computeVersionDelta` instead of importing it from `src/lib/diff.ts`. Furthermore, the version in `diff.ts` strips newlines (`replace(/[\r\n]/g, "")`) while the drawer's local copy includes newlines in length calculation.
- **Fix**: Remove the local `computeVersionDelta` function from `NoteVersionHistoryDrawer.tsx` and import `computeVersionDelta` directly from `@/lib/diff`.
- **Decision**: FIXED (imported from @/lib/diff)
