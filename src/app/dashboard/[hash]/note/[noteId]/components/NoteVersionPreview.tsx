"use client";

import { useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { visuallyHidden } from "@mui/utils";
import CloseIcon from "@mui/icons-material/Close";
import HistoryIcon from "@mui/icons-material/History";
import RestoreIcon from "@mui/icons-material/Restore";

import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import {
  computeNoteWordDiff,
  formatDiffLines,
  summarizeDiff,
} from "@/lib/diff";
import type { HydratedNoteVersion } from "@/schemas/notes";
import { LineNumberGutter } from "./LineNumberGutter";

dayjs.extend(relativeTime);

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

export type NoteVersionPreviewDialogProps = NoteVersionPreviewProps;

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

  const gutterRef = useRef<HTMLDivElement>(null);

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

  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

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
            <Stack
              direction="row"
              spacing={1.5}
              sx={{ alignItems: "center", flexWrap: "wrap" }}
            >
              <Chip
                label={`Viewing v${selectedVersion.version} (Read-only)`}
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
                by {selectedVersion.author_alias} •{" "}
                {dayjs(selectedVersion.created_at).fromNow()}
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

            {/* Action buttons and Diff toggle */}
            <Stack
              direction="row"
              spacing={2}
              sx={{ alignItems: "center", flexWrap: "wrap" }}
            >
              <FormControlLabel
                control={
                  <Switch
                    checked={showDiff}
                    onChange={(e) => setShowDiff(e.target.checked)}
                    slotProps={{ input: { "aria-label": "Show changes" } }}
                    sx={{
                      "& .MuiSwitch-switchBase": {
                        color: "#8c6b2d",
                        "&:hover": {
                          backgroundColor: "rgba(140, 107, 45, 0.12)",
                        },
                        "&.Mui-checked": {
                          color: "#713813",
                          "& + .MuiSwitch-track": {
                            backgroundColor: "#713813",
                            borderColor: "#562a0c",
                            opacity: 0.65,
                          },
                        },
                      },
                      "& .MuiSwitch-thumb": {
                        boxShadow: "0 1px 3px rgba(35, 24, 13, 0.35)",
                      },
                      "& .MuiSwitch-track": {
                        backgroundColor: "#cbb48b",
                        opacity: 1,
                        border: "1.5px solid #713813",
                      },
                    }}
                  />
                }
                label={
                  <Typography
                    variant="body1"
                    sx={{
                      fontWeight: 600,
                      fontSize: "1rem",
                      color: "text.primary",
                    }}
                  >
                    Show changes
                  </Typography>
                }
                sx={{ m: 0 }}
              />

              <IconButton
                onClick={handleClose}
                aria-label="Close preview"
                edge="end"
                sx={{ color: "text.primary", p: 1 }}
              >
                <CloseIcon />
              </IconButton>
            </Stack>
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
          <Box
            sx={{
              display: "flex",
              flexDirection: "row",
              flex: 1,
              minHeight: 0,
              position: "relative",
            }}
          >
            <LineNumberGutter
              content={!showDiff ? selectedVersion.content : undefined}
              lineNumbers={showDiff ? diffLineNumbers : undefined}
              ref={gutterRef}
            />

            {!showDiff ? (
              <Box
                component="pre"
                id="note-preview-content"
                aria-label="Note content snapshot"
                onScroll={handleScroll}
                sx={{
                  flex: 1,
                  m: 0,
                  p: 1.5,
                  fontFamily: "monospace",
                  whiteSpace: "pre",
                  overflowX: "auto",
                  fontSize: "0.875rem",
                  lineHeight: 1.5,
                  bgcolor: "transparent",
                  color: "text.primary",
                  width: "100%",
                  minHeight: 0,
                  boxSizing: "border-box",
                }}
              >
                {selectedVersion.content}
              </Box>
            ) : (
              <Box
                id="note-diff-content"
                aria-label="Note diff content"
                onScroll={handleScroll}
                sx={{
                  flex: 1,
                  m: 0,
                  py: 1.5,
                  fontFamily: "monospace",
                  whiteSpace: "pre",
                  overflowX: "auto",
                  fontSize: "0.875rem",
                  lineHeight: 1.5,
                  bgcolor: "transparent",
                  color: "text.primary",
                  width: "100%",
                  minHeight: 0,
                  boxSizing: "border-box",
                }}
              >
                {diffRows.map((row, rIdx) => (
                  <Box
                    key={rIdx}
                    data-testid={`diff-row-${rIdx}`}
                    sx={{
                      px: 1.5,
                      lineHeight: 1.5,
                      fontSize: "0.875rem",
                      minWidth: "100%",
                      width: "max-content",
                      boxSizing: "border-box",
                      bgcolor:
                        row.type === "add"
                          ? "rgba(46, 125, 50, 0.08)"
                          : row.type === "delete"
                            ? "rgba(211, 47, 47, 0.08)"
                            : row.type === "modify"
                              ? "rgba(255, 152, 0, 0.06)"
                              : "transparent",
                    }}
                  >
                    {row.tokens.length === 0
                      ? "\u00A0"
                      : row.tokens.map((token, tIdx) => {
                          if (token.added) {
                            return (
                              <Box
                                component="ins"
                                key={tIdx}
                                aria-label={`Added: ${token.value}`}
                                sx={{
                                  color: "#1b5e20",
                                  bgcolor: "rgba(46, 125, 50, 0.15)",
                                  textDecoration: "none",
                                  borderRadius: "2px",
                                }}
                              >
                                {token.value}
                              </Box>
                            );
                          }
                          if (token.removed) {
                            return (
                              <Box
                                component="del"
                                key={tIdx}
                                aria-label={`Deleted: ${token.value}`}
                                sx={{
                                  color: "#b71c1c",
                                  bgcolor: "rgba(211, 47, 47, 0.15)",
                                  textDecoration: "line-through",
                                  borderRadius: "2px",
                                }}
                              >
                                {token.value}
                              </Box>
                            );
                          }
                          return <span key={tIdx}>{token.value}</span>;
                        })}
                  </Box>
                ))}
              </Box>
            )}
          </Box>
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
            {showDiff &&
              (diffSummary.addedChars > 0 || diffSummary.removedChars > 0) && (
                <Typography
                  variant="body2"
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
                  Diff: +{diffSummary.addedChars} / -{diffSummary.removedChars}{" "}
                  chars
                </Typography>
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

export const NoteVersionPreviewDialog = NoteVersionPreview;
export default NoteVersionPreview;
