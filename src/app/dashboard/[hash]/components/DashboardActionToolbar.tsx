"use client";

import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import NoteIcon from "@mui/icons-material/Note";
import PollOutlinedIcon from "@mui/icons-material/PollOutlined";

export interface DashboardActionToolbarProps {
  dashboardHash: string;
}

export function DashboardActionToolbar({
  dashboardHash,
}: DashboardActionToolbarProps) {
  return (
    <Box
      aria-label="Dashboard actions"
      sx={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        mt: 2.5,
        pt: { xs: 3, sm: 3.5 },
        pb: { xs: 2.5, sm: 3 },
        px: { xs: 2, sm: 2.5 },
        bgcolor: "background.paper",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
      }}
    >
      <Typography
        variant="h6"
        component="h2"
        sx={{
          position: "absolute",
          top: 0,
          left: "50%",
          transform: "translate(-50%, -50%)",
          display: "inline-flex",
          alignItems: "center",
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1.5,
          px: { xs: 2.5, sm: 3 },
          py: 0.5,
          fontFamily: (theme) => theme.typography.h1.fontFamily,
          fontSize: { xs: "1.05rem", sm: "1.2rem" },
          fontWeight: 600,
          color: "primary.main",
          letterSpacing: "0.04em",
          whiteSpace: "nowrap",
          userSelect: "none",
        }}
      >
        Dashboard Actions
      </Typography>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexWrap: "wrap",
          gap: { xs: 1.5, sm: 2 },
          width: "100%",
        }}
      >
        <Button
          component={Link}
          href={`/dashboard/${dashboardHash}/note/new`}
          variant="contained"
          color="primary"
          startIcon={<NoteIcon sx={{ fontSize: 22 }} />}
          id="header-create-note-btn"
          sx={{
            textTransform: "none",
            fontWeight: 600,
            height: 48,
            px: { xs: 2.5, sm: 3 },
            py: 1,
            fontSize: "1.05rem",
            boxShadow: "0 2px 6px rgba(113, 56, 19, 0.25)",
            "&:hover": {
              boxShadow: "0 4px 12px rgba(113, 56, 19, 0.35)",
            },
          }}
        >
          Create note
        </Button>

        <Button
          variant="outlined"
          disabled
          startIcon={<CreateNewFolderOutlinedIcon sx={{ fontSize: 22 }} />}
          sx={{
            textTransform: "none",
            height: 48,
            px: { xs: 2, sm: 2.5 },
            py: 1,
            fontSize: "1.05rem",
            borderColor: "divider",
            color: "text.disabled",
          }}
        >
          Add Directory
        </Button>

        <Button
          variant="outlined"
          disabled
          startIcon={<InsertDriveFileOutlinedIcon sx={{ fontSize: 22 }} />}
          sx={{
            textTransform: "none",
            height: 48,
            px: { xs: 2, sm: 2.5 },
            py: 1,
            fontSize: "1.05rem",
            borderColor: "divider",
            color: "text.disabled",
          }}
        >
          Add File
        </Button>

        <Button
          variant="outlined"
          disabled
          startIcon={<ImageOutlinedIcon sx={{ fontSize: 22 }} />}
          sx={{
            textTransform: "none",
            height: 48,
            px: { xs: 2, sm: 2.5 },
            py: 1,
            fontSize: "1.05rem",
            borderColor: "divider",
            color: "text.disabled",
          }}
        >
          Add Image
        </Button>

        <Button
          variant="outlined"
          disabled
          startIcon={<PollOutlinedIcon sx={{ fontSize: 22 }} />}
          sx={{
            textTransform: "none",
            height: 48,
            px: { xs: 2, sm: 2.5 },
            py: 1,
            fontSize: "1.05rem",
            borderColor: "divider",
            color: "text.disabled",
          }}
        >
          Add Survey
        </Button>
      </Box>
    </Box>
  );
}

export default DashboardActionToolbar;
