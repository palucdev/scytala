<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Note CRUD and Version Persistence

- **Plan**: context/changes/note-crud-and-version-persistence/plan.md
- **Scope**: Phase 3 of 6
- **Date**: 2026-09-08
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 6 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Line numbers desynchronize with content due to textarea word wrap

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/dashboard/[hash]/note/[noteId]/components/NoteEditor.tsx:214
- **Detail**: HTML `<textarea>` enables soft word wrapping by default. In contrast, `LineNumberGutter` computes lines strictly by newline characters (`content.split("\n")`). When long lines wrap across visual rows, line numbers immediately desynchronize vertically from actual text.
- **Fix**: Add `wrap="off"` and `sx={{ whiteSpace: "pre", overflowX: "auto" }}` to `<Box component="textarea">` in `NoteEditor.tsx`.
- **Decision**: FIXED (Fix now)

### F2 — Severe typing latency and rendering bottleneck in line number gutter

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/app/dashboard/[hash]/note/[noteId]/components/LineNumberGutter.tsx:43
- **Detail**: On every keystroke, `LineNumberGutter` allocates an array and renders `lineCount` individual MUI `Typography` components with Emotion style objects. For long notes, creating hundreds of DOM/Emotion nodes on each character causes input latency and frame drops.
- **Fix A ⭐ Recommended**: Render a single `<Box component="pre">` with joined line numbers (`lineNumbers.join("\n")`) and memoize `LineNumberGutter`.
  - Strength: Replaces hundreds/thousands of React and Emotion nodes with a single text node while keeping exact monospace line alignment.
  - Tradeoff: Minor internal markup change inside the gutter component.
  - Confidence: HIGH — established high-performance pattern for plain text line gutters.
  - Blind spot: None significant.
- **Fix B**: Virtualize the line numbers based on scroll position and viewport height.
  - Strength: Completely bounds DOM elements regardless of document length.
  - Tradeoff: Adds scroll calculation complexity and state tracking for an MVP capped at 10,000 characters.
  - Confidence: MEDIUM — more complex than necessary for current content bounds.
  - Blind spot: Might cause scroll desynchronization artifacts without a full virtualization library.
- **Decision**: FIXED (Fix A)

### F3 — Content textarea lacks maxLength constraint

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/dashboard/[hash]/note/[noteId]/components/NoteEditor.tsx:214
- **Detail**: While the title input enforces `maxLength: 200` and Zod enforces `max(10000)` on submit, the `<textarea>` has no client-side `maxLength`. Pasting large text (e.g. 50,000+ characters) loads unconstrained text into state and locks up the gutter renderer before submission.
- **Fix**: Add `maxLength={10000}` directly to the `<Box component="textarea">` element in `NoteEditor.tsx`.
- **Decision**: FIXED (Fix now with component constants)

### F4 — False version conflict on subsequent save during route transition

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/dashboard/[hash]/note/[noteId]/components/NoteEditor.tsx:46
- **Detail**: `isDirty` is derived from `title` and `content` compared against initial props. When `handleSave` succeeds, `router.push()` begins navigating, but `isDirty` remains true and the Save button re-enables. Clicking Save again submits the old `expectedVersion` against now-incremented DB state, triggering an alarming false version conflict alert.
- **Fix**: Introduce local `isSaved` state set to `true` upon `result.success`, disabling the Save button when `isSaving || isSaved`.
- **Decision**: FIXED (Fix now)

### F5 — Missing try/catch around Server Action calls in useTransition

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/dashboard/[hash]/note/[noteId]/components/NoteEditor.tsx:60
- **Detail**: In `handleSave`, calls to `createNoteAction` and `updateNoteAction` are not enclosed in a `try/catch` block. Network interruptions or connection drops cause promise rejection on the client, triggering Next.js's error boundary and losing unsaved edits.
- **Fix**: Wrap action calls inside `startTransition` in `try/catch` and display a user-friendly network error in the `error` alert state.
- **Decision**: FIXED (Fix now)

### F6 — Missing beforeunload protection on unsaved changes

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/dashboard/[hash]/note/[noteId]/components/NoteEditor.tsx:46
- **Detail**: `EditorToolbar` confirms leaving via its Back button, but there is no `beforeunload` listener. Reloading the page (Cmd+R/F5), closing the tab, or navigating with browser buttons discards unsaved changes without warning.
- **Fix**: Add a `useEffect` hook in `NoteEditor.tsx` attaching a `beforeunload` event listener when `isDirty && !isPending && !isSaved`.
- **Decision**: FIXED (Fix now via DOM ref callback)

### F7 — Direct file import in page.tsx bypasses components barrel export

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/dashboard/[hash]/note/[noteId]/page.tsx:6
- **Detail**: `page.tsx` imports `NoteEditor` directly from `./components/NoteEditor` instead of `./components`, differing from `dashboard/[hash]/page.tsx` which imports through its local barrel.
- **Fix**: Update import to `import { NoteEditor } from "./components";`.
- **Decision**: FIXED (Fix now)

### F8 — Unused authorId and userAlias props in NoteEditor

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/dashboard/[hash]/note/[noteId]/components/NoteEditor.tsx:23
- **Detail**: `authorId` and `userAlias` are passed from `page.tsx` per plan contract, but are not destructured or used in `NoteEditor` since Server Actions resolve authorship from cookies.
- **Fix**: Document props in JSDoc as reserved for planned authorship display or omit unused props.
- **Decision**: FIXED (Fix now)

### F9 — Missing inline field error helper text for content textarea

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/dashboard/[hash]/note/[noteId]/components/NoteEditor.tsx:214
- **Detail**: `fieldErrors.title` is rendered via `TextField`'s `helperText`, but `fieldErrors.content` is only reflected in the top-level `Alert`.
- **Fix**: Add an error `<FormHelperText>` under the editor container when `fieldErrors.content` is present.
- **Decision**: FIXED (Fix now)

### F10 — Mousewheel scrolling over line number gutter is blocked

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/dashboard/[hash]/note/[noteId]/components/LineNumberGutter.tsx:35
- **Detail**: `LineNumberGutter` has `overflowY: "hidden"`. Scrolling the mouse wheel while hovering directly over the gutter does not scroll the textarea.
- **Fix**: Add `pointerEvents: "none"` to the gutter Box so wheel events pass directly to the underlying container/textarea.
- **Decision**: FIXED (Fix now)
