import { describe, it, expect } from "vitest";
import {
  computeNoteWordDiff,
  formatDiffLines,
  summarizeDiff,
  type WordDiffToken,
} from "@/lib/diff";

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
  });
});
