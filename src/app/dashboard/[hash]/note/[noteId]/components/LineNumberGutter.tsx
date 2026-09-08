"use client";

import { forwardRef, memo, useMemo } from "react";
import Box from "@mui/material/Box";

export interface LineNumberGutterProps {
  content: string;
  lineHeight?: number | string;
  fontSize?: string | number;
}

export const LineNumberGutter = memo(
  forwardRef<HTMLDivElement, LineNumberGutterProps>(
    function LineNumberGutter(
      { content, lineHeight = 1.5, fontSize = "0.875rem" },
      ref,
    ) {
      const numbersText = useMemo(() => {
        const lineCount = Math.max(1, content.split("\n").length);
        return Array.from({ length: lineCount }, (_, i) => i + 1).join("\n");
      }, [content]);

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
