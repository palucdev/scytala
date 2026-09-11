"use client";

import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";

export interface NoteVersionPreviewActionsProps {
  showDiff: boolean;
  onToggleDiff: (showDiff: boolean) => void;
  onClose: () => void;
}

export function NoteVersionPreviewActions({
  showDiff,
  onToggleDiff,
  onClose,
}: NoteVersionPreviewActionsProps) {
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{ alignItems: "center", flexWrap: "wrap" }}
    >
      <FormControlLabel
        control={
          <Switch
            checked={showDiff}
            onChange={(e) => onToggleDiff(e.target.checked)}
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
        onClick={onClose}
        aria-label="Close preview"
        edge="end"
        sx={{ color: "text.primary", p: 1 }}
      >
        <CloseIcon />
      </IconButton>
    </Stack>
  );
}

export default NoteVersionPreviewActions;
