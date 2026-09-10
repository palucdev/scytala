import { diffWordsWithSpace } from "diff";

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
 * Summarizes the total character additions and deletions from a set of diff tokens.
 */
export function summarizeDiff(tokens: WordDiffToken[]): {
  addedChars: number;
  removedChars: number;
} {
  let addedChars = 0;
  let removedChars = 0;
  for (const token of tokens) {
    if (token.added) addedChars += token.value.length;
    if (token.removed) removedChars += token.value.length;
  }
  return { addedChars, removedChars };
}
