"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { visuallyHidden } from "@mui/utils";
import RestoreIcon from "@mui/icons-material/Restore";

import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import {
  computeNoteWordDiff,
  formatDiffLines,
  summarizeDiff,
} from "@/lib/diff";
import type { HydratedNoteVersion } from "@/schemas/notes";
import { DiffSummaryBadge } from "./DiffSummaryBadge";
import { NoteContentArea } from "./NoteContentArea";
import { NoteVersionBanner } from "./NoteVersionBanner";
import { NoteVersionPreviewActions } from "./NoteVersionPreviewActions";

export interface NoteVersionPreviewProps {
  open?: boolean;
  selectedVersion: HydratedNoteVersion | null;
  currentTitle: string;
  currentContent: string;
  onClosePreview?: () => void;
  onClose?: () => void;
  onRestore: (version: HydratedNoteVersion) => void;
  onOpenDrawer?: () => void;
  isRestoring: boolean;
  isDirty?: boolean;
  isMobile?: boolean;
  initialShowDiff?: boolean;
}

export function NoteVersionPreview({
  open,
  selectedVersion,
  currentTitle,
  currentContent,
  onClosePreview,
  onClose,
  onRestore,
  onOpenDrawer,
  isRestoring,
  isDirty = false,
  isMobile: isMobileProp,
  initialShowDiff,
}: NoteVersionPreviewProps) {
  const theme = useTheme();
  const mediaQueryMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isMobile = isMobileProp ?? mediaQueryMobile;

  const handleClose = onClosePreview ?? onClose ?? (() => {});
  const isDialogOpen =
    (open ?? Boolean(selectedVersion)) && Boolean(selectedVersion);

  const hasContentChanges = Boolean(
    selectedVersion && selectedVersion.content !== currentContent,
  );

  const [showDiff, setShowDiff] = useState(
    initialShowDiff !== undefined ? initialShowDiff : hasContentChanges,
  );
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);

  const diffTokens = useMemo(() => {
    if (!selectedVersion) return [];
    return computeNoteWordDiff(selectedVersion.content, currentContent);
  }, [selectedVersion, currentContent]);

  const diffRows = useMemo(() => {
    return formatDiffLines(diffTokens);
  }, [diffTokens]);

  const diffSummary = useMemo(() => {
    return summarizeDiff(diffTokens);
  }, [diffTokens]);

  const diffLineNumbers = useMemo(() => {
    return diffRows.map((r) => {
      if (r.type === "delete") return "-";
      if (r.type === "add") return "+";
      return r.lineNumber;
    });
  }, [diffRows]);

  if (!selectedVersion) {
    return null;
  }

  return (
    <>
      <Dialog
        open={isDialogOpen}
        onClose={handleClose}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
        scroll="paper"
        aria-labelledby="note-preview-dialog-title"
        slotProps={{
          paper: {
            sx: {
              borderRadius: isMobile ? 0 : 2,
              bgcolor: "background.paper",
              width: "100%",
              height: isMobile ? "100%" : "85vh",
              minHeight: isMobile ? "100%" : 580,
              maxHeight: isMobile ? "100%" : "calc(100% - 64px)",
              display: "flex",
              flexDirection: "column",
            },
          },
        }}
      >
        {/* Preview Action Header */}
        <DialogTitle
          id="note-preview-dialog-title"
          sx={{
            p: { xs: 1.5, sm: 2 },
            bgcolor: "action.hover",
            borderBottom: "1px solid",
            borderColor: "divider",
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 1.5,
            }}
          >
            {/* Version details */}
            <NoteVersionBanner
              version={selectedVersion.version}
              authorAlias={selectedVersion.author_alias}
              createdAt={selectedVersion.created_at}
              isMobile={isMobile}
              onOpenDrawer={onOpenDrawer}
            />

            {/* Action buttons and Diff toggle */}
            <NoteVersionPreviewActions
              showDiff={showDiff}
              onToggleDiff={setShowDiff}
              onClose={handleClose}
            />
          </Box>

          {/* Diff summary announcement for assistive technology */}
          {showDiff && (
            <Box sx={visuallyHidden} aria-live="polite">
              {`${diffSummary.addedChars} characters added, ${diffSummary.removedChars} characters removed`}
            </Box>
          )}
        </DialogTitle>

        {/* Dialog Content */}
        <DialogContent
          dividers
          sx={{
            p: 0,
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Historical Title & Title Comparison */}
          <Box
            sx={{
              px: { xs: 2, sm: 3 },
              py: 1.5,
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            {selectedVersion.title !== currentTitle && (
              <Box
                sx={{
                  mb: 1.5,
                  p: 1.5,
                  bgcolor: "action.hover",
                  borderRadius: 1,
                  border: "1px solid",
                  borderColor: "divider",
                  display: "flex",
                  flexDirection: "column",
                  gap: 0.75,
                }}
              >
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    color: "text.secondary",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Title difference:
                </Typography>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 1.25,
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      color: "text.secondary",
                      fontSize: "0.925rem",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 0.75,
                    }}
                  >
                    {"In this version: "}
                    <Box
                      component="del"
                      aria-label={`Historical title: ${selectedVersion.title || "(Untitled)"}`}
                      sx={{
                        color: "#b71c1c",
                        bgcolor: "rgba(211, 47, 47, 0.15)",
                        px: 1,
                        py: 0.3,
                        borderRadius: 0.75,
                        textDecoration: "line-through",
                        fontWeight: 600,
                        fontSize: "0.925rem",
                      }}
                    >
                      {selectedVersion.title || "(Untitled)"}
                    </Box>
                  </Typography>
                  <Typography variant="body2" sx={{ color: "text.disabled", fontSize: "1rem" }}>
                    ➔
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      color: "text.secondary",
                      fontSize: "0.925rem",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 0.75,
                    }}
                  >
                    {"Current draft: "}
                    <Box
                      component="ins"
                      aria-label={`Current draft title: ${currentTitle || "(Untitled)"}`}
                      sx={{
                        color: "#1b5e20",
                        bgcolor: "rgba(46, 125, 50, 0.15)",
                        px: 1,
                        py: 0.3,
                        borderRadius: 0.75,
                        textDecoration: "none",
                        fontWeight: 600,
                        fontSize: "0.925rem",
                      }}
                    >
                      {currentTitle || "(Untitled)"}
                    </Box>
                  </Typography>
                </Box>
              </Box>
            )}

            <Typography
              variant="h6"
              component="h2"
              id="note-preview-title"
              aria-label="Note title snapshot"
              sx={{
                fontSize: "1.25rem",
                fontWeight: 600,
                color: selectedVersion.title
                  ? "text.primary"
                  : "text.secondary",
                fontStyle: selectedVersion.title ? "normal" : "italic",
              }}
            >
              {selectedVersion.title || "(Untitled note)"}
            </Typography>
          </Box>

          {/* Content Area */}
          <NoteContentArea
            mode="preview"
            content={selectedVersion.content}
            showDiff={showDiff}
            diffRows={diffRows}
            diffLineNumbers={diffLineNumbers}
          />
        </DialogContent>

        {/* Dialog Actions */}
        <DialogActions
          sx={{
            p: { xs: 2, sm: 2.5 },
            minHeight: 64,
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 1.5,
          }}
        >
          <Box sx={{ minHeight: 32, display: "flex", alignItems: "center" }}>
            {showDiff && (
              <DiffSummaryBadge
                addedChars={diffSummary.addedChars}
                removedChars={diffSummary.removedChars}
              />
            )}
          </Box>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <Button
              variant="outlined"
              onClick={handleClose}
              aria-label="Exit preview"
              sx={{
                fontSize: "1rem",
                height: 40,
                px: 2.5,
                textTransform: "none",
              }}
            >
              Exit preview
            </Button>

            <Button
              variant="contained"
              color="primary"
              onClick={() => setConfirmRestoreOpen(true)}
              disabled={isRestoring}
              startIcon={
                isRestoring ? (
                  <CircularProgress size={18} color="inherit" />
                ) : (
                  <RestoreIcon />
                )
              }
              aria-label="Restore this version"
              sx={{
                fontSize: "1rem",
                height: 40,
                px: 2.5,
                textTransform: "none",
              }}
            >
              {isRestoring ? "Restoring..." : "Restore this version"}
            </Button>
          </Stack>
        </DialogActions>
      </Dialog>

      {/* Confirmation Dialog for Restoration */}
      <ConfirmationDialog
        open={confirmRestoreOpen}
        onClose={() => setConfirmRestoreOpen(false)}
        onConfirm={() => {
          setConfirmRestoreOpen(false);
          onRestore(selectedVersion);
        }}
        title={`Restore Version ${selectedVersion.version}?`}
        description={`This will restore the note's title and content to version ${selectedVersion.version} (saved by ${selectedVersion.author_alias}). A new version will be created. All previous versions will remain in history.${
          isDirty
            ? " Any unsaved changes in your current draft will be overwritten."
            : ""
        }`}
        confirmLabel="Restore Version"
        cancelLabel="Cancel"
        confirmColor={isDirty ? "warning" : "primary"}
      />
    </>
  );
}

export default NoteVersionPreview;
