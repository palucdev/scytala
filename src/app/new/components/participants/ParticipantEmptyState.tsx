"use client";

import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";

export interface ParticipantEmptyStateProps {
  onAddParticipant: () => void;
  hasError?: boolean;
}

export function ParticipantEmptyState({
  onAddParticipant,
  hasError = false,
}: ParticipantEmptyStateProps) {
  return (
    <Card
      variant="outlined"
      sx={{
        p: 3,
        textAlign: "center",
        borderColor: hasError ? "error.main" : "divider",
        bgcolor: hasError ? "rgba(156, 59, 40, 0.04)" : "background.paper",
        borderStyle: "dashed",
        borderWidth: hasError ? 2 : 1,
        transition: "border-color 0.2s ease, background-color 0.2s ease",
      }}
    >
      <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
        <Typography
          variant="body1"
          sx={{
            color: hasError ? "error.main" : "text.secondary",
            fontWeight: hasError ? 600 : 400,
            mb: 2,
            transition: "color 0.2s ease",
          }}
        >
          No participants added yet. At least one participant is required.
        </Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={onAddParticipant}
          id="add-first-participant-btn"
        >
          Add Participant
        </Button>
      </CardContent>
    </Card>
  );
}

export default ParticipantEmptyState;
