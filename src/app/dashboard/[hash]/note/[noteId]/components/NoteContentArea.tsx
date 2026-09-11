"use client";

import { useRef } from "react";
import Box from "@mui/material/Box";
import FormHelperText from "@mui/material/FormHelperText";
import {
  DIFF_ROW_BGCOLOR_MAP,
  type DiffLineRow,
  type WordDiffToken,
} from "@/lib/diff";
import { LineNumberGutter } from "./LineNumberGutter";

export const MAX_NOTE_CONTENT_LENGTH = 10000;

export interface NoteContentAreaProps {
  mode: "edit" | "preview";
  // Edit mode props
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  maxLength?: number;
  placeholder?: string;
  error?: boolean;
  helperText?: string;
  minHeight?: number | string;

  // Preview mode props
  content?: string;
  showDiff?: boolean;
  diffRows?: DiffLineRow[];
  diffLineNumbers?: (number | string | undefined)[];
}

export function renderDiffToken(
  token: WordDiffToken,
  index: number,
): React.ReactNode {
  if (token.added) {
    return (
      <Box
        component="ins"
        key={index}
        aria-label={`Added: ${token.value}`}
        sx={{
          color: "#1b5e20",
          bgcolor: "rgba(46, 125, 50, 0.15)",
          textDecoration: "none",
          borderRadius: "2px",
        }}
      >
        {token.value}
      </Box>
    );
  }
  if (token.removed) {
    return (
      <Box
        component="del"
        key={index}
        aria-label={`Deleted: ${token.value}`}
        sx={{
          color: "#b71c1c",
          bgcolor: "rgba(211, 47, 47, 0.15)",
          textDecoration: "line-through",
          borderRadius: "2px",
        }}
      >
        {token.value}
      </Box>
    );
  }
  return <span key={index}>{token.value}</span>;
}

export function NoteContentArea({
  mode,
  value = "",
  onChange,
  maxLength = MAX_NOTE_CONTENT_LENGTH,
  placeholder = "Type plain text note content here...",
  error = false,
  helperText,
  minHeight,
  content = "",
  showDiff = false,
  diffRows = [],
  diffLineNumbers,
}: NoteContentAreaProps) {
  const gutterRef = useRef<HTMLDivElement>(null);

  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  if (mode === "edit") {
    return (
      <>
        <Box
          sx={{
            display: "flex",
            flexDirection: "row",
            minHeight: minHeight ?? 450,
            position: "relative",
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <LineNumberGutter content={value} ref={gutterRef} />
          <Box
            component="textarea"
            wrap="off"
            id="note-content-input"
            aria-label="Note content"
            maxLength={maxLength}
            value={value}
            onChange={onChange}
            onScroll={handleScroll}
            placeholder={placeholder}
            spellCheck={false}
            sx={{
              flex: 1,
              p: 1.5,
              border: "none",
              outline: "none",
              resize: "vertical",
              fontFamily: "monospace",
              whiteSpace: "pre",
              overflowX: "auto",
              fontSize: "0.875rem",
              lineHeight: 1.5,
              bgcolor: "transparent",
              color: "text.primary",
              width: "100%",
              minHeight: minHeight ?? 450,
              boxSizing: "border-box",
            }}
          />
        </Box>
        {error && helperText && (
          <FormHelperText error sx={{ px: { xs: 2, sm: 3 }, pb: 1 }}>
            {helperText}
          </FormHelperText>
        )}
      </>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        flex: 1,
        minHeight: 0,
        position: "relative",
      }}
    >
      <LineNumberGutter
        content={!showDiff ? content : undefined}
        lineNumbers={showDiff ? diffLineNumbers : undefined}
        ref={gutterRef}
      />

      {!showDiff ? (
        <Box
          component="pre"
          id="note-preview-content"
          aria-label="Note content snapshot"
          onScroll={handleScroll}
          sx={{
            flex: 1,
            m: 0,
            p: 1.5,
            fontFamily: "monospace",
            whiteSpace: "pre",
            overflowX: "auto",
            fontSize: "0.875rem",
            lineHeight: 1.5,
            bgcolor: "transparent",
            color: "text.primary",
            width: "100%",
            minHeight: 0,
            boxSizing: "border-box",
          }}
        >
          {content}
        </Box>
      ) : (
        <Box
          id="note-diff-content"
          aria-label="Note diff content"
          onScroll={handleScroll}
          sx={{
            flex: 1,
            m: 0,
            py: 1.5,
            fontFamily: "monospace",
            whiteSpace: "pre",
            overflowX: "auto",
            fontSize: "0.875rem",
            lineHeight: 1.5,
            bgcolor: "transparent",
            color: "text.primary",
            width: "100%",
            minHeight: 0,
            boxSizing: "border-box",
          }}
        >
          {diffRows.map((row, rIdx) => (
            <Box
              key={rIdx}
              data-testid={`diff-row-${rIdx}`}
              sx={{
                px: 1.5,
                lineHeight: 1.5,
                fontSize: "0.875rem",
                minWidth: "100%",
                width: "max-content",
                boxSizing: "border-box",
                bgcolor: DIFF_ROW_BGCOLOR_MAP[row.type],
              }}
            >
              {row.tokens.length === 0
                ? "\u00A0"
                : row.tokens.map((token, tIdx) => renderDiffToken(token, tIdx))}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
