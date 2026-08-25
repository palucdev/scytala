"use client";

import Box from "@mui/material/Box";
import Container from "@mui/material/Container";

import {
  StepDetails,
  StepParticipants,
  StepReview,
  StepSuccess,
  WizardHeader,
  WizardStepper,
  WizardNavigation,
} from "./components";
import { useWizardState } from "./hooks/useWizardState";

export function DashboardCreationWizard() {
  const {
    activeStep,
    title,
    description,
    titleError,
    users,
    aliasErrors,
    emptyParticipantsError,
    isSubmitting,
    submitError,
    createdResult,
    handleTitleChange,
    handleDescriptionChange,
    handleAddParticipant,
    handleRemoveParticipant,
    handleUpdateParticipant,
    handleRegeneratePassword,
    handleNext,
    handleBack,
  } = useWizardState();

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
        <WizardHeader />
        <WizardStepper activeStep={activeStep} />

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
              emptyParticipantsError={emptyParticipantsError}
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

        <WizardNavigation
          activeStep={activeStep}
          isSubmitting={isSubmitting}
          onBack={handleBack}
          onNext={handleNext}
        />
      </Container>
    </Box>
  );
}

export default DashboardCreationWizard;
