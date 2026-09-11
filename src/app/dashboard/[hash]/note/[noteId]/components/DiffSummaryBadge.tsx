"use client";

import Typography from "@mui/material/Typography";

export interface DiffSummaryBadgeProps {
  addedChars: number;
  removedChars: number;
}

export function DiffSummaryBadge({
  addedChars,
  removedChars,
}: DiffSummaryBadgeProps) {
  if (addedChars <= 0 && removedChars <= 0) {
    return null;
  }

  return (
    <Typography
      variant="body2"
      aria-label={`Diff: +${addedChars} / -${removedChars} characters`}
      sx={{
        fontFamily: "monospace",
        fontSize: "0.875rem",
        color: "text.secondary",
        bgcolor: "action.hover",
        px: 1.5,
        py: 0.75,
        borderRadius: 1,
      }}
    >
      Diff: +{addedChars} / -{removedChars} chars
    </Typography>
  );
}
