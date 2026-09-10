<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Dashboard Auth Login and Tiles View (S-02)

- **Plan**: [plan.md](../plan.md)
- **Scope**: Phase 5 of 8
- **Date**: 2026-08-27
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning (fixed), 1 observation (accepted)

## Verdicts

| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS (Fixed) |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Key normalization mismatch in logger sensitive key redaction

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: [src/lib/logger.ts:17-85](../../../../src/lib/logger.ts#L17-L85)
- **Detail**: In `src/lib/logger.ts`, `SENSITIVE_KEYS` contained strings with punctuation (`"session_secret"`, `"set-cookie"`). During object sanitization, object keys are normalized via `key.toLowerCase().replace(/[^a-z0-9]/g, "")`, which strips underscores and hyphens, producing `"sessionsecret"` and `"setcookie"`. Because `Set.has()` does exact comparison, properties like `{ session_secret: "..." }` or `{ "set-cookie": "..." }` would not match `SENSITIVE_KEYS` and could bypass key-based redaction.
- **Fix**: Pre-normalized set entries in `SENSITIVE_KEYS` and added `SENSITIVE_SUBSTRINGS` checking (`password`, `secret`, `cookie`, `token`, `credential`) in `sanitizeValue`.
- **Decision**: FIXED (Option 3 — Substring checking and pre-normalized keys with full test coverage in `src/__tests__/lib/logger.test.ts`)

### F2 — Unplanned FormattedDate client component for hydration safety

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: [src/app/dashboard/[hash]/components/FormattedDate.tsx:18](../../../../src/app/dashboard/%5Bhash%5D/components/FormattedDate.tsx#L18)
- **Detail**: `FormattedDate` component was added to format dates on the client using `useSyncExternalStore` to prevent server/client timezone hydration mismatches. This was not part of the initial Phase 5 plan, but is a safe, benign quality-of-life fix for `NoteTile` date rendering.
- **Fix**: Keep `FormattedDate` as implemented and accept the scope addition.
- **Decision**: ACCEPTED (Keep `FormattedDate` as implemented)
