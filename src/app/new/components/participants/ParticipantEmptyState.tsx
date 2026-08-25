"use client";

import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";

export interface ParticipantEmptyStateProps {
  onAddParticipant: () => void;
}

export function ParticipantEmptyState({
  onAddParticipant,
}: ParticipantEmptyStateProps) {
  return (
    <Card
      variant="outlined"
      sx={{
        p: 3,
        textAlign: "center",
        borderColor: "divider",
        bgcolor: "background.paper",
        borderStyle: "dashed",
      }}
    >
      <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
        <Typography variant="body1" sx={{ color: "text.secondary", mb: 2 }}>
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
