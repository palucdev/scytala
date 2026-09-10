<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Note CRUD and Version Persistence

- **Plan**: context/changes/note-crud-and-version-persistence/plan.md
- **Scope**: Phase 4 of 6
- **Date**: 2026-09-08
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Fragile transition logic: calling guarded handleClose() inside active transition on success

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/dashboard/[hash]/note/[noteId]/components/DeleteNoteDialog.tsx:58
- **Detail**: `handleClose()` begins with `if (isPending) return;`. On deletion success inside `startTransition(async () => { ... })`, the component invokes `handleClose()`. This currently succeeds only because `handleConfirm` holds a stale closure with `isPending === false`. If `handleClose` is refactored (e.g. wrapped in `useCallback` or reading fresh state), it will hit the pending guard and silently abort, leaving the dialog open on success.
- **Fix**: Reset state directly and call `onClose()` on success instead of invoking the guarded `handleClose()`:
  ```ts
  if (result.success) {
    setPassword("");
    setError(null);
    onClose();
    router.replace(`/dashboard/${dashboardHash}`);
    router.refresh();
  }
  ```
- **Decision**: FIXED (Fix now)

### F2 — Password and error state retained when dialog is dismissed or closed externally

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/dashboard/[hash]/note/[noteId]/components/DeleteNoteDialog.tsx:35
- **Detail**: `DeleteNoteDialog` stays mounted in `NoteEditor` whenever `mode === "edit" && noteId`. State (`password` and `error`) is only reset when internal `handleClose()` runs. If the parent resets `deleteDialogOpen = false` externally or the dialog closes through other channels, sensitive plain-text password input remains in memory in component state.
- **Fix**: Add a `useEffect` hook to clear `password` and `error` whenever `open` becomes `false`:
  ```ts
  useEffect(() => {
    if (!open) {
      setPassword("");
      setError(null);
    }
  }, [open]);
  ```
- **Decision**: FIXED (Fix differently: conditionally unmount in NoteEditor)

### F3 — Accessible name mismatch on password input (WCAG 2.5.3 violation)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/dashboard/[hash]/note/[noteId]/components/DeleteNoteDialog.tsx:113
- **Detail**: `TextField` has visible label `label="User Password"`, but defines `slotProps={{ htmlInput: { "aria-label": "User password confirmation" } }}`. Under WCAG 2.5.3 (Label in Name), the accessible name must contain the text presented visually. Speech recognition navigation tools targeting "User Password" will fail.
- **Fix**: Align `aria-label` to `"User Password"` (matching `LoginForm.tsx`) or remove `aria-label` so MUI's generated label association takes precedence.
- **Decision**: FIXED (Fix now)

### F4 — Unplanned button size adjustments across dashboard components

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/app/dashboard/[hash]/components/DashboardHeader.tsx:98
- **Detail**: In addition to planned Phase 4 changes (`DeleteNoteDialog` and `NoteEditor`), commit `748e68e` modified `DashboardHeader.tsx` and `LogoutButton.tsx` to align button and icon sizes from `small` to `medium`. While visually beneficial, these modifications fall outside Phase 4 scope.
- **Fix A ⭐ Recommended**: Document this UI alignment in the plan as an addendum and keep the change.
  - Strength: Normalizes button and icon sizing across dashboard and note views consistently.
  - Tradeoff: Slight scope expansion beyond Phase 4 boundary.
  - Confidence: HIGH — purely visual styling polish with passing tests.
  - Blind spot: None.
- **Fix B**: Revert changes in `DashboardHeader.tsx` and `LogoutButton.tsx` and schedule for Phase 5.
  - Strength: Keeps Phase 4 scope strictly isolated.
  - Tradeoff: Temporarily re-introduces visual size discrepancies across views.
  - Confidence: HIGH — trivial revert.
  - Blind spot: None.
- **Decision**: FIXED (Fix A: documented in plan addendum)

### F5 — Instructional prompt displayed in red error color before user interaction

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/dashboard/[hash]/note/[noteId]/components/DeleteNoteDialog.tsx:100
- **Detail**: `<Typography color="error">Please enter your user password to confirm deletion.</Typography>` renders standard instruction text in error red upon dialog opening, giving the false impression of an active validation error before typing.
- **Fix**: Change `color="error"` to `color="text.secondary"` with `variant="body2"` and bottom margin.
- **Decision**: SKIPPED

### F6 — TextField does not reflect error state styling on failure

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/dashboard/[hash]/note/[noteId]/components/DeleteNoteDialog.tsx:109
- **Detail**: In `LoginForm.tsx` and `NoteEditor.tsx`, input fields set `error={Boolean(error)}` to outline the input in red and expose `aria-invalid="true"`. `DeleteNoteDialog` displays the `<Alert severity="error">` but leaves the `TextField` in default neutral styling.
- **Fix**: Pass `error={Boolean(error)}` to the password `TextField`.
- **Decision**: FIXED (Fix now)

### F7 — Missing form wrapper for mobile virtual keyboard submission

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/dashboard/[hash]/note/[noteId]/components/DeleteNoteDialog.tsx:119
- **Detail**: Dialog submission is handled via `onKeyDown` on `TextField` and `onClick` on Delete button rather than a native `<form onSubmit={...}>` with `<Button type="submit">`. On mobile devices (iOS/Android), the soft keyboard "Go" action may not trigger submission.
- **Fix**: Wrap dialog content/actions in a `<Box component="form" onSubmit={...}>` with `<Button type="submit">` (similar to `LoginForm.tsx`).
- **Decision**: FIXED (Fix now)

### F8 — History stack retention: router.push vs router.replace on note deletion

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/dashboard/[hash]/note/[noteId]/components/DeleteNoteDialog.tsx:60
- **Detail**: When a note is deleted, `router.push('/dashboard/' + dashboardHash)` leaves the deleted note's URL in the browser's navigation history. Hitting the browser Back button navigates to a non-existent route.
- **Fix**: Use `router.replace('/dashboard/' + dashboardHash)` instead of `router.push`.
- **Decision**: FIXED (Fix now)

### F9 — Import ordering in DeleteNoteDialog.tsx

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/dashboard/[hash]/note/[noteId]/components/DeleteNoteDialog.tsx:16
- **Detail**: `Typography` is imported after `@/actions/notes` on line 17 rather than grouped with the `@mui/material` imports on lines 5–13.
- **Fix**: Move `Typography` import up with the rest of `@mui/material` imports.
- **Decision**: FIXED (Fix now)
