import { diffWordsWithSpace } from "diff";
import type { HydratedNoteVersion } from "@/schemas/notes";

export interface WordDiffToken {
  value: string;
  added?: boolean;
  removed?: boolean;
}

export interface DiffLineRow {
  lineNumber?: number;
  type: "normal" | "add" | "delete" | "modify";
  tokens: WordDiffToken[];
}

export const DIFF_ROW_BGCOLOR_MAP: Record<DiffLineRow["type"], string> = {
  add: "rgba(46, 125, 50, 0.08)",
  delete: "rgba(211, 47, 47, 0.08)",
  modify: "rgba(255, 152, 0, 0.06)",
  normal: "transparent",
};

/**
 * Computes word-level diff between historical content and current content.
 */
export function computeNoteWordDiff(
  historicalContent: string,
  currentContent: string,
): WordDiffToken[] {
  return diffWordsWithSpace(historicalContent, currentContent);
}

/**
 * Splits diff tokens across newline boundaries into structured rows with synchronized
 * line numbers for the preview gutter.
 */
export function formatDiffLines(tokens: WordDiffToken[]): DiffLineRow[] {
  const rows: DiffLineRow[] = [];
  let currentTokens: WordDiffToken[] = [];
  let lineNumber = 1;

  const pushRow = (type: DiffLineRow["type"]) => {
    rows.push({
      lineNumber: type === "delete" ? undefined : lineNumber++,
      type,
      tokens: currentTokens,
    });
    currentTokens = [];
  };

  for (const token of tokens) {
    const lines = token.value.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) {
        // Line boundary reached
        const hasAdds = currentTokens.some((t) => t.added);
        const hasDels = currentTokens.some((t) => t.removed);
        const rowType: DiffLineRow["type"] =
          hasAdds && hasDels ? "modify" : hasAdds ? "add" : hasDels ? "delete" : "normal";
        pushRow(rowType);
      }
      if (lines[i].length > 0) {
        currentTokens.push({
          value: lines[i],
          added: token.added,
          removed: token.removed,
        });
      }
    }
  }

  if (currentTokens.length > 0 || rows.length === 0) {
    const hasAdds = currentTokens.some((t) => t.added);
    const hasDels = currentTokens.some((t) => t.removed);
    const rowType: DiffLineRow["type"] =
      hasAdds && hasDels ? "modify" : hasAdds ? "add" : hasDels ? "delete" : "normal";
    pushRow(rowType);
  }

  return rows;
}

/**
 * Summarizes the total character additions and deletions from a set of diff tokens,
 * excluding newline characters (\r and \n).
 */
export function summarizeDiff(tokens: WordDiffToken[]): {
  addedChars: number;
  removedChars: number;
} {
  let addedChars = 0;
  let removedChars = 0;
  for (const token of tokens) {
    const cleanLength = token.value.replace(/[\r\n]/g, "").length;
    if (token.added) addedChars += cleanLength;
    if (token.removed) removedChars += cleanLength;
  }
  return { addedChars, removedChars };
}

/**
 * Computes version delta summary string between a version and current content or its predecessor.
 */
export function computeVersionDelta(
  version: HydratedNoteVersion,
  currentContentOrPredecessor?: string | HydratedNoteVersion,
): string {
  if (typeof currentContentOrPredecessor === "string") {
    const tokens = computeNoteWordDiff(version.content, currentContentOrPredecessor);
    const { addedChars, removedChars } = summarizeDiff(tokens);
    return `+${addedChars} / -${removedChars}`;
  }

  const predecessor = currentContentOrPredecessor;
  if (version.version === 1 || !predecessor) {
    const cleanLength = version.content.replace(/[\r\n]/g, "").length;
    return `+${cleanLength}`;
  }
  const tokens = computeNoteWordDiff(predecessor.content, version.content);
  const { addedChars, removedChars } = summarizeDiff(tokens);
  return `+${addedChars} / -${removedChars}`;
}

/**
 * Pre-calculates deltas for historical versions relative to currentContent
 * (or predecessor if currentContent not provided).
 */
export function computeVersionDeltas(
  versions: HydratedNoteVersion[],
  currentContent?: string,
): Map<string, string> {
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
}

