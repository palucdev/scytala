"use client";

import Box from "@mui/material/Box";

import type { Note } from "@/client/db-client";
import { NoteTile } from "./NoteTile";

export interface NoteGridProps {
  notes: Note[];
}

export function NoteGrid({ notes }: NoteGridProps) {
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
        gap: 2.5,
      }}
    >
      {notes.map((note) => (
        <NoteTile key={note.id} note={note} />
      ))}
    </Box>
  );
}

export default NoteGrid;
