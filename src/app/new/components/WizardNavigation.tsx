"use client";

import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

export interface WizardNavigationProps {
  activeStep: number;
  isSubmitting: boolean;
  onBack: () => void;
  onNext: () => void;
}

export function WizardNavigation({
  activeStep,
  isSubmitting,
  onBack,
  onNext,
}: WizardNavigationProps) {
  if (activeStep >= 3) {
    return null;
  }

  return (
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
        onClick={onBack}
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
          onClick={onNext}
          endIcon={<ArrowForwardIcon />}
          id="wizard-next-btn"
        >
          Next
        </Button>
      ) : (
        <Button
          variant="contained"
          color="primary"
          onClick={onNext}
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
  );
}

export default WizardNavigation;
