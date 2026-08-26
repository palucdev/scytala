"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

export interface StepDetailsProps {
  title: string;
  description: string;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  titleError?: string | null;
}

export function StepDetails({
  title,
  description,
  onTitleChange,
  onDescriptionChange,
  titleError,
}: StepDetailsProps) {
  return (
    <Stack spacing={3} sx={{ width: "100%", py: 1 }}>
      <Box>
        <Typography
          variant="h3"
          component="h2"
          sx={{ color: "primary.main", mb: 0.5 }}
        >
          Dashboard Details
        </Typography>
        <Typography variant="body1" sx={{ color: "text.secondary" }}>
          Provide a name and an optional description for your new dashboard.
        </Typography>
      </Box>

      <TextField
        id="dashboard-title-input"
        label="Dashboard Title"
        placeholder="e.g. Project Apollo Workspace"
        required
        fullWidth
        autoFocus
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        error={Boolean(titleError)}
        helperText={titleError || `${title.length}/80 characters`}
        slotProps={{
          htmlInput: {
            maxLength: 80,
            "aria-label": "Dashboard Title",
          },
        }}
      />

      <TextField
        id="dashboard-description-input"
        label="Description (Optional)"
        placeholder="Brief summary of the purpose or instructions for collaborators..."
        fullWidth
        multiline
        rows={3}
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        helperText={`${description.length}/300 characters`}
        slotProps={{
          htmlInput: {
            maxLength: 300,
            "aria-label": "Dashboard Description",
          },
        }}
      />
    </Stack>
  );
}

export default StepDetails;
