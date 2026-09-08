"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";

export interface EditorToolbarProps {
  mode: "create" | "edit";
  noteTitle: string;
  version?: number;
  dashboardHash: string;
  isSaving: boolean;
  isDirty: boolean;
  onSave: () => void;
  onDelete: () => void;
}

export function EditorToolbar({
  mode,
  noteTitle,
  version,
  dashboardHash,
  isSaving,
  isDirty,
  onSave,
  onDelete,
}: EditorToolbarProps) {
  const router = useRouter();

  const handleBack = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (isDirty) {
      e.preventDefault();
      const confirmLeave = window.confirm(
        "You have unsaved changes. Are you sure you want to leave?",
      );
      if (confirmLeave) {
        router.push(`/dashboard/${dashboardHash}`);
      }
    }
  };

  const displayTitle =
    mode === "create"
      ? "New Note"
      : noteTitle.trim() || "Untitled Note";

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 1.5,
        p: { xs: 1.5, sm: 2 },
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          minWidth: 0,
          flex: 1,
        }}
      >
        <Button
          component={Link}
          href={`/dashboard/${dashboardHash}`}
          onClick={handleBack}
          startIcon={<ArrowBackIcon />}
          variant="outlined"
          aria-label="Back to dashboard"
        >
          Back
        </Button>

        <Typography
          variant="h6"
          component="h1"
          noWrap
          sx={{
            fontWeight: 600,
            color: "text.primary",
            fontSize: { xs: "1rem", sm: "1.25rem" },
          }}
        >
          {displayTitle}
        </Typography>

        {mode === "edit" && version !== undefined && (
          <Chip
            label={`v${version}`}
            size="small"
            variant="outlined"
            sx={{
              fontFamily: "monospace",
              fontSize: "0.75rem",
              height: 20,
            }}
          />
        )}
      </Box>

      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        {mode === "edit" && (
          <Button
            variant="outlined"
            color="error"
            onClick={onDelete}
            disabled={isSaving}
            startIcon={<DeleteIcon />}
            aria-label="Delete note"
          >
            Delete
          </Button>
        )}

        <Button
          variant="contained"
          color="primary"
          onClick={onSave}
          disabled={!isDirty || isSaving}
          startIcon={
            isSaving ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <SaveIcon />
            )
          }
          aria-label="Save note"
        >
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </Stack>
    </Box>
  );
}

export default EditorToolbar;
