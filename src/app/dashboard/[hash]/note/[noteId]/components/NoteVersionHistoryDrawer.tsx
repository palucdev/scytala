"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import CloseIcon from "@mui/icons-material/Close";
import RefreshIcon from "@mui/icons-material/Refresh";

import { getNoteVersionHistoryAction } from "@/actions/notes";
import { computeVersionDelta } from "@/lib/diff";
import type { HydratedNoteVersion } from "@/schemas/notes";

dayjs.extend(relativeTime);

export interface NoteVersionHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  dashboardHash?: string;
  noteId?: string;
  versions?: HydratedNoteVersion[];
  isLoading?: boolean;
  error?: string | null;
  selectedVersionId: string | null;
  onSelectVersion: (version: HydratedNoteVersion | null) => void;
  currentVersionNumber?: number;
  currentContent?: string;
  onRefresh?: () => void;
  isMobile?: boolean;
}

export function NoteVersionHistoryDrawer({
  open,
  onClose,
  dashboardHash,
  noteId,
  versions: versionsProp,
  isLoading: isLoadingProp,
  error: errorProp,
  selectedVersionId,
  onSelectVersion,
  currentVersionNumber,
  currentContent,
  onRefresh: onRefreshProp,
  isMobile: isMobileProp,
}: NoteVersionHistoryDrawerProps) {
  const [internalVersions, setInternalVersions] = useState<HydratedNoteVersion[]>([]);
  const [internalLoading, setInternalLoading] = useState(false);
  const [internalError, setInternalError] = useState<string | null>(null);

  const isInitialLoading =
    open &&
    versionsProp === undefined &&
    Boolean(dashboardHash && noteId) &&
    internalVersions.length === 0 &&
    internalError === null;

  const versions = versionsProp ?? internalVersions;
  const isLoading = isLoadingProp ?? (internalLoading || isInitialLoading);
  const error = errorProp ?? internalError;

  useEffect(() => {
    let isMounted = true;
    if (open && versionsProp === undefined && dashboardHash && noteId) {
      if (internalVersions.length === 0 && internalError === null) {
        getNoteVersionHistoryAction({ dashboardHash, noteId })
          .then((result) => {
            if (!isMounted) return;
            if (result.success) {
              setInternalVersions(result.versions);
            } else {
              setInternalError(result.error);
            }
          })
          .catch(() => {
            if (!isMounted) return;
            setInternalError("Failed to load version history.");
          });
      }
    }
    return () => {
      isMounted = false;
    };
  }, [open, versionsProp, dashboardHash, noteId, internalVersions.length, internalError]);

  const prevVersionRef = useRef(currentVersionNumber);
  useEffect(() => {
    if (prevVersionRef.current !== currentVersionNumber) {
      prevVersionRef.current = currentVersionNumber;
      if (dashboardHash && noteId && versionsProp === undefined) {
        let isMounted = true;
        getNoteVersionHistoryAction({ dashboardHash, noteId })
          .then((result) => {
            if (!isMounted) return;
            if (result.success) {
              setInternalVersions(result.versions);
            } else {
              setInternalError(result.error);
            }
          })
          .catch(() => {
            if (!isMounted) return;
            setInternalError("Failed to update version history.");
          });
        return () => {
          isMounted = false;
        };
      }
    }
  }, [currentVersionNumber, dashboardHash, noteId, versionsProp]);

  const handleRefreshClick = useCallback(() => {
    if (onRefreshProp) {
      onRefreshProp();
      return;
    }
    if (!dashboardHash || !noteId) return;
    setInternalLoading(true);
    setInternalError(null);
    getNoteVersionHistoryAction({ dashboardHash, noteId })
      .then((result) => {
        if (result.success) {
          setInternalVersions(result.versions);
        } else {
          setInternalError(result.error);
        }
      })
      .catch(() => {
        setInternalError("Failed to load version history.");
      })
      .finally(() => {
        setInternalLoading(false);
      });
  }, [onRefreshProp, dashboardHash, noteId]);

  const handleRefresh =
    onRefreshProp !== undefined || (dashboardHash && noteId)
      ? handleRefreshClick
      : undefined;

  const theme = useTheme();
  const mediaQueryMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isMobile = isMobileProp ?? mediaQueryMobile;

  const latestVersion = versions[0];
  const activeVersionNumber =
    currentVersionNumber ?? latestVersion?.version ?? 1;
  const historicalVersions = useMemo(() => versions.slice(1), [versions]);

  // Pre-calculate deltas for historical versions relative to currentContent (or predecessor if currentContent not provided)
  const versionDeltas = useMemo(() => {
    const deltas = new Map<string, string>();
    for (let i = 1; i < versions.length; i++) {
      const v = versions[i];
      if (currentContent !== undefined) {
        deltas.set(v.id, computeVersionDelta(v, currentContent));
      } else {
        const predecessor = versions[i + 1];
        deltas.set(v.id, computeVersionDelta(v, predecessor));
      }
    }
    return deltas;
  }, [versions, currentContent]);

  const handleSelectVersion = (version: HydratedNoteVersion | null) => {
    onSelectVersion(version);
    if (isMobile) {
      onClose();
    }
  };

  if (!open) {
    return null;
  }

  return (
    <Drawer
      anchor="right"
      variant={isMobile ? "temporary" : "persistent"}
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          elevation: isMobile ? 16 : 8,
          sx: {
            width: { xs: "100vw", sm: 380 },
            boxSizing: "border-box",
            bgcolor: "background.paper",
            display: "flex",
            flexDirection: "column",
            borderLeft: { sm: "1px solid" },
            borderColor: { sm: "divider" },
            boxShadow: isMobile
              ? undefined
              : "0 8px 32px rgba(35, 24, 13, 0.16)",
          },
        },
      }}
      aria-label="Version history"
    >
      {/* Drawer Header */}
      <Box
        sx={{
          p: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Typography
          variant="h6"
          component="h2"
          sx={{ fontWeight: 600, fontSize: "1.1rem" }}
        >
          Version History
        </Typography>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
          {handleRefresh && (
            <Tooltip title="Refresh versions">
              <span>
                <IconButton
                  size="small"
                  onClick={handleRefresh}
                  disabled={isLoading}
                  aria-label="Refresh version history"
                >
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          )}
          <IconButton
            size="small"
            onClick={onClose}
            aria-label="Close version history"
            edge="end"
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Box>

      {/* Drawer Content */}
      <Box sx={{ flex: 1, overflowY: "auto", p: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress size={32} />
          </Box>
        ) : (
          <List disablePadding sx={{ width: "100%" }}>
            {/* Synthetic Current Draft Row */}
            <ListItemButton
              selected={selectedVersionId === null}
              onClick={() => handleSelectVersion(null)}
              sx={{
                borderRadius: 1.5,
                mb: 1.5,
                p: 1.5,
                border: "1px solid",
                borderColor:
                  selectedVersionId === null ? "primary.main" : "divider",
                bgcolor:
                  selectedVersionId === null
                    ? "action.selected"
                    : "background.paper",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 0.75,
              }}
            >
              <Stack
                direction="row"
                sx={{
                  width: "100%",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "center" }}
                >
                  <Chip
                    label={`v${activeVersionNumber}`}
                    size="small"
                    color={selectedVersionId === null ? "primary" : "default"}
                    sx={{ fontWeight: 700, fontSize: "0.75rem", height: 22 }}
                  />
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Current version
                  </Typography>
                </Stack>
                <Chip
                  label="Active"
                  size="small"
                  variant="outlined"
                  color="primary"
                  sx={{ height: 20, fontSize: "0.7rem", fontWeight: 600 }}
                />
              </Stack>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {latestVersion
                  ? `by ${latestVersion.author_alias}`
                  : "Active working draft"}
              </Typography>
            </ListItemButton>

            {historicalVersions.length > 0 && (
              <>
                <Divider sx={{ my: 1.5 }}>
                  <Typography
                    variant="caption"
                    sx={{ color: "text.disabled", textTransform: "uppercase" }}
                  >
                    Past versions
                  </Typography>
                </Divider>

                {historicalVersions.map((v) => {
                  const isSelected = selectedVersionId === v.id;
                  const delta =
                    versionDeltas.get(v.id) ??
                    (currentContent !== undefined
                      ? computeVersionDelta(v, currentContent)
                      : `+${v.content.length}`);

                  return (
                    <ListItemButton
                      key={v.id}
                      selected={isSelected}
                      onClick={() => handleSelectVersion(v)}
                      sx={{
                        borderRadius: 1.5,
                        mb: 1,
                        p: 1.5,
                        border: "1px solid",
                        borderColor: isSelected ? "primary.main" : "divider",
                        bgcolor: isSelected
                          ? "action.selected"
                          : "background.paper",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: 0.75,
                      }}
                    >
                      <Stack
                        direction="row"
                        sx={{
                          width: "100%",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <Stack
                          direction="row"
                          spacing={1}
                          sx={{ alignItems: "center" }}
                        >
                          <Chip
                            label={`v${v.version}`}
                            size="small"
                            variant="outlined"
                            sx={{
                              fontWeight: 600,
                              fontSize: "0.75rem",
                              height: 22,
                            }}
                          />
                          <Typography
                            variant="caption"
                            sx={{ color: "text.secondary", fontWeight: 500 }}
                          >
                            by {v.author_alias}
                          </Typography>
                        </Stack>
                        <Typography
                          variant="caption"
                          sx={{
                            fontFamily: "monospace",
                            fontSize: "0.75rem",
                            color: "text.secondary",
                            bgcolor: "action.hover",
                            px: 0.75,
                            py: 0.25,
                            borderRadius: 0.75,
                          }}
                        >
                          {delta}
                        </Typography>
                      </Stack>

                      <Tooltip
                        title={dayjs(v.created_at).format(
                          "YYYY-MM-DD HH:mm:ss",
                        )}
                      >
                        <Typography
                          variant="caption"
                          sx={{ color: "text.disabled", fontSize: "0.75rem" }}
                        >
                          {dayjs(v.created_at).fromNow()}
                        </Typography>
                      </Tooltip>
                    </ListItemButton>
                  );
                })}
              </>
            )}

            {!isLoading && versions.length <= 1 && (
              <Box sx={{ py: 4, textAlign: "center" }}>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  No previous versions yet.
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: "text.disabled", display: "block", mt: 0.5 }}
                >
                  Past versions appear here when edits are saved.
                </Typography>
              </Box>
            )}
          </List>
        )}
      </Box>
    </Drawer>
  );
}

export default NoteVersionHistoryDrawer;
