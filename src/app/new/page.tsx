"use client";

import { useState, useCallback } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import Typography from "@mui/material/Typography";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

import { StepDetails } from "./components/StepDetails";
import {
  StepParticipants,
  type ParticipantRow,
} from "./components/StepParticipants";
import { StepReview } from "./components/StepReview";
import { StepSuccess } from "./components/StepSuccess";

import { createDashboardAction } from "@/actions/dashboard";
import {
  ALIAS_REGEX,
  type ParticipantCredential,
} from "@/schemas/dashboard";
import { type Dashboard } from "@/client/db-client";
import { generateRandomPassword } from "@/lib/crypto";

const STEPS = ["Details", "Participants", "Review", "Share & Connect"];

export function DashboardCreationWizard() {
  const [activeStep, setActiveStep] = useState<number>(0);
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [titleError, setTitleError] = useState<string | null>(null);

  const [users, setUsers] = useState<ParticipantRow[]>([]);
  const [aliasErrors, setAliasErrors] = useState<Record<string, string>>({});

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [createdResult, setCreatedResult] = useState<{
    dashboard: Dashboard;
    credentials: ParticipantCredential[];
  } | null>(null);

  const handleTitleChange = useCallback(
    (value: string) => {
      setTitle(value);
      if (titleError) {
        const trimmed = value.trim();
        if (!trimmed) {
          setTitleError("Dashboard title is required");
        } else if (trimmed.length > 80) {
          setTitleError("Dashboard title must not exceed 80 characters");
        } else {
          setTitleError(null);
        }
      }
    },
    [titleError],
  );

  const handleDescriptionChange = useCallback((value: string) => {
    setDescription(value);
  }, []);

  const handleAddParticipant = useCallback(() => {
    const newId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newPassword = generateRandomPassword(16);

    setUsers((prev) => [
      ...prev,
      {
        id: newId,
        user_alias: "",
        password: newPassword,
      },
    ]);
  }, []);

  const handleRemoveParticipant = useCallback((id: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== id));
    setAliasErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const handleUpdateParticipant = useCallback(
    (id: string, field: "user_alias" | "password", value: string) => {
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, [field]: value } : u)),
      );
      if (field === "user_alias") {
        setAliasErrors((prev) => {
          if (!prev[id]) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    },
    [],
  );

  const handleRegeneratePassword = useCallback((id: string) => {
    const newPassword = generateRandomPassword(16);
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, password: newPassword } : u)),
    );
  }, []);

  const validateStep1 = useCallback((): boolean => {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitleError("Dashboard title is required");
      return false;
    }
    if (trimmed.length > 80) {
      setTitleError("Dashboard title must not exceed 80 characters");
      return false;
    }
    setTitleError(null);
    return true;
  }, [title]);

  const validateStep2 = useCallback((): boolean => {
    if (users.length === 0) {
      return false;
    }

    const errors: Record<string, string> = {};
    const seenAliases = new Map<string, string>();

    for (const user of users) {
      const trimmedAlias = user.user_alias.trim();
      if (!trimmedAlias) {
        errors[user.id] = "Alias is required";
      } else if (trimmedAlias.length < 2) {
        errors[user.id] = "Alias must be at least 2 characters";
      } else if (trimmedAlias.length > 30) {
        errors[user.id] = "Alias must be at most 30 characters";
      } else if (!ALIAS_REGEX.test(trimmedAlias)) {
        errors[user.id] =
          "Alias can only contain letters, numbers, hyphens, and underscores";
      } else if (!user.password || user.password.length < 6) {
        errors[user.id] = "Password must be at least 6 characters";
      } else if (user.password.length > 128) {
        errors[user.id] = "Password must be at most 128 characters";
      } else {
        const lower = trimmedAlias.toLowerCase();
        if (seenAliases.has(lower)) {
          errors[user.id] = "Participant aliases must be unique";
          const prevId = seenAliases.get(lower)!;
          if (!errors[prevId]) {
            errors[prevId] = "Participant aliases must be unique";
          }
        } else {
          seenAliases.set(lower, user.id);
        }
      }
    }

    setAliasErrors(errors);
    return Object.keys(errors).length === 0;
  }, [users]);

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        users: users.map((u) => ({
          id: u.id,
          user_alias: u.user_alias.trim(),
          password: u.password,
        })),
      };

      const result = await createDashboardAction(payload);

      if (result.success) {
        setCreatedResult({
          dashboard: result.dashboard,
          credentials: result.credentials,
        });
        setActiveStep(3);
      } else {
        setSubmitError(result.error);
      }
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to create dashboard",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [title, description, users]);

  const handleNext = useCallback(() => {
    if (activeStep === 0) {
      if (validateStep1()) {
        setActiveStep(1);
      }
    } else if (activeStep === 1) {
      if (validateStep2()) {
        setActiveStep(2);
      }
    } else if (activeStep === 2) {
      handleSubmit();
    }
  }, [activeStep, validateStep1, validateStep2, handleSubmit]);

  const handleBack = useCallback(() => {
    if (activeStep > 0 && activeStep < 3 && !isSubmitting) {
      setActiveStep((prev) => prev - 1);
      setSubmitError(null);
    }
  }, [activeStep, isSubmitting]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        px: { xs: 1.5, sm: 3 },
        py: { xs: 3, sm: 6 },
      }}
    >
      <Container
        component="main"
        maxWidth="md"
        sx={{
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          p: { xs: 2.5, sm: 4 },
          boxShadow: "0 4px 20px rgba(35, 24, 13, 0.08)",
          width: "100%",
        }}
      >
        {/* Header */}
        <Box sx={{ textAlign: "center", mb: 4 }}>
          <Typography
            variant="h1"
            component="h1"
            sx={{
              fontSize: { xs: "2rem", sm: "2.5rem" },
              color: "primary.main",
              mb: 1,
            }}
          >
            Create New Dashboard
          </Typography>
          <Typography variant="body1" sx={{ color: "text.secondary" }}>
            Set up a private, end-to-end encrypted dashboard with dedicated
            participant credentials.
          </Typography>
        </Box>

        {/* Stepper */}
        <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4 }}>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {/* Step Content */}
        <Box sx={{ minHeight: 280, mb: 4 }}>
          {activeStep === 0 && (
            <StepDetails
              title={title}
              description={description}
              onTitleChange={handleTitleChange}
              onDescriptionChange={handleDescriptionChange}
              titleError={titleError}
            />
          )}
          {activeStep === 1 && (
            <StepParticipants
              users={users}
              onAddParticipant={handleAddParticipant}
              onRemoveParticipant={handleRemoveParticipant}
              onUpdateParticipant={handleUpdateParticipant}
              onRegeneratePassword={handleRegeneratePassword}
              aliasErrors={aliasErrors}
            />
          )}
          {activeStep === 2 && (
            <StepReview
              title={title}
              description={description}
              users={users}
              submitError={submitError}
            />
          )}
          {activeStep === 3 && createdResult && (
            <StepSuccess
              dashboard={createdResult.dashboard}
              credentials={createdResult.credentials}
            />
          )}
        </Box>

        {/* Wizard Navigation Footer */}
        {activeStep < 3 && (
          <Stack
            direction="row"
            sx={{
              justifyContent: "space-between",
              alignItems: "center",
              pt: 2,
              borderTop: "1px solid",
              borderColor: "divider",
            }}
          >
            <Button
              variant="outlined"
              color="primary"
              onClick={handleBack}
              disabled={activeStep === 0 || isSubmitting}
              startIcon={<ArrowBackIcon />}
              id="wizard-back-btn"
            >
              Back
            </Button>

            {activeStep < 2 ? (
              <Button
                variant="contained"
                color="primary"
                onClick={handleNext}
                endIcon={<ArrowForwardIcon />}
                id="wizard-next-btn"
              >
                Next
              </Button>
            ) : (
              <Button
                variant="contained"
                color="primary"
                onClick={handleNext}
                disabled={isSubmitting}
                startIcon={
                  isSubmitting ? (
                    <CircularProgress size={20} color="inherit" />
                  ) : undefined
                }
                id="wizard-create-btn"
              >
                {isSubmitting ? "Creating Dashboard..." : "Create Dashboard"}
              </Button>
            )}
          </Stack>
        )}
      </Container>
    </Box>
  );
}

export default DashboardCreationWizard;
