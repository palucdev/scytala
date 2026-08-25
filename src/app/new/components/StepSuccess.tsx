"use client";

import { useState, useSyncExternalStore } from "react";
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
import { ShareableLinkCard } from "./success/ShareableLinkCard";
import { CredentialsListCard } from "./success/CredentialsListCard";

function subscribeEmpty() {
  return () => {};
}

function getOriginSnapshot() {
  return typeof window !== "undefined" ? window.location.origin : "";
}

function getOriginServerSnapshot() {
  return "";
}

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
  const origin = useSyncExternalStore(
    subscribeEmpty,
    getOriginSnapshot,
    getOriginServerSnapshot,
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const dashboardUrl = `${origin || ""}/dashboard/${dashboard.hash}`;

  const copyToClipboard = async (text: string, key: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => {
          setCopiedKey((prev) => (prev === key ? null : prev));
        }, 2500);
      }
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  };

  const handleCopyAll = () => {
    const fullText = formatCredentialsText(
      dashboard.title,
      dashboardUrl,
      credentials,
    );
    copyToClipboard(fullText, "all");
  };

  const handleEnter = () => {
    if (onEnterDashboard) {
      onEnterDashboard();
    } else {
      router.push(`/dashboard/${dashboard.hash}`);
    }
  };

  return (
    <Stack spacing={3} sx={{ width: "100%", py: 1 }}>
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
        onCopy={() => copyToClipboard(dashboardUrl, "url")}
      />

      {/* Participant Credentials Card */}
      <CredentialsListCard
        credentials={credentials}
        copiedKey={copiedKey}
        onCopyAll={handleCopyAll}
        onCopySingle={copyToClipboard}
      />

      {/* Enter Dashboard CTA */}
      <Box sx={{ pt: 1, display: "flex", justifyContent: "flex-end" }}>
        <Button
          variant="contained"
          color="primary"
          size="large"
          endIcon={<ArrowForwardIcon />}
          onClick={handleEnter}
          id="enter-dashboard-btn"
          sx={{ px: 4, py: 1.25 }}
        >
          Enter Dashboard
        </Button>
      </Box>
    </Stack>
  );
}

export default StepSuccess;
