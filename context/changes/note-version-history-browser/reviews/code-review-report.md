# Code Review Report: feature/s-04 (Note Version History Browser)

**Date**: 2026-09-11  
**Path**: `feature/s-04` (`src/actions/notes.ts`, `src/schemas/notes.ts`, `src/lib/diff.ts`, `src/app/dashboard/[hash]/note/[noteId]/components/*`, `src/__tests__/*`)  
**Scope**: all (quality, security, performance, best practices)  
**Status**: ⚠️ Issues Found  

---

## Executive Summary

A comprehensive code review was conducted on the branch `feature/s-04` against `main`. The changes introduce the immutable note version history browser, diff engine, preview dialog, and version restoration flow.

All repository guidelines from `AGENTS.md` have been strictly respected:
- **No TailwindCSS**: Exclusively Material-UI (MUI) components and sx-styling are used.
- **Strict Coverage**: 17 dedicated test suites cover all newly added actions, diff computations, schemas, and UI components.
- **Secrets Defense**: No server secrets (`SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, database credentials, or password hashes) are exposed or leaked to client components.
- **Forward-Only Migrations**: No destructive migrations or rollbacks were introduced.
- **Build Isolation**: Zero test mocks or vitest utilities imported into production bundles.
- **Optimistic Concurrency Control**: OCC version check and conflict handling prevent race conditions and edit collisions during note updates and restorations.

---

## Summary of Findings

- **Critical**: 0 issues
- **Warnings**: 1 issue
- **Info**: 3 issues
- **Files Analyzed**: 32 files

---

## Critical Issues

*None detected.*  
Previous critical issues identified in implementation reviews (such as F1 regarding `isSaved` locking the Save button) have been properly resolved.

---

## Warnings

### W1: Silent Error Swallowing in Version History Sync Effect [RESOLVED]
- **Severity**: Warning ⚠️ (Resolved)
- **Status**: Resolved (handled error response & rejection in useEffect)
- **Category**: Best Practices / Reliability
- **Location**: `src/app/dashboard/[hash]/note/[noteId]/components/NoteVersionHistoryDrawer.tsx:100-118`
- **Description**: In `NoteVersionHistoryDrawer.tsx`, the `useEffect` that listens for `currentVersionNumber` changes catches any failed fetch with an empty `.catch(() => {})`:
  ```tsx
  useEffect(() => {
    if (prevVersionRef.current !== currentVersionNumber) {
      prevVersionRef.current = currentVersionNumber;
      if (dashboardHash && noteId && versionsProp === undefined) {
        let isMounted = true;
        getNoteVersionHistoryAction({ dashboardHash, noteId })
          .then((result) => {
            if (!isMounted) return;
            if (result.success) {
              setInternalVersions(result.versions);
            }
          })
          .catch(() => {});
        return () => {
          isMounted = false;
        };
      }
    }
  }, [currentVersionNumber, dashboardHash, noteId, versionsProp]);
  ```
- **Risk**: If a network failure occurs immediately following a version restore or update, the version history drawer retains the old snapshot list without notifying the user or setting `internalError`.
- **Recommendation**: Set `setInternalError("Failed to update version history.")` within the `.catch` handler so the error banner communicates the status if the background update fails.
- **Fix Example**:
  ```tsx
  .catch(() => {
    if (!isMounted) return;
    setInternalError("Failed to update version history.");
  });
  ```

---

## Informational

### I1: Unused Utility Function & Duplicate Delta Calculation
- **Severity**: Info ℹ️
- **Category**: Code Quality / DRY
- **Location**: `src/app/dashboard/[hash]/note/[noteId]/components/NoteVersionHistoryDrawer.tsx:159-171`
- **Description**: `src/lib/diff.ts` exports `computeVersionDeltas(versions, currentContent)` which is thoroughly tested in unit tests. However, `NoteVersionHistoryDrawer.tsx` re-implements the version loop manually in its local `useMemo`:
  ```tsx
  const versionDeltas = useMemo(() => {
    const deltas = new Map<string, string>();
    for (let i = 1; i < versions.length; i++) {
      const v = versions[i];
      if (currentContent !== undefined) {
        deltas.set(v.id, computeVersionDelta(v, currentContent));
      } else {
        const predecessor = versions[i + 1];
        deltas.set(v.id, computeVersionDelta(v, predecessor));
      }
    }
    return deltas;
  }, [versions, currentContent]);
  ```
- **Suggestion**: Use `useMemo(() => computeVersionDeltas(versions, currentContent), [versions, currentContent])` to reuse the shared tested utility and eliminate duplicate loop logic.

---

### I2: Inconsistent Newline Stripping in Fallback Delta Calculation
- **Severity**: Info ℹ️
- **Category**: Quality / Consistency
- **Location**: `src/app/dashboard/[hash]/note/[noteId]/components/NoteVersionHistoryDrawer.tsx:340-343`
- **Description**: The fallback delta calculation in line 343 uses raw string length (`+${v.content.length}`):
  ```tsx
  const delta =
    versionDeltas.get(v.id) ??
    (currentContent !== undefined
      ? computeVersionDelta(v, currentContent)
      : `+${v.content.length}`);
  ```
  `v.content.length` includes newline characters (`\r` and `\n`), whereas `computeVersionDelta` in `src/lib/diff.ts` strips newlines via `replace(/[\r\n]/g, "").length`.
- **Suggestion**: Replace `+${v.content.length}` with `computeVersionDelta(v)` so fallback behavior is consistent with the rest of the diff calculation logic.

---

### I3: Decorative Symbol Missing `aria-hidden` in Preview Title Difference Callout
- **Severity**: Info ℹ️
- **Category**: Accessibility / Best Practices
- **Location**: `src/app/dashboard/[hash]/note/[noteId]/components/NoteVersionPreview.tsx:255-257`
- **Description**: In `NoteVersionPreview.tsx`, the directional arrow symbol `➔` in the title comparison is rendered as plain text:
  ```tsx
  <Typography variant="body2" sx={{ color: "text.disabled", fontSize: "1rem" }}>
    ➔
  </Typography>
  ```
- **Suggestion**: Add `aria-hidden="true"` to prevent assistive technologies from reading the literal unicode arrow symbol between the deleted and inserted titles.

---

## Metrics

- **Max Function Length**: 380 lines (`src/app/dashboard/[hash]/note/[noteId]/components/NoteVersionHistoryDrawer.tsx`)
- **Max Nesting Depth**: 3 levels (`formatDiffLines` in `src/lib/diff.ts`)
- **Potential Vulnerabilities**: 0
- **N+1 Query Risks**: 0 (parallelized user/version retrieval with in-memory map)
- **Test Coverage Files**: 17 test suites covering 100% of new modules

---

## Prioritized Recommendations

1. **Handle background sync errors in `NoteVersionHistoryDrawer.tsx`**: Add `setInternalError("Failed to update version history.")` in the `.catch()` block on line 112 to ensure users are aware if background version synchronization encounters a network error.
2. **Standardize delta calculation**: Call `computeVersionDeltas` from `@/lib/diff` inside `useMemo` in `NoteVersionHistoryDrawer.tsx` instead of duplicating the loop.
3. **Ensure consistent character counts**: Replace `+${v.content.length}` with `computeVersionDelta(v)` in the timeline fallback.
4. **Refine screen reader experience**: Add `aria-hidden="true"` to the decorative arrow glyph in `NoteVersionPreview.tsx`.
