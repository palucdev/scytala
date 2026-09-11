"use client";

import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";

export const MAX_NOTE_TITLE_LENGTH = 200;

export interface NoteTitleInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: boolean;
  helperText?: string;
  maxLength?: number;
  disabled?: boolean;
}

export function NoteTitleInput({
  value,
  onChange,
  error = false,
  helperText,
  maxLength = MAX_NOTE_TITLE_LENGTH,
  disabled = false,
}: NoteTitleInputProps) {
  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 1 }}>
      <TextField
        id="note-title-input"
        placeholder="Title (optional)"
        value={value}
        onChange={onChange}
        fullWidth
        variant="standard"
        error={error}
        helperText={helperText}
        disabled={disabled}
        slotProps={{
          htmlInput: {
            "aria-label": "Note title",
            maxLength,
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
  );
}
