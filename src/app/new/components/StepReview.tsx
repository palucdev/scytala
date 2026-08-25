"use client";

import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { ReviewSummaryCard } from "./review/ReviewSummaryCard";

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
          Confirm your dashboard configuration and credentials before proceeding
          with creation.
        </Typography>
      </Box>

      {submitError && (
        <Alert severity="error" id="wizard-submit-error-alert">
          <AlertTitle>Creation Failed</AlertTitle>
          {submitError}. Please check your inputs and try again.
        </Alert>
      )}

      <ReviewSummaryCard
        title={title}
        description={description}
        users={users}
      />

      <Alert severity="info" id="wizard-review-info-alert">
        <AlertTitle>Credentials Security</AlertTitle>
        You can review and copy participant credentials now, or save them on the
        next screen once the dashboard is created. Passwords cannot be
        recovered after leaving the wizard.
      </Alert>
    </Stack>
  );
}

export default StepReview;
