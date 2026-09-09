"use client";

import { useId } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";

export interface ConfirmationDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: "primary" | "warning";
}

export function ConfirmationDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmColor = "primary",
}: ConfirmationDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2,
            p: 1,
          },
        },
      }}
    >
      <DialogTitle id={titleId} sx={{ fontWeight: 600 }}>
        {title}
      </DialogTitle>
      <DialogContent>
        <DialogContentText id={descriptionId}>
          {description}
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">
          {cancelLabel}
        </Button>
        <Button onClick={onConfirm} color={confirmColor} variant="contained">
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ConfirmationDialog;
