"use client";

import { forwardRef } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export interface LineNumberGutterProps {
  content: string;
  lineHeight?: number | string;
  fontSize?: string | number;
}

export const LineNumberGutter = forwardRef<HTMLDivElement, LineNumberGutterProps>(
  function LineNumberGutter(
    { content, lineHeight = 1.5, fontSize = "0.875rem" },
    ref,
  ) {
    const lineCount = Math.max(1, content.split("\n").length);
    const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

    return (
      <Box
        ref={ref}
        sx={{
          py: 1.5,
          px: 1,
          textAlign: "right",
          userSelect: "none",
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
        {lineNumbers.map((num) => (
          <Typography
            key={num}
            component="div"
            sx={{
              fontFamily: "monospace",
              fontSize: "inherit",
              lineHeight: "inherit",
            }}
          >
            {num}
          </Typography>
        ))}
      </Box>
    );
  },
);

export default LineNumberGutter;
