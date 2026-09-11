"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Container from "@mui/material/Container";
import {
  createNoteAction,
  updateNoteAction,
} from "@/actions/notes";
import type { HydratedNoteVersion } from "@/schemas/notes";
import { EditorToolbar } from "./EditorToolbar";
import { NoteContentArea } from "./NoteContentArea";
import { NoteEditorHeader } from "./NoteEditorHeader";
import { NoteTitleInput } from "./NoteTitleInput";
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
  const [isSaved, setIsSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<HydratedNoteVersion | null>(null);

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
    if (isSaved) setIsSaved(false);
    setTitle(e.target.value);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isSaved) setIsSaved(false);
    setContent(e.target.value);
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

  const handleOpenHistory = () => {
    setIsHistoryOpen(true);
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
            noteId={noteId}
            noteTitle={title}
            version={version}
            dashboardHash={dashboardHash}
            isSaving={isPending || isSaved}
            isDirty={isDirty}
            onSave={handleSave}
            isPreview={Boolean(selectedVersion)}
          />

          <NoteTitleInput
            value={title}
            onChange={handleTitleChange}
            error={Boolean(fieldErrors.title)}
            helperText={fieldErrors.title?.[0]}
          />

          <NoteContentArea
            mode="edit"
            value={content}
            onChange={handleContentChange}
            error={Boolean(fieldErrors.content)}
            helperText={fieldErrors.content?.[0]}
          />
        </Card>

        {mode === "edit" && noteId && (
          <NoteVersionHistoryDrawer
            open={isHistoryOpen}
            onClose={() => setIsHistoryOpen(false)}
            dashboardHash={dashboardHash}
            noteId={noteId}
            selectedVersionId={selectedVersion?.id ?? null}
            onSelectVersion={setSelectedVersion}
            currentVersionNumber={version}
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
