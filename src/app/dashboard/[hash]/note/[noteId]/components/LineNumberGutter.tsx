"use client";

import { forwardRef, memo, useMemo } from "react";
import Box from "@mui/material/Box";

export interface LineNumberGutterProps {
  content?: string;
  lineNumbers?: (number | string | undefined)[];
  lineHeight?: number | string;
  fontSize?: string | number;
}

export const LineNumberGutter = memo(
  forwardRef<HTMLDivElement, LineNumberGutterProps>(
    function LineNumberGutter(
      { content, lineNumbers, lineHeight = 1.5, fontSize = "0.875rem" },
      ref,
    ) {
      const numbersText = useMemo(() => {
        if (lineNumbers !== undefined) {
          return lineNumbers.map((n) => (n !== undefined ? String(n) : "")).join("\n");
        }
        const text = content ?? "";
        let lineCount = 1;
        for (let i = 0; i < text.length; i++) {
          if (text.charCodeAt(i) === 10) lineCount++;
        }
        let out = "1";
        for (let i = 2; i <= lineCount; i++) {
          out += "\n" + i;
        }
        return out;
      }, [content, lineNumbers]);

      return (
        <Box
          ref={ref}
          component="pre"
          sx={{
            m: 0,
            py: 1.5,
            px: 1,
            textAlign: "right",
            userSelect: "none",
            pointerEvents: "none",
            color: "text.disabled",
            fontFamily: "monospace",
            fontSize,
            lineHeight,
            width: 44,
            minWidth: 44,
            maxHeight: "100%",
            overflowY: "hidden",
            borderRight: "1px solid",
            borderColor: "divider",
            bgcolor: "action.hover",
            boxSizing: "border-box",
          }}
          aria-hidden="true"
        >
          {numbersText}
        </Box>
      );
    },
  ),
);

export default LineNumberGutter;
