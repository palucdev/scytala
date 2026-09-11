import { describe, it, expect } from "vitest";
import {
  computeNoteWordDiff,
  computeVersionDelta,
  computeVersionDeltas,
  DIFF_ROW_BGCOLOR_MAP,
  formatDiffLines,
  summarizeDiff,
  type WordDiffToken,
} from "@/lib/diff";
import type { HydratedNoteVersion } from "@/schemas/notes";

describe("diff utility", () => {
  describe("computeNoteWordDiff", () => {
    it("returns empty or unchanged token for identical strings", () => {
      const diff = computeNoteWordDiff("Hello world", "Hello world");
      expect(diff).toHaveLength(1);
      expect(diff[0].value).toBe("Hello world");
      expect(diff[0].added).toBeFalsy();
      expect(diff[0].removed).toBeFalsy();
    });

    it("detects added words", () => {
      const diff = computeNoteWordDiff("Hello world", "Hello brave new world");
      const addedTokens = diff.filter((t) => t.added);
      expect(addedTokens.length).toBeGreaterThan(0);
      expect(addedTokens.some((t) => t.value.includes("brave new"))).toBe(true);
    });

    it("detects removed words", () => {
      const diff = computeNoteWordDiff("Hello old world", "Hello world");
      const removedTokens = diff.filter((t) => t.removed);
      expect(removedTokens.length).toBeGreaterThan(0);
      expect(removedTokens.some((t) => t.value.includes("old"))).toBe(true);
    });

    it("handles empty strings", () => {
      const diff = computeNoteWordDiff("", "");
      expect(diff).toEqual([]);
    });

    it("handles completely new content", () => {
      const diff = computeNoteWordDiff("", "Brand new content");
      expect(diff).toHaveLength(1);
      expect(diff[0].added).toBe(true);
      expect(diff[0].value).toBe("Brand new content");
    });

    it("handles completely deleted content", () => {
      const diff = computeNoteWordDiff("Deleted content", "");
      expect(diff).toHaveLength(1);
      expect(diff[0].removed).toBe(true);
      expect(diff[0].value).toBe("Deleted content");
    });
  });

  describe("formatDiffLines", () => {
    it("returns single normal line for empty token list", () => {
      const rows = formatDiffLines([]);
      expect(rows).toEqual([
        {
          lineNumber: 1,
          type: "normal",
          tokens: [],
        },
      ]);
    });

    it("formats single-line normal content", () => {
      const tokens: WordDiffToken[] = [
        { value: "Plain single line", added: false, removed: false },
      ];
      const rows = formatDiffLines(tokens);
      expect(rows).toEqual([
        {
          lineNumber: 1,
          type: "normal",
          tokens: [{ value: "Plain single line", added: false, removed: false }],
        },
      ]);
    });

    it("segments multiline tokens across newlines with incrementing line numbers", () => {
      const tokens: WordDiffToken[] = [
        { value: "Line 1\nLine 2\nLine 3" },
      ];
      const rows = formatDiffLines(tokens);
      expect(rows).toHaveLength(3);
      expect(rows[0]).toEqual({
        lineNumber: 1,
        type: "normal",
        tokens: [{ value: "Line 1", added: undefined, removed: undefined }],
      });
      expect(rows[1]).toEqual({
        lineNumber: 2,
        type: "normal",
        tokens: [{ value: "Line 2", added: undefined, removed: undefined }],
      });
      expect(rows[2]).toEqual({
        lineNumber: 3,
        type: "normal",
        tokens: [{ value: "Line 3", added: undefined, removed: undefined }],
      });
    });

    it("classifies pure deletion line with undefined lineNumber and does not advance lineNumber", () => {
      const tokens: WordDiffToken[] = [
        { value: "Deleted line\n", removed: true },
        { value: "Kept line" },
      ];
      const rows = formatDiffLines(tokens);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        lineNumber: undefined,
        type: "delete",
        tokens: [{ value: "Deleted line", added: undefined, removed: true }],
      });
      expect(rows[1]).toEqual({
        lineNumber: 1,
        type: "normal",
        tokens: [{ value: "Kept line", added: undefined, removed: undefined }],
      });
    });

    it("classifies pure addition line with type 'add' and increments lineNumber", () => {
      const tokens: WordDiffToken[] = [
        { value: "Added line\n", added: true },
        { value: "Normal line" },
      ];
      const rows = formatDiffLines(tokens);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        lineNumber: 1,
        type: "add",
        tokens: [{ value: "Added line", added: true, removed: undefined }],
      });
      expect(rows[1]).toEqual({
        lineNumber: 2,
        type: "normal",
        tokens: [{ value: "Normal line", added: undefined, removed: undefined }],
      });
    });

    it("classifies line with both additions and deletions as 'modify'", () => {
      const tokens: WordDiffToken[] = [
        { value: "Start " },
        { value: "old", removed: true },
        { value: "new", added: true },
        { value: " end" },
      ];
      const rows = formatDiffLines(tokens);
      expect(rows).toHaveLength(1);
      expect(rows[0].type).toBe("modify");
      expect(rows[0].lineNumber).toBe(1);
      expect(rows[0].tokens).toHaveLength(4);
    });

    it("handles multiple empty lines", () => {
      const tokens: WordDiffToken[] = [
        { value: "Line 1\n\nLine 3" },
      ];
      const rows = formatDiffLines(tokens);
      expect(rows).toHaveLength(3);
      expect(rows[0].lineNumber).toBe(1);
      expect(rows[1].lineNumber).toBe(2);
      expect(rows[1].tokens).toEqual([]);
      expect(rows[2].lineNumber).toBe(3);
      expect(rows[2].tokens[0].value).toBe("Line 3");
    });
  });

  describe("summarizeDiff", () => {
    it("returns zero counts for empty token list", () => {
      expect(summarizeDiff([])).toEqual({ addedChars: 0, removedChars: 0 });
    });

    it("correctly counts added and removed characters", () => {
      const tokens: WordDiffToken[] = [
        { value: "keep ", added: false, removed: false },
        { value: "delete", removed: true }, // 6 chars
        { value: "add more", added: true }, // 8 chars
      ];
      expect(summarizeDiff(tokens)).toEqual({ addedChars: 8, removedChars: 6 });
    });

    it("returns zero counts when all tokens are unchanged", () => {
      const tokens: WordDiffToken[] = [
        { value: "unchanged text", added: false, removed: false },
      ];
      expect(summarizeDiff(tokens)).toEqual({ addedChars: 0, removedChars: 0 });
    });

    it("does not count newline characters in additions and deletions", () => {
      const tokens: WordDiffToken[] = [
        { value: "line1\nline2\r\n", added: true },
        { value: "old1\nold2\n", removed: true },
      ];
      expect(summarizeDiff(tokens)).toEqual({ addedChars: 10, removedChars: 8 });
    });
  });

  describe("computeVersionDelta", () => {
    const mockVersion1: HydratedNoteVersion = {
      id: "v-1",
      note_id: "n-1",
      version: 1,
      title: "Note 1",
      content: "Hello\nWorld",
      author_id: "u-1",
      author_alias: "Alice",
      created_at: "2026-09-01T00:00:00Z",
    };

    const mockVersion2: HydratedNoteVersion = {
      id: "v-2",
      note_id: "n-1",
      version: 2,
      title: "Note 1",
      content: "Hello\nBrave World",
      author_id: "u-1",
      author_alias: "Alice",
      created_at: "2026-09-02T00:00:00Z",
    };

    it("returns +length without newlines for version 1 without predecessor", () => {
      expect(computeVersionDelta(mockVersion1)).toBe("+10"); // "Hello" (5) + "World" (5)
    });

    it("computes delta against currentContent string", () => {
      const delta = computeVersionDelta(mockVersion1, "Hello World modified");
      expect(delta).toContain("+");
      expect(delta).toContain("-");
    });

    it("computes delta against predecessor version", () => {
      const delta = computeVersionDelta(mockVersion2, mockVersion1);
      expect(delta).toBe("+6 / -0");
    });
  });

  describe("computeVersionDeltas", () => {
    const versions: HydratedNoteVersion[] = [
      {
        id: "v-3",
        note_id: "n-1",
        version: 3,
        title: "V3",
        content: "Content 3",
        author_id: "u-1",
        author_alias: "Alice",
        created_at: "2026-09-03T00:00:00Z",
      },
      {
        id: "v-2",
        note_id: "n-1",
        version: 2,
        title: "V2",
        content: "Content 2",
        author_id: "u-1",
        author_alias: "Alice",
        created_at: "2026-09-02T00:00:00Z",
      },
      {
        id: "v-1",
        note_id: "n-1",
        version: 1,
        title: "V1",
        content: "Content 1",
        author_id: "u-1",
        author_alias: "Alice",
        created_at: "2026-09-01T00:00:00Z",
      },
    ];

    it("computes delta map using currentContent when provided", () => {
      const deltas = computeVersionDeltas(versions, "Current draft");
      expect(deltas.has("v-2")).toBe(true);
      expect(deltas.has("v-1")).toBe(true);
      expect(deltas.has("v-3")).toBe(false); // Current version is skipped
    });

    it("computes delta map against predecessors when currentContent is undefined", () => {
      const deltas = computeVersionDeltas(versions);
      expect(deltas.has("v-2")).toBe(true);
      expect(deltas.has("v-1")).toBe(true);
    });
  });

  describe("DIFF_ROW_BGCOLOR_MAP", () => {
    it("provides background colors for all diff line types", () => {
      expect(DIFF_ROW_BGCOLOR_MAP.add).toBe("rgba(46, 125, 50, 0.08)");
      expect(DIFF_ROW_BGCOLOR_MAP.delete).toBe("rgba(211, 47, 47, 0.08)");
      expect(DIFF_ROW_BGCOLOR_MAP.modify).toBe("rgba(255, 152, 0, 0.06)");
      expect(DIFF_ROW_BGCOLOR_MAP.normal).toBe("transparent");
    });
  });
});
