"use client";

import Link from "next/link";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import type { NoteDto } from "./DashboardView";
import { FormattedDate } from "./FormattedDate";

export interface NoteTileProps {
  note: NoteDto;
  dashboardHash: string;
}

export function NoteTile({ note, dashboardHash }: NoteTileProps) {
  const displayTitle = note.title?.trim() || "Untitled Note";
  const versionLabel = `v${note.version || 1}`;

  return (
    <Link
      href={`/dashboard/${dashboardHash}/note/${note.id}`}
      aria-label={`Open note: ${displayTitle}`}
      style={{
        textDecoration: "none",
        color: "inherit",
        display: "flex",
        flexDirection: "column",
        height: 210,
      }}
    >
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
          height: 210,
          cursor: "pointer",
          transition: "box-shadow 0.2s ease, transform 0.2s ease",
          "&:hover": {
            boxShadow: "0 6px 16px rgba(35, 24, 13, 0.1)",
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
              color: "primary.main",
              mb: 1,
              wordBreak: "break-word",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
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
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 5,
              WebkitBoxOrient: "vertical",
              lineHeight: 1.45,
              fontSize: "0.95rem",
              mb: 1,
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
              pt: 1,
              borderTop: "1px solid",
              borderColor: "divider",
              mt: "auto",
              flexShrink: 0,
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
    </Link>
  );
}

export default NoteTile;
