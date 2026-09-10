"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Container from "@mui/material/Container";
import FormHelperText from "@mui/material/FormHelperText";
import TextField from "@mui/material/TextField";

import {
  createNoteAction,
  updateNoteAction,
  getNoteVersionHistoryAction,
} from "@/actions/notes";
import type { HydratedNoteVersion } from "@/schemas/notes";
import { DeleteNoteDialog } from "./DeleteNoteDialog";
import { EditorToolbar } from "./EditorToolbar";
import { LineNumberGutter } from "./LineNumberGutter";
import { NoteEditorHeader } from "./NoteEditorHeader";
import { NoteVersionHistoryDrawer } from "./NoteVersionHistoryDrawer";
import { NoteVersionPreview } from "./NoteVersionPreview";

export const MAX_NOTE_CONTENT_LENGTH = 10000;
export const MAX_NOTE_TITLE_LENGTH = 200;

export interface NoteEditorProps {
  mode: "create" | "edit";
  dashboardHash: string;
  noteId?: string;
  initialTitle?: string;
  initialContent?: string;
  initialVersion?: number;
  /** Authenticated user alias, reserved for future authorship UI */
  userAlias: string;
}

export function NoteEditor({
  mode,
  dashboardHash,
  noteId,
  initialTitle = "",
  initialContent = "",
  initialVersion,
  userAlias,
}: NoteEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const version = initialVersion;
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [versionConflict, setVersionConflict] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<HydratedNoteVersion[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [versionHistoryError, setVersionHistoryError] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<HydratedNoteVersion | null>(null);

  const gutterRef = useRef<HTMLDivElement>(null);

  const isDirty =
    !isSaved &&
    (title !== (initialTitle ?? "") || content !== (initialContent ?? ""));

  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
  };

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const handleSave = () => {
    setError(null);
    setFieldErrors({});
    setVersionConflict(false);

    startTransition(async () => {
      try {
        if (mode === "create") {
          const result = await createNoteAction({
            dashboardHash,
            title: title.trim().length > 0 ? title.trim() : undefined,
            content,
          });

          if (result.success) {
            setIsSaved(true);
            router.push(`/dashboard/${dashboardHash}`);
          } else {
            setError(result.error);
            if (result.fieldErrors) {
              setFieldErrors(result.fieldErrors);
            }
          }
        } else {
          if (!noteId || version === undefined) {
            setError("Note metadata missing.");
            return;
          }

          const result = await updateNoteAction({
            dashboardHash,
            noteId,
            title: title.trim().length > 0 ? title.trim() : "",
            content,
            expectedVersion: version,
          });

          if (result.success) {
            setIsSaved(true);
            router.push(`/dashboard/${dashboardHash}`);
          } else {
            setError(result.error);
            if (result.versionConflict) {
              setVersionConflict(true);
            }
            if (result.fieldErrors) {
              setFieldErrors(result.fieldErrors);
            }
          }
        }
      } catch {
        setError("Network error. Please check your connection and try again.");
      }
    });
  };

  const handleDelete = () => {
    setDeleteDialogOpen(true);
  };

  const fetchVersionHistory = async () => {
    if (!noteId) return;
    setIsLoadingVersions(true);
    setVersionHistoryError(null);
    try {
      const result = await getNoteVersionHistoryAction({
        dashboardHash,
        noteId,
      });
      if (result.success) {
        setVersions(result.versions);
      } else {
        setVersionHistoryError(result.error);
      }
    } catch {
      setVersionHistoryError("Failed to load version history.");
    } finally {
      setIsLoadingVersions(false);
    }
  };

  const handleOpenHistory = () => {
    setIsHistoryOpen(true);
    if (noteId && versions.length === 0 && !isLoadingVersions) {
      void fetchVersionHistory();
    }
  };

  const handleRestoreVersion = (versionToRestore: HydratedNoteVersion) => {
    if (!noteId || version === undefined) {
      setError("Note metadata missing.");
      return;
    }
    setError(null);
    setFieldErrors({});
    setVersionConflict(false);

    startTransition(async () => {
      try {
        const result = await updateNoteAction({
          dashboardHash,
          noteId,
          title: versionToRestore.title,
          content: versionToRestore.content,
          expectedVersion: version,
        });

        if (result.success) {
          setIsSaved(true);
          setTitle(versionToRestore.title);
          setContent(versionToRestore.content);
          setSelectedVersion(null);
          router.refresh();
        } else {
          setError(result.error);
          setSelectedVersion(null);
          if (result.versionConflict) {
            setVersionConflict(true);
          }
          if (result.fieldErrors) {
            setFieldErrors(result.fieldErrors);
          }
        }
      } catch {
        setError("Network error. Please check your connection and try again.");
        setSelectedVersion(null);
      }
    });
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "background.default",
        py: { xs: 2.5, sm: 3.5 },
        px: { xs: 2, sm: 3 },
      }}
    >
      <Container maxWidth="lg" component="main">
        {versionConflict && (
          <Alert
            severity="warning"
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  router.refresh();
                }}
              >
                Reload
              </Button>
            }
            sx={{ mb: 2 }}
          >
            {error ||
              "This note has been modified by someone else. Please reload and try again."}
          </Alert>
        )}

        {error && !versionConflict && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <NoteEditorHeader
          userAlias={userAlias}
          dashboardHash={dashboardHash}
          mode={mode}
          onOpenHistory={handleOpenHistory}
        />

        <Card
          sx={{
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
            boxShadow: "0 4px 20px rgba(35, 24, 13, 0.08)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <EditorToolbar
            mode={mode}
            noteTitle={title}
            version={version}
            dashboardHash={dashboardHash}
            isSaving={isPending || isSaved}
            isDirty={isDirty}
            onSave={handleSave}
            onDelete={handleDelete}
            isPreview={Boolean(selectedVersion)}
          />

          <Box sx={{ px: { xs: 2, sm: 3 }, py: 1 }}>
            <TextField
              id="note-title-input"
              placeholder="Title (optional)"
              value={title}
              onChange={handleTitleChange}
              fullWidth
              variant="standard"
              error={Boolean(fieldErrors.title)}
              helperText={fieldErrors.title?.[0]}
              slotProps={{
                htmlInput: {
                  "aria-label": "Note title",
                  maxLength: MAX_NOTE_TITLE_LENGTH,
                },
              }}
              sx={{
                "& .MuiInputBase-input": {
                  fontSize: "1.15rem",
                  fontWeight: 600,
                },
                "& .MuiInput-underline:before": {
                  borderBottomColor: "transparent",
                },
                "& .MuiInput-underline:hover:not(.Mui-disabled):before": {
                  borderBottomColor: "divider",
                },
              }}
            />
          </Box>

          <Box
            sx={{
              display: "flex",
              flexDirection: "row",
              minHeight: 450,
              position: "relative",
              borderTop: "1px solid",
              borderColor: "divider",
            }}
          >
            <LineNumberGutter content={content} ref={gutterRef} />
            <Box
              component="textarea"
              wrap="off"
              id="note-content-input"
              aria-label="Note content"
              maxLength={MAX_NOTE_CONTENT_LENGTH}
              value={content}
              onChange={handleContentChange}
              onScroll={handleScroll}
              placeholder="Type plain text note content here..."
              spellCheck={false}
              sx={{
                flex: 1,
                p: 1.5,
                border: "none",
                outline: "none",
                resize: "vertical",
                fontFamily: "monospace",
                whiteSpace: "pre",
                overflowX: "auto",
                fontSize: "0.875rem",
                lineHeight: 1.5,
                bgcolor: "transparent",
                color: "text.primary",
                width: "100%",
                minHeight: 450,
                boxSizing: "border-box",
              }}
            />
          </Box>
          {fieldErrors.content && (
            <FormHelperText error sx={{ px: { xs: 2, sm: 3 }, pb: 1 }}>
              {fieldErrors.content[0]}
            </FormHelperText>
          )}
        </Card>

        {mode === "edit" && noteId && deleteDialogOpen && (
          <DeleteNoteDialog
            open={deleteDialogOpen}
            onClose={() => setDeleteDialogOpen(false)}
            dashboardHash={dashboardHash}
            noteId={noteId}
            noteTitle={title}
          />
        )}

        {mode === "edit" && noteId && (
          <NoteVersionHistoryDrawer
            open={isHistoryOpen}
            onClose={() => setIsHistoryOpen(false)}
            versions={versions}
            isLoading={isLoadingVersions}
            error={versionHistoryError}
            selectedVersionId={selectedVersion?.id ?? null}
            onSelectVersion={setSelectedVersion}
            currentVersionNumber={version}
            currentContent={content}
            onRefresh={fetchVersionHistory}
          />
        )}

        {selectedVersion && (
          <NoteVersionPreview
            key={selectedVersion.id}
            selectedVersion={selectedVersion}
            currentTitle={title}
            currentContent={content}
            onClosePreview={() => setSelectedVersion(null)}
            onRestore={handleRestoreVersion}
            onOpenDrawer={() => setIsHistoryOpen(true)}
            isRestoring={isPending}
            isDirty={isDirty}
          />
        )}
      </Container>
    </Box>
  );
}

export default NoteEditor;
