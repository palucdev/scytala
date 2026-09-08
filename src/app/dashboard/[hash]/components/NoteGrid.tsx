"use client";

import Box from "@mui/material/Box";

import type { NoteDto } from "./DashboardView";
import { NoteTile } from "./NoteTile";

export interface NoteGridProps {
  notes: NoteDto[];
  dashboardHash: string;
}

export function NoteGrid({ notes, dashboardHash }: NoteGridProps) {
  return (
    <Box
      component="section"
      aria-label="Notes Grid"
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr",
          sm: "repeat(auto-fill, minmax(280px, 1fr))",
        },
        gridAutoRows: "210px",
        gap: 2.5,
      }}
    >
      {notes.map((note) => (
        <NoteTile key={note.id} note={note} dashboardHash={dashboardHash} />
      ))}
    </Box>
  );
}

export default NoteGrid;
