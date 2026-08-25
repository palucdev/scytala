"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";

import { ParticipantCard } from "./participants/ParticipantCard";
import { ParticipantEmptyState } from "./participants/ParticipantEmptyState";

export interface ParticipantRow {
  id: string;
  user_alias: string;
  password: string;
}

export interface StepParticipantsProps {
  users: ParticipantRow[];
  onAddParticipant: () => void;
  onRemoveParticipant: (id: string) => void;
  onUpdateParticipant: (
    id: string,
    field: "user_alias" | "password",
    value: string,
  ) => void;
  onRegeneratePassword: (id: string) => void;
  aliasErrors?: Record<string, string>;
}

export function StepParticipants({
  users,
  onAddParticipant,
  onRemoveParticipant,
  onUpdateParticipant,
  onRegeneratePassword,
  aliasErrors = {},
}: StepParticipantsProps) {
  const [visiblePasswords, setVisiblePasswords] = useState<
    Record<string, boolean>
  >({});

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <Stack spacing={3} sx={{ width: "100%", py: 1 }}>
      <Box>
        <Typography
          variant="h3"
          component="h2"
          sx={{ color: "primary.main", mb: 0.5 }}
        >
          Participant Credentials
        </Typography>
        <Typography variant="body1" sx={{ color: "text.secondary" }}>
          Add one or more collaborators who will have access to this dashboard.
          Passwords are generated automatically.
        </Typography>
      </Box>

      {users.length === 0 ? (
        <ParticipantEmptyState onAddParticipant={onAddParticipant} />
      ) : (
        <Stack spacing={2}>
          {users.map((user, index) => (
            <ParticipantCard
              key={user.id}
              user={user}
              index={index}
              aliasError={aliasErrors[user.id]}
              isPasswordVisible={Boolean(visiblePasswords[user.id])}
              onTogglePasswordVisibility={() =>
                togglePasswordVisibility(user.id)
              }
              onUpdateAlias={(val) =>
                onUpdateParticipant(user.id, "user_alias", val)
              }
              onUpdatePassword={(val) =>
                onUpdateParticipant(user.id, "password", val)
              }
              onRegeneratePassword={() => onRegeneratePassword(user.id)}
              onRemove={() => onRemoveParticipant(user.id)}
            />
          ))}

          <Box sx={{ pt: 1 }}>
            <Button
              variant="outlined"
              color="primary"
              startIcon={<AddIcon />}
              onClick={onAddParticipant}
              id="add-participant-btn"
            >
              Add Another Participant
            </Button>
          </Box>
        </Stack>
      )}
    </Stack>
  );
}

export default StepParticipants;
