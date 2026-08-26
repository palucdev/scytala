"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";

import { ParticipantCard } from "./participants/ParticipantCard";
import { AddParticipantCard } from "./participants/AddParticipantCard";

export interface ParticipantRow {
  id: string;
  userAlias: string;
  password: string;
}

export interface StepParticipantsProps {
  users: ParticipantRow[];
  onAddParticipant: () => void;
  onRemoveParticipant: (id: string) => void;
  onUpdateParticipant: (
    id: string,
    field: "userAlias" | "password",
    value: string,
  ) => void;
  onRegeneratePassword: (id: string) => void;
  aliasErrors?: Record<string, string>;
  passwordErrors?: Record<string, string>;
  emptyParticipantsError?: boolean;
}

export function StepParticipants({
  users,
  onAddParticipant,
  onRemoveParticipant,
  onUpdateParticipant,
  onRegeneratePassword,
  aliasErrors = {},
  passwordErrors = {},
  emptyParticipantsError = false,
}: StepParticipantsProps) {
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
        <AddParticipantCard
          onAddParticipant={onAddParticipant}
          hasError={emptyParticipantsError}
        />
      ) : (
        <Stack spacing={2}>
          {users.map((user, index) => (
            <ParticipantCard
              key={user.id}
              user={user}
              index={index}
              aliasError={aliasErrors[user.id]}
              passwordError={passwordErrors[user.id]}
              onUpdateAlias={(val) =>
                onUpdateParticipant(user.id, "userAlias", val)
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
