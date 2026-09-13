"use client";

import { useState } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";

import type { NoteDto } from "./DashboardView";
import { TileMeta } from "./TileMeta";
import { DeleteNoteDialog } from "../note/[noteId]/components/DeleteNoteDialog";

export interface UnavailableNoteTileProps {
  note: NoteDto;
  dashboardHash: string;
}

/** Tile shown for notes whose decryption failed; activating it opens the remove dialog. */
export function UnavailableNoteTile({ note, dashboardHash }: UnavailableNoteTileProps) {
  const versionLabel = `v${note.version || 1}`;
  const [removeOpen, setRemoveOpen] = useState(false);
  const openRemove = () => setRemoveOpen(true);

  return (
    <>
      <Card
        component="div"
        role="button"
        tabIndex={0}
        aria-label={`Note unavailable, activate to remove version ${versionLabel}`}
        onClick={openRemove}
        onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openRemove();
          }
        }}
        sx={{
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "error.main",
          borderRadius: 2,
          boxShadow: "0 2px 8px rgba(35, 24, 13, 0.06)",
          display: "flex",
          flexDirection: "column",
          height: 210,
          cursor: "pointer",
          textAlign: "left",
          font: "inherit",
          transition: "box-shadow 0.2s ease",
          "&:hover": {
            boxShadow: "0 6px 16px rgba(35, 24, 13, 0.1)",
            "& .remove-hint": { color: "error.main" },
          },
          "&:focus-visible": {
            outline: "2px solid",
            outlineColor: "error.main",
            outlineOffset: 2,
          },
        }}
      >
        <CardContent
          sx={{
            p: 2,
            "&:last-child": { pb: 2 },
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <Typography
            variant="h3"
            component="h2"
            sx={{
              fontSize: "1.1rem",
              fontWeight: 600,
              color: "error.main",
              mb: 1,
            }}
          >
            Note unavailable
          </Typography>

          <Typography
            variant="body1"
            sx={{
              color: "text.secondary",
              flex: 1,
              overflow: "hidden",
              lineHeight: "1.45",
              fontSize: "0.95rem",
              mb: 1,
            }}
          >
            This note can&apos;t be loaded because of an encryption problem.
            Remove it from the dashboard.
          </Typography>

          <Typography
            variant="body2"
            className="remove-hint"
            sx={{
              color: "text.disabled",
              fontSize: "0.8rem",
              mb: 1,
            }}
          >
            Click this card to remove the note.
          </Typography>

          <TileMeta versionLabel={versionLabel} updatedAt={note.updated_at} />
        </CardContent>
      </Card>
      <DeleteNoteDialog
        open={removeOpen}
        onClose={() => setRemoveOpen(false)}
        dashboardHash={dashboardHash}
        noteId={note.id}
        noteTitle={note.title}
        titleUnavailable
      />
    </>
  );
}

export default UnavailableNoteTile;
