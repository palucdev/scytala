"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

import { Dashboard } from "@/client/db-client";
import {
  type ParticipantCredential,
  formatCredentialsText,
} from "@/schemas/dashboard";
import { copyToClipboard } from "@/utils/clipboard";
import { ShareableLinkCard } from "./success/ShareableLinkCard";
import { CredentialsListCard } from "./success/CredentialsListCard";

export interface StepSuccessProps {
  dashboard: Dashboard;
  credentials: ParticipantCredential[];
  onEnterDashboard?: () => void;
}

export function StepSuccess({
  dashboard,
  credentials,
  onEnterDashboard,
}: StepSuccessProps) {
  const router = useRouter();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const dashboardUrl = `${origin}/dashboard/${dashboard.hash}`;

  const handleCopy = async (text: string, key: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 2500);
    }
  };

  const handleCopyAll = () => {
    const fullText = formatCredentialsText(
      dashboard.title,
      dashboardUrl,
      credentials,
    );
    handleCopy(fullText, "all");
  };

  const handleEnter = () => {
    if (onEnterDashboard) {
      onEnterDashboard();
    } else {
      router.push(`/dashboard/${dashboard.hash}`);
    }
  };

  return (
    <Stack spacing={3} sx={{ width: "100%", pt: 1, pb: 0 }}>
      <Box>
        <Typography
          variant="h3"
          component="h2"
          sx={{ color: "primary.main", mb: 0.5 }}
        >
          Dashboard Created!
        </Typography>
        <Typography variant="body1" sx={{ color: "text.secondary" }}>
          Your dashboard is live and ready. Save and distribute credentials
          before proceeding.
        </Typography>
      </Box>

      <Alert severity="success" id="wizard-success-alert">
        <AlertTitle>Success</AlertTitle>
        Dashboard <strong>{dashboard.title}</strong> was successfully
        created.
      </Alert>

      {/* Shareable Link Card */}
      <ShareableLinkCard
        dashboardUrl={dashboardUrl}
        isCopied={copiedKey === "url"}
        onCopy={() => handleCopy(dashboardUrl, "url")}
      />

      {/* Participant Credentials Card */}
      <CredentialsListCard
        credentials={credentials}
        copiedKey={copiedKey}
        onCopyAll={handleCopyAll}
        onCopySingle={handleCopy}
      />

      {/* Enter Dashboard CTA */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          pt: 2,
          mt: 2,
          borderTop: "1px solid",
          borderColor: "divider",
        }}
      >
        <Button
          variant="contained"
          color="primary"
          endIcon={<ArrowForwardIcon />}
          onClick={handleEnter}
          id="enter-dashboard-btn"
        >
          Enter Dashboard
        </Button>
      </Box>
    </Stack>
  );
}

export default StepSuccess;
