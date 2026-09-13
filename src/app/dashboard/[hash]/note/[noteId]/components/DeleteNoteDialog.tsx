"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import DeleteIcon from "@mui/icons-material/Delete";

import { deleteNoteAction } from "@/actions/notes";

export interface DeleteNoteDialogProps {
  open: boolean;
  onClose: () => void;
  dashboardHash: string;
  noteId: string;
  noteTitle: string;
  /**
   * True when the note's title could not be decrypted; the confirmation copy
   * then describes the note as unavailable instead of guessing its title.
   */
  titleUnavailable?: boolean;
}

export function DeleteNoteDialog({
  open,
  onClose,
  dashboardHash,
  noteId,
  noteTitle,
  titleUnavailable = false,
}: DeleteNoteDialogProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    return () => {
      setPassword("");
      setError(null);
    };
  }, []);

  const handleClose = () => {
    if (isPending) return;
    setPassword("");
    setError(null);
    onClose();
  };

  const handleConfirm = () => {
    if (password.trim().length === 0 || isPending) return;
    setError(null);

    startTransition(async () => {
      try {
        const result = await deleteNoteAction({
          dashboardHash,
          noteId,
          password,
        });

        if (result.success) {
          setPassword("");
          setError(null);
          onClose();
          router.replace(`/dashboard/${dashboardHash}`);
        } else {
          setPassword("");
          setError(result.error);
        }
      } catch {
        setPassword("");
        setError("Network error. Please check your connection and try again.");
      }
    });
  };

  const displayTitle = titleUnavailable
    ? "an unavailable note (its title cannot be decrypted)"
    : noteTitle.trim() || "Untitled Note";

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      aria-labelledby="delete-note-dialog-title"
      aria-describedby="delete-note-dialog-description"
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2,
            p: 1,
          },
        },
        transition: {
          onExited: () => {
            setPassword("");
            setError(null);
          },
        },
      }}
    >
      <DialogTitle id="delete-note-dialog-title" sx={{ fontWeight: 600 }}>
        Delete Note
      </DialogTitle>
      <Box
        component="form"
        onSubmit={(e: React.FormEvent) => {
          e.preventDefault();
          handleConfirm();
        }}
        noValidate
        autoComplete="off"
      >
        <DialogContent>
          <DialogContentText id="delete-note-dialog-description" sx={{ mb: 2 }}>
            {titleUnavailable
              ? "Are you sure you want to delete an unavailable note (its title cannot be decrypted)? This action cannot be undone and will permanently delete all version history."
              : `Are you sure you want to delete “${displayTitle}”? This action cannot be undone and will permanently delete all version history.`}
          </DialogContentText>

          <Typography variant="body2" color="text.secondary">
            Please enter your user password to confirm deletion.
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <TextField
            id="delete-note-password-input"
            autoFocus
            margin="dense"
            label="User Password"
            type="password"
            fullWidth
            variant="outlined"
            error={Boolean(error)}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && password.trim().length > 0 && !isPending) {
                e.preventDefault();
                handleConfirm();
              }
            }}
            disabled={isPending}
            autoComplete="off"
            placeholder="Enter your user password to confirm deletion"
            slotProps={{
              htmlInput: {
                "aria-label": "User Password",
                autoCapitalize: "none",
                autoCorrect: "off",
                spellCheck: "false",
              },
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} disabled={isPending} color="inherit">
            Cancel
          </Button>
          <Button
            type="submit"
            color="error"
            variant="contained"
            disabled={password.trim().length === 0 || isPending}
            startIcon={
              isPending ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <DeleteIcon />
              )
            }
          >
            {isPending ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

export default DeleteNoteDialog;
