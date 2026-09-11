# Specification Audit: Note Version History Browser (S-04)

**Audit Target**: [`plan.md`](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/plan.md)  
**Related Artifacts**: [`plan-brief.md`](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/plan-brief.md), [`research.md`](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/research.md), [`plan-review.md`](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/reviews/plan-review.md)  
**Auditor**: Specification Auditor (Senior Auditor Perspective)  
**Audit Date**: 2026-09-10  
**Audit Stage**: Pre-Implementation Specification Verification  
**Compliance Verdict**: ⚠️ **Mostly Compliant**

---

## Executive Summary

An independent specification audit of the technical plan for **S-04: Note Version History Browser** ([`plan.md`](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/plan.md)) was conducted.

### Verification of Implementation Status
1. **Pre-Implementation Confirmation**: An independent inspection of the codebase confirms that **no implementation code has been written yet**:
   - `diff` and `@types/diff` are absent from [`package.json`](file:///home/projekty/10xdevs/scytala/package.json#L19-L51).
   - `HydratedNoteVersion` and `getNoteVersionHistorySchema` are absent from [`notes.ts`](file:///home/projekty/10xdevs/scytala/src/schemas/notes.ts).
   - `getNoteVersionHistoryAction` is absent from [`notes.ts`](file:///home/projekty/10xdevs/scytala/src/actions/notes.ts).
   - `src/lib/diff.ts` does not exist.
   - UI components `NoteVersionHistoryDrawer.tsx` and `NoteVersionPreview.tsx` do not exist.
   - [`NoteEditorHeader.tsx`](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/note/[noteId]/components/NoteEditorHeader.tsx#L26-L47) maintains the placeholder disabled button with tooltip `"Note history coming soon"`.
2. **Overall Architectural Quality**: The plan demonstrates strong adherence to core Scytala constraints: forward-only database migration policy (zero new migrations), client-side diff computation to protect Cloudflare Edge worker CPU budgets, optimistic concurrency control integration, session authentication guards with cross-tenant isolation, and adherence to the strict ≥80% test coverage threshold.
3. **Key Gaps Requiring Resolution**:
   - **1 High-Severity Gap**: Missing algorithm and data structure specifications for line-based diff row rendering with synchronized line gutters (addressing Finding F3 from plan review).
   - **3 Medium-Severity Gaps**: Mobile layout obstruction where a full-width (`100vw`) drawer hides the canvas snapshot preview; unspecified baseline for timeline character delta summaries (`+X / -Y`); and missing TypeScript props interfaces for the new UI components.
   - **4 Low-Severity Gaps**: Ambiguity in diff target when unsaved dirty editor drafts exist; omitted WCAG AA screen reader / text contrast attributes; imprecise dependency placement in `package.json`; and interaction semantics when clicking the "Current (vN)" item.

---

## Compliance Scorecard

| Dimension | Status | Notes |
|---|---|---|
| **PRD & Roadmap Alignment (US-05, FR-011)** | ✅ Compliant | Fully satisfies history browsing, snapshot viewing, and non-destructive restoration. |
| **Architectural & Framework Constraints** | ✅ Compliant | Next.js 16 App Router Server Actions, pure React 19, strict MUI theme compliance (no Tailwind). |
| **Security & Tenant Isolation** | ✅ Compliant | Enforces session verification, cross-tenant note boundary check, and rate limit error propagation. |
| **Database & Migration Policy** | ✅ Compliant | Zero schema migrations; author resolution is handled strictly in-memory via `listDashboardUsers`. |
| **Edge Compute & Performance** | ✅ Compliant | Client-side diffing inside `useMemo` protects Cloudflare Workers CPU time. |
| **Diff Engine Completeness** | ⚠️ Mostly Compliant | Word diff is specified, but line splitting and gutter synchronization lack implementation details. |
| **Mobile & Responsive UX** | ⚠️ Mostly Compliant | Full-width mobile drawer obstructs the underlying canvas preview. |
| **Component Contracts & Interfaces** | ⚠️ Mostly Compliant | Missing explicit props signatures for `NoteVersionHistoryDrawer` and `NoteVersionPreview`. |
| **Verification & Quality Gates** | ✅ Compliant | 5-phase plan with automated criteria enforcing the strict ≥80% test coverage threshold. |

---

## Detailed Findings

### Finding 1: Line-based Diff Rendering & Gutter Synchronization Missing Implementation Details
- **Category**: Incomplete / Ambiguous
- **Severity**: 🔴 **High**
- **Specification Reference**: [`plan.md:179-180`](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/plan.md#L179-L180), [`plan.md:249`](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/plan.md#L249), and Review Finding F3 in [`plan-review.md:53-60`](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/reviews/plan-review.md#L53-L60).
- **Codebase Evidence**:
  - `src/lib/diff.ts` in [`plan.md:130-157`](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/plan.md#L130-L157) defines only `computeNoteWordDiff`, which returns raw `WordDiffToken[]` from `diffWordsWithSpace`.
  - Existing [`LineNumberGutter.tsx:18-28`](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/note/[noteId]/components/LineNumberGutter.tsx#L18-L28) calculates line numbers by counting `\n` in a plain text string:
    ```tsx
    for (let i = 0; i < content.length; i++) {
      if (content.charCodeAt(i) === 10) lineCount++;
    }
    ```
    It has no support for diff token streams, added/removed line indicators, or structured diff rows.
- **Discrepancy & Risk**: In [`plan-review.md:60`](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/reviews/plan-review.md#L60), Finding F3 noted that word diffing desynchronizes the line gutter, marked as fixed via *"line-based diff row rendering with synchronized per-line gutter numbers"*. However, `diffWordsWithSpace` produces tokens that can span multiple lines or contain newlines. The plan provides zero data structures, functions, or specifications explaining:
  1. How `WordDiffToken[]` is split across newline boundaries into line rows.
  2. How line numbers are assigned to diff rows (e.g. does a deleted line increment the counter? Is there dual numbering for old vs new?).
  3. How `<LineNumberGutter>` or an alternative gutter component aligns with diff rows.
- **Recommendation**: In `src/lib/diff.ts`, specify a helper function such as `formatDiffLines(tokens: WordDiffToken[]): DiffLineRow[]` where each `DiffLineRow` contains `{ lineNumber?: number; type: "normal" | "add" | "delete" | "modify"; tokens: WordDiffToken[] }`, and specify the rendering structure in `NoteVersionPreview.tsx`.

---

### Finding 2: Mobile UX Layout Conflict — 100vw Drawer Obstructs Canvas Preview
- **Category**: Incomplete / Ambiguous
- **Severity**: 🟡 **Medium**
- **Specification Reference**: [`plan.md:166`](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/plan.md#L166) ("responsive width: 380px on desktop, 100vw on mobile") and [`plan.md:171`](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/plan.md#L171) ("Replaces the entire active editor card body... when a historical snapshot is selected").
- **Codebase Evidence**:
  - `NoteEditor.tsx` renders the card body in the main page flow ([`NoteEditor.tsx:188-288`](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/note/[noteId]/components/NoteEditor.tsx#L188-L288)).
  - On desktop, an anchor="right" drawer of 380px leaves room for the editor card on the left.
  - On mobile (<600px), a `100vw` MUI Drawer covers 100% of the screen.
- **Discrepancy & Risk**: When a mobile user opens the history drawer and taps a historical version to preview it, the preview is rendered in the card body behind the drawer. Because the drawer covers `100vw`, the user cannot see the preview they just tapped unless the drawer closes. Furthermore, if the drawer closes, the user has no way to pick another version without reopening the drawer from the header.
- **Recommendation**: Explicitly specify mobile drawer behavior:
  - When a version is selected on mobile, auto-close the drawer so the user immediately views `NoteVersionPreview`.
  - In `NoteVersionPreview`, add a button *"Switch version"* on mobile that reopens the drawer.

---

### Finding 3: Ambiguity in Timeline Character Delta (`+X / -Y`) Baseline and Computation
- **Category**: Ambiguous
- **Severity**: 🟡 **Medium**
- **Specification Reference**: [`plan.md:31`](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/plan.md#L31) ("displaying version chip, relative timestamp ... and character delta summary (`+X / -Y`)"), [`plan.md:148-156`](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/plan.md#L148-L156) (`summarizeDiff`), and [`plan.md:232`](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/plan.md#L232).
- **Codebase Evidence**:
  - `HydratedNoteVersion` in [`plan.md:89-98`](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/plan.md#L89-L98) has no delta fields (`addedChars`, `removedChars`).
  - Delta must therefore be calculated client-side.
- **Discrepancy & Risk**:
  1. **Comparison baseline unspecified**: In version control (Git), a commit's delta (`+X / -Y`) is relative to its *immediate predecessor* ($v_{k-1}$). If $v_K$ is compared against $v_{K-1}$, it shows what that author changed in that version. If $v_K$ is instead compared against current ($v_N$), it shows what differs between then and now. The plan does not specify which baseline is used.
  2. **Performance on notes with many versions**: If a note has 40 versions, computing 40 Myers word diffs on drawer mount could consume 150–250ms of client main-thread time.
  3. **Initial version edge case**: For $v_1$ (no predecessor), what should be displayed? (`+Length / -0` or omitted?).
- **Recommendation**: Clarify that each version row $v_K$ computes its delta against predecessor $v_{K-1}$ (with $v_1$ showing `+${v1.content.length}`), and recommend computing deltas lazily or using simple length delta / memoized diff summary.

---

### Finding 4: Missing Component Props Interface & State Ownership Between Components
- **Category**: Missing / Incomplete
- **Severity**: 🟡 **Medium**
- **Specification Reference**: [`plan.md:160-187`](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/plan.md#L160-L187) and [`plan.md:229-234`](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/plan.md#L229-L234).
- **Codebase Evidence**:
  - `NoteEditor.tsx` currently manages form state (`title`, `content`, `isDirty`, `isPending`).
  - While data schemas (`HydratedNoteVersion`, `getNoteVersionHistorySchema`) are explicitly typed in section 1 of the plan, the component prop interfaces for `NoteVersionHistoryDrawer` and `NoteVersionPreview` are omitted.
- **Discrepancy & Risk**:
  - Who owns the `versions: HydratedNoteVersion[]` state? If `NoteVersionHistoryDrawer` fetches and owns it, `NoteEditor` cannot pass the selected version data to `NoteVersionPreview` without callback lifting.
  - If `NoteEditor` owns `versions`, does it fetch on editor mount or lazily when `isHistoryOpen` becomes true?
  - How are loading and error states handled if `getNoteVersionHistoryAction` fails or is throttled?
- **Recommendation**: Define explicit props interfaces in the plan:
  ```ts
  export interface NoteVersionHistoryDrawerProps {
    open: boolean;
    onClose: () => void;
    versions: HydratedNoteVersion[];
    isLoading: boolean;
    error: string | null;
    selectedVersionId: string | null;
    onSelectVersion: (version: HydratedNoteVersion | null) => void;
  }

  export interface NoteVersionPreviewProps {
    selectedVersion: HydratedNoteVersion;
    currentTitle: string;
    currentContent: string;
    onClosePreview: () => void;
    onRestore: (version: HydratedNoteVersion) => void;
    isRestoring: boolean;
  }
  ```

---

### Finding 5: Diff Comparison Target Undefined When Unsaved Editor Draft Exists
- **Category**: Ambiguous
- **Severity**: 🟢 **Low**
- **Specification Reference**: [`plan.md:34`](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/plan.md#L34) ("against the current active note"), [`plan.md:38`](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/plan.md#L38) ("Unsaved dirty edits... safely preserved in state"), and [`plan-brief.md:22`](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/plan-brief.md#L22).
- **Codebase Evidence**: In [`NoteEditor.tsx:43-57`](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/note/[noteId]/components/NoteEditor.tsx#L43-L57), `content` state holds the current working draft. If the user edits without saving, `content !== initialContent`.
- **Discrepancy & Risk**: When "Show changes" is toggled ON, should historical content be diffed against the in-memory draft (`content` in React state) or the persisted database version ($v_N$, `initialContent`)?
  - Diffing against draft shows what will change relative to the user's current unsaved thoughts.
  - Diffing against persisted $v_N$ shows what changed relative to the last saved snapshot.
- **Recommendation**: Specify that the diff is calculated against `content` (the current working editor buffer), because restoring will overwrite the working buffer.

---

### Finding 6: WCAG 2.1 AA Screen Reader & Text Contrast Specifications Omitted from Plan
- **Category**: Incomplete
- **Severity**: 🟢 **Low**
- **Specification Reference**: [`plan.md:180`](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/plan.md#L180) vs [`research.md:151-161`](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/research.md#L151-L161).
- **Codebase Evidence**: `research.md` explicitly required:
  - Dark text colors (`#1b5e20` for `<ins>`, `#b71c1c` for `<del>`) for 4.5:1 contrast against papyrus backgrounds.
  - Semantic `<ins aria-label="Added: ...">` and `<del aria-label="Deleted: ...">`.
  - An `aria-live="polite"` summary announcing addition/deletion counts for screen readers.
- **Discrepancy & Risk**: In `plan.md:180`, only background colors (`rgba(46, 125, 50, 0.15)` and `rgba(211, 47, 47, 0.15)`) are specified. Screen readers do not announce `<ins>` or `<del>` styling by default, and text contrast may fail WCAG AA if dark text color is not explicitly specified.
- **Recommendation**: Incorporate the explicit text colors and `aria-label` / `aria-live` specifications from `research.md` into `plan.md`.

---

### Finding 7: Package Dependency Installation Target Imprecision
- **Category**: Incomplete
- **Severity**: 🟢 **Low**
- **Specification Reference**: [`plan.md:194`](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/plan.md#L194) ("Install `diff` and `@types/diff` as project dependencies in `package.json`").
- **Codebase Evidence**: [`package.json:19-51`](file:///home/projekty/10xdevs/scytala/package.json#L19-L51) strictly separates runtime `dependencies` from TypeScript dev tools in `devDependencies`.
- **Discrepancy & Risk**: `@types/diff` belongs in `devDependencies`, not runtime `dependencies`.
- **Recommendation**: Clarify: `diff` under `dependencies` and `@types/diff` under `devDependencies`.

---

### Finding 8: "Current (vN)" Item Selection Semantics in History Drawer
- **Category**: Ambiguous
- **Severity**: 🟢 **Low**
- **Specification Reference**: [`plan.md:30`](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/plan.md#L30) and [`plan.md:168`](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/plan.md#L168).
- **Discrepancy & Risk**: While Finding F6 in `plan-review.md` clarified that `versions[0]` is styled as the current item, the plan does not define what happens when a user clicks on the "Current (vN)" item while previewing a past version. Does clicking it exit preview mode and return to active edit mode, or does it open a preview of $v_N$ with "Restore" disabled?
- **Recommendation**: Specify that clicking "Current (vN)" in the drawer acts as "Exit preview", restoring the active editor canvas.

---

## Stakeholder Clarification Questions

1. **Line-Based Diff & Gutter Rendering (Finding 1)**:  
   *Question*: Should `src/lib/diff.ts` export a `formatDiffLines(tokens: WordDiffToken[])` utility that segments word diff tokens into line rows with synchronized line numbers, or should line numbering be hidden during diff view in favor of an inline token flow?  
   *Recommended default*: Export `formatDiffLines` in `src/lib/diff.ts` returning structured line rows with line numbers to ensure gutters remain aligned with text rows.

2. **Mobile Drawer & Preview Interaction (Finding 2)**:  
   *Question*: When a user taps a version in the drawer on mobile (`<600px`), should the drawer automatically close to reveal the snapshot preview canvas, with a "Switch version" button on the preview toolbar to reopen the drawer?  
   *Recommended default*: Yes, auto-close on selection on mobile with a button in `NoteVersionPreview` to reopen the drawer.

3. **Character Delta Baseline in Drawer List (Finding 3)**:  
   *Question*: In the history timeline rows, is the `+X / -Y` delta summary computed relative to the previous version ($v_{K-1}$) or relative to current state ($v_N$)?  
   *Recommended default*: Compare against immediate predecessor $v_{K-1}$ (commit delta model), with $v_1$ displaying initial creation length (`+${v1.content.length}`).

4. **Diff Comparison Against Unsaved Drafts (Finding 5)**:  
   *Question*: When a note has unsaved changes in the editor, does the inline diff compare past versions against the uncommitted editor draft or the last committed snapshot?  
   *Recommended default*: Compare against the active editor draft (`content` in state), directly showing what would change if the restore overwrites the current working state.

---

## Actionable Recommendations for Plan Remediation

1. **Update Phase 3 & 4 in [`plan.md`](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/plan.md)**:
   - Add `formatDiffLines` to `src/lib/diff.ts` in Section 3 of Critical Implementation Details.
   - Define TypeScript props for `NoteVersionHistoryDrawer` and `NoteVersionPreview`.
   - Specify state ownership: `NoteEditor` holds `versions: HydratedNoteVersion[]`, fetching lazily on first open of history.
2. **Update Mobile Responsiveness Specification**:
   - Add explicit auto-close and switch-version interactions for viewports `<600px`.
