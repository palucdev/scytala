"use client";

import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

export interface StepReviewProps {
  title: string;
  description: string;
  users: Array<{ id: string; user_alias: string; password: string }>;
  submitError?: string | null;
}

export function StepReview({
  title,
  description,
  users,
  submitError,
}: StepReviewProps) {
  return (
    <Stack spacing={3} sx={{ width: "100%", py: 1 }}>
      <Box>
        <Typography
          variant="h3"
          component="h2"
          sx={{ color: "primary.main", mb: 0.5 }}
        >
          Review & Confirmation
        </Typography>
        <Typography variant="body1" sx={{ color: "text.secondary" }}>
          Confirm your dashboard configuration before proceeding with creation.
        </Typography>
      </Box>

      {submitError && (
        <Alert severity="error" id="wizard-submit-error-alert">
          <AlertTitle>Creation Failed</AlertTitle>
          {submitError}. Please check your inputs and try again.
        </Alert>
      )}

      <Card
        variant="outlined"
        sx={{
          bgcolor: "background.paper",
          borderColor: "divider",
        }}
      >
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack spacing={2.5}>
            <Box>
              <Typography
                variant="caption"
                sx={{
                  color: "text.disabled",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontWeight: 600,
                  display: "block",
                  mb: 0.5,
                }}
              >
                Dashboard Title
              </Typography>
              <Typography
                variant="h3"
                sx={{ color: "text.primary", fontSize: "1.25rem" }}
              >
                {title || "(No title provided)"}
              </Typography>
            </Box>

            <Divider />

            <Box>
              <Typography
                variant="caption"
                sx={{
                  color: "text.disabled",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontWeight: 600,
                  display: "block",
                  mb: 0.5,
                }}
              >
                Description
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  color: description ? "text.primary" : "text.disabled",
                  fontStyle: description ? "normal" : "italic",
                  whiteSpace: "pre-wrap",
                }}
              >
                {description || "No description provided"}
              </Typography>
            </Box>

            <Divider />

            <Box>
              <Typography
                variant="caption"
                sx={{
                  color: "text.disabled",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontWeight: 600,
                  display: "block",
                  mb: 1,
                }}
              >
                Configured Participants ({users.length})
              </Typography>
              <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                {users.map((user) => (
                  <Chip
                    key={user.id}
                    label={user.user_alias || "Unnamed"}
                    variant="outlined"
                    color="primary"
                    sx={{
                      fontSize: "0.95rem",
                      bgcolor: "rgba(113, 56, 19, 0.04)",
                    }}
                  />
                ))}
              </Stack>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Alert severity="info" sx={{ bgcolor: "rgba(184, 134, 54, 0.1)" }}>
        <AlertTitle>One-Time Credentials Display</AlertTitle>
        Passwords will be revealed only once on the next screen. Please ensure
        you copy them for distribution to participants.
      </Alert>
    </Stack>
  );
}

export default StepReview;
