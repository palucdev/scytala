"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import AddIcon from "@mui/icons-material/Add";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import DeleteIcon from "@mui/icons-material/Delete";
import PersonIcon from "@mui/icons-material/Person";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";

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
      ) : (
        <Stack spacing={2}>
          {users.map((user, index) => {
            const isPasswordVisible = Boolean(visiblePasswords[user.id]);
            const aliasError = aliasErrors[user.id];

            return (
              <Card
                key={user.id}
                variant="outlined"
                sx={{
                  p: 2,
                  borderColor: aliasError ? "error.main" : "divider",
                  bgcolor: "background.paper",
                }}
              >
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={2}
                  sx={{ alignItems: { xs: "stretch", sm: "flex-start" } }}
                >
                  <TextField
                    label={`Participant #${index + 1} Alias`}
                    placeholder="e.g. Alice"
                    required
                    value={user.user_alias}
                    onChange={(e) =>
                      onUpdateParticipant(user.id, "user_alias", e.target.value)
                    }
                    error={Boolean(aliasError)}
                    helperText={
                      aliasError || "Letters, numbers, _, - (2-30 chars)"
                    }
                    sx={{ flex: 1 }}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <PersonIcon
                              fontSize="small"
                              sx={{ color: "text.disabled" }}
                            />
                          </InputAdornment>
                        ),
                      },
                      htmlInput: {
                        maxLength: 30,
                        "aria-label": `Participant ${index + 1} Alias`,
                      },
                    }}
                  />

                  <TextField
                    label="Password"
                    value={user.password}
                    onChange={(e) =>
                      onUpdateParticipant(user.id, "password", e.target.value)
                    }
                    type={isPasswordVisible ? "text" : "password"}
                    sx={{
                      flex: 1.2,
                      "& input": {
                        fontFamily: "monospace",
                        letterSpacing: isPasswordVisible ? "0.05em" : "0.2em",
                      },
                    }}
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <Tooltip
                              title={
                                isPasswordVisible
                                  ? "Hide password"
                                  : "Show password"
                              }
                            >
                              <IconButton
                                aria-label={
                                  isPasswordVisible
                                    ? `Hide password for ${user.user_alias || `user ${index + 1}`}`
                                    : `Show password for ${user.user_alias || `user ${index + 1}`}`
                                }
                                onClick={() =>
                                  togglePasswordVisibility(user.id)
                                }
                                edge="end"
                                size="small"
                              >
                                {isPasswordVisible ? (
                                  <VisibilityOffIcon fontSize="small" />
                                ) : (
                                  <VisibilityIcon fontSize="small" />
                                )}
                              </IconButton>
                            </Tooltip>
                          </InputAdornment>
                        ),
                      },
                      htmlInput: {
                        maxLength: 128,
                        "aria-label": `Participant ${index + 1} Password`,
                      },
                    }}
                  />

                  <Stack
                    direction="row"
                    spacing={0.5}
                    sx={{
                      alignItems: "center",
                      justifyContent: { xs: "flex-end", sm: "center" },
                      pt: { xs: 0, sm: 1 },
                    }}
                  >
                    <Tooltip title="Regenerate Password">
                      <IconButton
                        aria-label={`Regenerate password for ${user.user_alias || `user ${index + 1}`}`}
                        onClick={() => onRegeneratePassword(user.id)}
                        color="primary"
                        size="medium"
                      >
                        <AutorenewIcon />
                      </IconButton>
                    </Tooltip>

                    <Tooltip title="Remove Participant">
                      <IconButton
                        aria-label={`Remove ${user.user_alias || `user ${index + 1}`}`}
                        onClick={() => onRemoveParticipant(user.id)}
                        color="error"
                        size="medium"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Stack>
              </Card>
            );
          })}

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
