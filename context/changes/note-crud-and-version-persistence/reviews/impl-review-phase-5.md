<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Note CRUD and Version Persistence

- **Plan**: context/changes/note-crud-and-version-persistence/plan.md
- **Scope**: Phase 5 of 6 (Dashboard Integration)
- **Date**: 2026-09-08
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 6 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Automated Verification

- `npx tsc --noEmit`: PASS (exit code 0)
- `npx eslint`: PASS (exit code 0)

## Findings

### F1 — DashboardHeader layout drift & speculative dummy buttons

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Plan Adherence
- **Location**: src/app/dashboard/[hash]/components/DashboardHeader.tsx:185-330
- **Detail**: The plan specified adding a "+ New Note" button with `AddIcon` inside the header toolbar `Stack` before the Sync button. Instead, commit `baeea2a` moved note creation into a newly designed "Layer 3: Action buttons toolbar panel" with label "Create note" and `NoteIcon`. Additionally, it introduced 5 disabled speculative buttons for future uncommitted features ("Dashboard settings" in Layer 1, and "Add Directory", "Add File", "Add Image", "Add Survey" in Layer 3).
- **Fix A ⭐ Recommended**: Document the Dashboard Actions panel and speculative buttons in `plan.md` as an addendum and keep the layout.
  - Strength: Preserves the visual design and UI polish without reverting completed layout work.
  - Tradeoff: S-03 scope expands to include speculative UI placeholders for unbuilt features.
  - Confidence: HIGH — follows the precedent set in Phase 4 addendum F4.
  - Blind spot: None.
- **Fix B**: Align strictly with Phase 5 plan: move "+ New Note" into the top toolbar stack before Sync, and remove Layer 3 and the speculative buttons.
  - Strength: Isolates S-03 strictly to note functionality and removes dead UI clutter.
  - Tradeoff: Reverts the expanded dashboard actions panel; requires updating `DashboardComponents.test.tsx`.
  - Confidence: HIGH — simple, clean refactor matching the original plan specification.
  - Blind spot: Will need to re-introduce action buttons in future slices when those features are built.
- **Decision**: FIXED (Fix A: documented in plan addendum)

### F2 — Unplanned NoteEditorHeader and ConfirmationDialog components

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: src/app/dashboard/[hash]/note/[noteId]/components/NoteEditorHeader.tsx:1, src/components/ConfirmationDialog.tsx:1
- **Detail**: Neither `NoteEditorHeader` nor a generic `ConfirmationDialog` were scheduled in the Phase 5 plan (or anywhere in `plan.md`). `NoteEditorHeader` introduces speculative disabled buttons ("Note history", "Contributors") for future slices, and `ConfirmationDialog` was introduced to replace `window.confirm` in `EditorToolbar.tsx`.
- **Fix A ⭐ Recommended**: Document `NoteEditorHeader` and `ConfirmationDialog` in `plan.md` as an addendum and keep both components.
  - Strength: Retains the improved user affordance (user nameplate, logout, accessible modal confirmation on dirty navigation).
  - Tradeoff: Carries speculative buttons for S-04 history and contributors features.
  - Confidence: HIGH — both components are functional and tested.
  - Blind spot: None.
- **Fix B**: Remove speculative buttons ("Note history", "Contributors") from `NoteEditorHeader`, keeping the user alias chip, Logout button, and `ConfirmationDialog`.
  - Strength: Keeps the valuable UX improvement (user nameplate, logout, accessible modal dialog) while removing misleading dummy buttons.
  - Tradeoff: Requires minor edit to `NoteEditorHeader.tsx` and its test suite.
  - Confidence: HIGH — pragmatic middle ground between scope discipline and UX quality.
  - Blind spot: None.
- **Decision**: FIXED (Fix A: documented in plan addendum)

### F3 — Dead navigation fallback `href="#"` and optional `dashboardHash` in DashboardHeader

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/dashboard/[hash]/components/DashboardHeader.tsx:25, 250
- **Detail**: `DashboardHeaderProps` declares `dashboardHash?: string` as optional, causing the Create Note button to fall back to `href="#"`. In Next.js App Router, `href="#"` mutates the browser URL and scrolls to the top instead of navigating. In contrast, all other Phase 5 components (`DashboardView`, `NoteGrid`, `NoteTile`, `EmptyNotesState`) require `dashboardHash: string`.
- **Fix**: Make `dashboardHash: string` required in `DashboardHeaderProps`, remove the `href="#"` fallback, and ensure `dashboardHash` is passed in tests.
- **Decision**: FIXED (Fix now)

### F4 — CSS mask-image causes GPU compositing overhead and masks line-clamp ellipsis

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/dashboard/[hash]/components/NoteTile.tsx:98-103
- **Detail**: `NoteTile.tsx` applies a dynamic vertical gradient mask (`maskImage: linear-gradient(...)`) when note content is estimated to overflow. This forces browsers to allocate an off-screen composited layer per card on grid rendering. Furthermore, fading the bottom 40% to transparent renders the 5th line and the native `-webkit-line-clamp` ellipsis at 0% opacity, rendering the ellipsis invisible.
- **Fix**: Remove `maskImage` and `WebkitMaskImage` from `NoteTile.tsx`, relying exclusively on standard hardware-accelerated `-webkit-line-clamp: 5` and ellipsis.
- **Decision**: FIXED (Fix now)

### F5 — Note tile Link wrapper lacks accessible name (WCAG 2.4.4 / 4.1.2)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/dashboard/[hash]/components/NoteTile.tsx:28
- **Detail**: `NoteTile` wraps the entire `<Card component="article">` inside Next.js `<Link>`. Without an `aria-label`, screen readers calculate the link's accessible name by concatenating all child text nodes (title, full body content, version chip, formatted date). This results in excessively verbose and disorienting link labels in assistive navigation rotors.
- **Fix**: Add `aria-label={`Open note: ${displayTitle}`}` to the `<Link>` wrapper in `NoteTile.tsx`.
- **Decision**: FIXED (Fix now)

### F6 — Static hardcoded ARIA IDs in ConfirmationDialog risk duplicate ID collisions

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/ConfirmationDialog.tsx:43-44, 56, 60
- **Detail**: `ConfirmationDialog` uses static string literals `id="confirmation-dialog-title"` and `id="confirmation-dialog-description"`. As a shared component, if multiple dialogs are mounted, duplicate DOM IDs are created, violating HTML/WCAG specifications and causing screen readers to misassociate dialog headers.
- **Fix**: Replace static IDs with React's `useId()` hook (`const titleId = useId(); const descId = useId();`).
- **Decision**: FIXED (Fix now)

### F7 — Destructive "Leave" confirmation in EditorToolbar uses primary affirmative styling

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/dashboard/[hash]/note/[noteId]/components/EditorToolbar.tsx:145
- **Detail**: The leave confirmation dialog warns that unsaved edits will be discarded. The confirm action ("Leave") currently defaults to `confirmColor="primary"`. Actions resulting in data loss should use warning or error color cues to prevent accidental clicks.
- **Fix**: Pass `confirmColor="warning"` (or `confirmColor="error"`) to `<ConfirmationDialog>` in `EditorToolbar.tsx`.
- **Decision**: FIXED (Fix now)

### F8 — Hardcoded font family string bypassing theme typography tokens

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Location**: src/app/dashboard/[hash]/components/DashboardHeader.tsx:166, 226
- **Detail**: `DashboardHeader.tsx` explicitly hardcodes `fontFamily: '"IM Fell English", Georgia, serif'` in `sx` props for the dashboard title and the "Dashboard Actions" label instead of relying on theme typography tokens (`theme.typography.h1`).
- **Fix**: Remove explicit `fontFamily` from `h1` (already set by theme) and reference the theme typography token for custom header labels.
- **Decision**: FIXED (Fix now)

### F9 — ConfirmationDialog lacks loading/disabled states for async operations

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/ConfirmationDialog.tsx:10-26
- **Detail**: Unlike `DeleteNoteDialog`, `ConfirmationDialogProps` lacks `loading?: boolean` or `disabled?: boolean` props. If `onConfirm` initiates an async operation, the user can repeatedly click confirm before completion.
- **Fix**: Add optional `loading?: boolean` and `disabled?: boolean` props to `ConfirmationDialogProps`, disabling buttons and showing a spinner when loading.
- **Decision**: FIXED (Fix now)
