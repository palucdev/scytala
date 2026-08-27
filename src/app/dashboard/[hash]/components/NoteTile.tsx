"use client";

import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import type { Note } from "@/client/db-client";
import { FormattedDate } from "./FormattedDate";

export interface NoteTileProps {
  note: Note;
}

export function NoteTile({ note }: NoteTileProps) {
  const displayTitle = note.title?.trim() || "Untitled Note";
  const versionLabel = `v${note.version || 1}`;

  return (
    <Card
      component="article"
      sx={{
        bgcolor: "background.paper",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
        boxShadow: "0 2px 8px rgba(35, 24, 13, 0.06)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        transition: "box-shadow 0.2s ease, transform 0.2s ease",
        "&:hover": {
          boxShadow: "0 6px 16px rgba(35, 24, 13, 0.1)",
        },
      }}
    >
      <CardContent
        sx={{
          p: { xs: 2, sm: 2.5 },
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Typography
          variant="h3"
          component="h2"
          sx={{
            fontSize: "1.15rem",
            fontWeight: 600,
            color: "primary.main",
            mb: 1.5,
            wordBreak: "break-word",
          }}
        >
          {displayTitle}
        </Typography>

        <Typography
          variant="body1"
          sx={{
            color: "text.primary",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            flex: 1,
            mb: 2,
            lineHeight: 1.6,
          }}
        >
          {note.content}
        </Typography>

        <Stack
          direction="row"
          spacing={1}
          sx={{
            justifyContent: "space-between",
            alignItems: "center",
            pt: 1.5,
            borderTop: "1px solid",
            borderColor: "divider",
            mt: "auto",
          }}
        >
          <Chip
            label={versionLabel}
            size="small"
            variant="outlined"
            sx={{
              fontWeight: 600,
              fontSize: "0.75rem",
              height: 22,
              borderColor: "divider",
              color: "text.secondary",
            }}
          />
          <FormattedDate
            date={note.updated_at}
            sx={{
              color: "text.disabled",
              fontFamily: "monospace",
              fontSize: "0.75rem",
            }}
          />
        </Stack>
      </CardContent>
    </Card>
  );
}

export default NoteTile;
