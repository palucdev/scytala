"use client";

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import HistoryIcon from "@mui/icons-material/History";

dayjs.extend(relativeTime);

export interface NoteVersionBannerProps {
  version: number;
  authorAlias: string;
  createdAt: string;
  isMobile?: boolean;
  onOpenDrawer?: () => void;
}

export function NoteVersionBanner({
  version,
  authorAlias,
  createdAt,
  isMobile = false,
  onOpenDrawer,
}: NoteVersionBannerProps) {
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{ alignItems: "center", flexWrap: "wrap" }}
    >
      <Chip
        label={`Viewing v${version} (Read-only)`}
        color="warning"
        sx={{
          fontWeight: 700,
          fontSize: "0.875rem",
          height: 32,
          px: 0.5,
        }}
      />
      <Typography
        variant="body2"
        sx={{ color: "text.secondary", fontSize: "0.95rem" }}
      >
        by {authorAlias} • {dayjs(createdAt).fromNow()}
      </Typography>

      {isMobile && onOpenDrawer && (
        <Button
          variant="outlined"
          onClick={onOpenDrawer}
          startIcon={<HistoryIcon />}
          aria-label="Switch version"
          sx={{
            height: 36,
            fontSize: "0.9rem",
            ml: 0.5,
            textTransform: "none",
          }}
        >
          Switch version
        </Button>
      )}
    </Stack>
  );
}
