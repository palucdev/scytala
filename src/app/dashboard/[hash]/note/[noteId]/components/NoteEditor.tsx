"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Container from "@mui/material/Container";
import FormHelperText from "@mui/material/FormHelperText";
import TextField from "@mui/material/TextField";

import { createNoteAction, updateNoteAction } from "@/actions/notes";
import { DeleteNoteDialog } from "./DeleteNoteDialog";
import { EditorToolbar } from "./EditorToolbar";
import { LineNumberGutter } from "./LineNumberGutter";

export const MAX_NOTE_CONTENT_LENGTH = 10000;
export const MAX_NOTE_TITLE_LENGTH = 200;

export interface NoteEditorProps {
  mode: "create" | "edit";
  dashboardHash: string;
  noteId?: string;
  initialTitle?: string;
  initialContent?: string;
  initialVersion?: number;
  /** Authenticated user ID, reserved for future authorship UI */
  authorId: string;
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

  const gutterRef = useRef<HTMLDivElement>(null);

  const isDirty =
    title !== (initialTitle ?? "") || content !== (initialContent ?? "");

  const canPromptUnloadRef = useRef(false);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextTitle = e.target.value;
    setTitle(nextTitle);
    canPromptUnloadRef.current =
      nextTitle !== (initialTitle ?? "") || content !== (initialContent ?? "");
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextContent = e.target.value;
    setContent(nextContent);
    canPromptUnloadRef.current =
      title !== (initialTitle ?? "") || nextContent !== (initialContent ?? "");
  };

  const handleBeforeUnload = useCallback((e: BeforeUnloadEvent) => {
    if (canPromptUnloadRef.current) {
      e.preventDefault();
    }
  }, []);

  const containerRef = useCallback(
    (node: HTMLElement | null) => {
      if (node) {
        window.addEventListener("beforeunload", handleBeforeUnload);
      } else {
        window.removeEventListener("beforeunload", handleBeforeUnload);
      }
    },
    [handleBeforeUnload],
  );

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
            canPromptUnloadRef.current = false;
            router.push(`/dashboard/${dashboardHash}`);
            router.refresh();
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
            canPromptUnloadRef.current = false;
            router.push(`/dashboard/${dashboardHash}`);
            router.refresh();
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

  return (
    <Box
      ref={containerRef}
      sx={{
        minHeight: "100vh",
        bgcolor: "background.default",
        py: { xs: 2, sm: 4 },
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
      </Container>
    </Box>
  );
}

export default NoteEditor;
