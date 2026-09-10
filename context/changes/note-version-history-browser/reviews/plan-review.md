<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Note Version History Browser

- **Plan**: `context/changes/note-version-history-browser/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-10
- **Verdict**: SOUND
- **Findings**: 0 pending (1 critical fixed, 3 warnings fixed, 2 observations fixed)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS ✅ |
| Lean Execution | PASS ✅ |
| Architectural Fitness | PASS ✅ |
| Blind Spots | PASS ✅ |
| Plan Completeness | PASS ✅ |

## Grounding
Grounding: 6/6 paths ✓, 4/4 symbols ✓, brief↔plan ✓

## Findings

### F1 — Progress Format Mechanical Contract Violation

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Progress Section & Phase Headings (plan.md:189-247, 275-282)
- **Detail**: The plan's `## Progress` block uses 5 unstructured checkboxes without subsections or numbered step IDs, and the body phases use H3 headings (`### Phase N`) missing `#### Automated Verification` and `#### Manual Verification` criteria. Tooling such as `/10x-implement` requires the canonical Progress format (`### Phase N`, `#### Automated`/`#### Manual`, `- [ ] N.M <title>`) and will fail to parse or track this plan.
- **Fix**: Restructure plan phase headings to H2 (`## Phase N`), add explicit `#### Automated Verification:` and `#### Manual Verification:` subsections with numbered criteria to each phase, and rewrite the `## Progress` section with matching `N.M` step IDs.
- **Decision**: FIXED (Fixed via Fix in plan)

### F2 — Canvas and Editor Layout Conflict During Snapshot Preview

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 4 (plan.md:170-179, 224-237) & NoteEditor.tsx:200-282
- **Detail**: NoteEditor renders an active EditorToolbar, an editable title TextField, and the textarea canvas. The plan specifies that NoteVersionPreview replaces only the textarea canvas while displaying historical title and diff. This creates an inconsistent UI state: the user sees an editable live title input and active Save button above a read-only historical preview banner displaying a second, different title.
- **Fix A ⭐ Recommended**: Have NoteVersionPreview replace the entire card body (both title TextField and textarea) and put EditorToolbar into preview mode.
  - Strength: Clean, single-purpose read-only surface; completely prevents accidental title edits and unintended draft saves during preview.
  - Tradeoff: Requires a conditional render branch in NoteEditor wrapping the title and canvas.
  - Confidence: HIGH — matches existing modal and viewer patterns in Scytala.
  - Blind spot: Ensure responsive margins on mobile match the editor canvas.
- **Fix B**: Keep title TextField and EditorToolbar visible but set disabled on inputs and controls during preview.
  - Strength: Minimizes layout branching in NoteEditor.tsx.
  - Tradeoff: Shows the live note's title in the input box even when viewing a historical version with a different title.
  - Confidence: MEDIUM — visual hierarchy remains confusing if title changed.
- **Decision**: FIXED (Fixed via Fix A)

### F3 — LineNumberGutter Desynchronization During Inline Word Diffing

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4 (plan.md:33-34, 178-179, 224-228) & LineNumberGutter.tsx
- **Detail**: LineNumberGutter derives line numbers by counting newline characters in a plain string. When inline diff mode is active (`showDiff === true`), the rendered content contains both deletions (`<del>`) and additions (`<ins>`) with wrapped word tokens. The physical height and line breaks of the diff will not match either the historical or current string's newline count, causing gutter line numbers to desynchronize from lines.
- **Decision**: FIXED (Fixed differently: line-based diff row rendering with synchronized per-line gutter numbers)

### F4 — Restoration UI Feedback Blown Away by Component Key Remount

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 4 (plan.md:235) & NoteEditorPage (src/app/dashboard/[hash]/note/[noteId]/page.tsx:83)
- **Detail**: The plan specifies that restoring a version reloads the note at $v_{N+1}$ and displays a success alert. In page.tsx:83, NoteEditor is mounted with `key={`${note.id}-${note.version}`}`. When `router.refresh()` executes after restore, Next.js updates `note.version`, causing React to completely unmount and remount NoteEditor. Any local component state (like a local success alert) will be wiped out immediately upon remounting.
- **Fix A ⭐ Recommended**: Use a transient URL query param (e.g. `?restored=vK`) when refreshing or replacing route, which NoteEditor reads on mount.
  - Strength: Survives component remounts across `router.refresh()` without modifying the key lifecycle pattern in page.tsx.
  - Tradeoff: Requires cleaning up or ignoring the query parameter on next edit.
  - Confidence: HIGH — idiomatic Next.js App Router notification pattern.
  - Blind spot: Ensure `history.replaceState` or `router.replace` cleans the URL.
- **Fix B**: Change page.tsx key to `key={note.id}` and update local React state (title, content, version) directly upon restore without unmounting NoteEditor.
  - Strength: Pure React state without URL query parameters.
  - Tradeoff: Changes page.tsx and requires NoteEditor to properly synchronize state with incoming server props.
  - Confidence: MEDIUM — risk of stale prop bugs on concurrent reloads.
- **Decision**: FIXED (Accepted state wipe and remount; updated version chip vN+1 and content provide self-evident confirmation)

### F5 — Inconsistent Utility Placement (src/app/.../utils vs src/utils)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 3 (plan.md:130, 211)
- **Detail**: The plan places `diff.ts` at `src/app/dashboard/[hash]/note/[noteId]/utils/diff.ts`. The codebase convention stores shared helpers under `src/utils/` (e.g. `src/utils/clipboard.ts` tested in `src/__tests__/utils/clipboard.test.ts`).
- **Decision**: FIXED (Fixed differently: placed in src/lib/diff.ts and tested in src/__tests__/lib/diff.test.ts)

### F6 — Potential Duplicate "Current (vN)" Row in Version History Drawer

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 (plan.md:30-31, 218-219)
- **Detail**: Database RPCs insert snapshot $vN$ into `note_versions` on every creation and update. Consequently, `getNoteVersions(noteId)` already returns $vN$ as the first element. Rendering a "synthetic current row" plus the fetched list will render version $N$ twice unless `versions[0]` is styled as current or `versions.slice(1)` is used for history.
- **Decision**: FIXED (Fixed in plan: clarified that versions[0] is styled as Current or past history maps versions.slice(1))
