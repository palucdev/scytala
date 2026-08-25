"use client";

import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";

export const WIZARD_STEPS = [
  "Details",
  "Participants",
  "Review",
  "Share & Connect",
];

export interface WizardStepperProps {
  activeStep: number;
}

export function WizardStepper({ activeStep }: WizardStepperProps) {
  return (
    <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4 }}>
      {WIZARD_STEPS.map((label) => (
        <Step key={label}>
          <StepLabel>{label}</StepLabel>
        </Step>
      ))}
    </Stepper>
  );
}

export default WizardStepper;
