"use client";

import Card from "@mui/material/Card";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";

import AutorenewIcon from "@mui/icons-material/Autorenew";
import DeleteIcon from "@mui/icons-material/Delete";
import PersonIcon from "@mui/icons-material/Person";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";

import type { ParticipantRow } from "../StepParticipants";

export interface ParticipantCardProps {
  user: ParticipantRow;
  index: number;
  aliasError?: string;
  passwordError?: string;
  isPasswordVisible: boolean;
  onTogglePasswordVisibility: () => void;
  onUpdateAlias: (value: string) => void;
  onUpdatePassword: (value: string) => void;
  onRegeneratePassword: () => void;
  onRemove: () => void;
}

export function ParticipantCard({
  user,
  index,
  aliasError,
  passwordError,
  isPasswordVisible,
  onTogglePasswordVisibility,
  onUpdateAlias,
  onUpdatePassword,
  onRegeneratePassword,
  onRemove,
}: ParticipantCardProps) {
  return (
    <Card
      variant="outlined"
      sx={{
        p: 2,
        borderColor: aliasError || passwordError ? "error.main" : "divider",
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
          value={user.userAlias}
          onChange={(e) => onUpdateAlias(e.target.value)}
          error={Boolean(aliasError)}
          helperText={aliasError || "Letters, numbers, _, - (2-30 chars)"}
          sx={{ flex: 1 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <PersonIcon fontSize="small" sx={{ color: "text.disabled" }} />
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
          onChange={(e) => onUpdatePassword(e.target.value)}
          type={isPasswordVisible ? "text" : "password"}
          error={Boolean(passwordError)}
          helperText={passwordError}
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
                    title={isPasswordVisible ? "Hide password" : "Show password"}
                  >
                    <IconButton
                      aria-label={
                        isPasswordVisible
                          ? `Hide password for ${user.userAlias || `user ${index + 1}`}`
                          : `Show password for ${user.userAlias || `user ${index + 1}`}`
                      }
                      onClick={onTogglePasswordVisibility}
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
              aria-label={`Regenerate password for ${user.userAlias || `user ${index + 1}`}`}
              onClick={onRegeneratePassword}
              color="primary"
              size="medium"
            >
              <AutorenewIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title="Remove Participant">
            <IconButton
              aria-label={`Remove ${user.userAlias || `user ${index + 1}`}`}
              onClick={onRemove}
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
}

export default ParticipantCard;
