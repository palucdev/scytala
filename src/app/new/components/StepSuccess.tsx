"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import OutlinedInput from "@mui/material/OutlinedInput";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckIcon from "@mui/icons-material/Check";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LinkIcon from "@mui/icons-material/Link";

import { Dashboard } from "@/client/db-client";
import {
  type ParticipantCredential,
  formatCredentialsText,
} from "@/schemas/dashboard";

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
      <Card
        variant="outlined"
        sx={{
          bgcolor: "background.paper",
          borderColor: "divider",
        }}
      >
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
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
            Shareable Dashboard Link
          </Typography>

          <OutlinedInput
            fullWidth
            readOnly
            value={dashboardUrl}
            id="shareable-url-input"
            startAdornment={
              <InputAdornment position="start">
                <LinkIcon sx={{ color: "text.disabled" }} />
              </InputAdornment>
            }
            endAdornment={
              <InputAdornment position="end">
                <Tooltip
                  title={copiedKey === "url" ? "Copied!" : "Copy link"}
                >
                  <IconButton
                    aria-label="Copy dashboard link"
                    onClick={() => copyToClipboard(dashboardUrl, "url")}
                    edge="end"
                    color={copiedKey === "url" ? "success" : "default"}
                  >
                    {copiedKey === "url" ? <CheckIcon /> : <ContentCopyIcon />}
                  </IconButton>
                </Tooltip>
              </InputAdornment>
            }
            sx={{
              fontFamily: "monospace",
              bgcolor: "rgba(255, 255, 255, 0.4)",
            }}
            inputProps={{
              "aria-label": "Shareable Dashboard Link",
            }}
          />
        </CardContent>
      </Card>

      {/* Participant Credentials Card */}
      <Card
        variant="outlined"
        sx={{
          bgcolor: "background.paper",
          borderColor: "divider",
        }}
      >
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{
              justifyContent: "space-between",
              alignItems: { xs: "flex-start", sm: "center" },
              mb: 2,
            }}
          >
            <Box>
              <Typography
                variant="caption"
                sx={{
                  color: "text.disabled",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontWeight: 600,
                  display: "block",
                }}
              >
                Participant Credentials ({credentials.length})
              </Typography>
              <Typography variant="caption" sx={{ color: "error.main" }}>
                * Passwords cannot be recovered once you leave this page.
              </Typography>
            </Box>

            <Button
              variant="outlined"
              size="small"
              color={copiedKey === "all" ? "success" : "primary"}
              startIcon={
                copiedKey === "all" ? <CheckIcon /> : <ContentCopyIcon />
              }
              onClick={handleCopyAll}
              id="copy-all-credentials-btn"
            >
              {copiedKey === "all" ? "Copied All!" : "Copy All Credentials"}
            </Button>
          </Stack>

          <Stack spacing={1.5} divider={<Divider />}>
            {credentials.map((cred, idx) => {
              const credKey = `cred-${idx}`;
              const isCopied = copiedKey === credKey;
              const formattedLine = `${cred.user_alias}: ${cred.password}`;

              return (
                <Stack
                  key={cred.user_alias}
                  direction="row"
                  sx={{
                    justifyContent: "space-between",
                    alignItems: "center",
                    py: 0.5,
                  }}
                >
                  <Box sx={{ minWidth: 0, flex: 1, pr: 2 }}>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 600, color: "text.primary" }}
                    >
                      {cred.user_alias}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontFamily: "monospace",
                        color: "text.secondary",
                        letterSpacing: "0.05em",
                        wordBreak: "break-all",
                      }}
                    >
                      {cred.password}
                    </Typography>
                  </Box>

                  <Tooltip
                    title={
                      isCopied
                        ? "Copied!"
                        : `Copy credentials for ${cred.user_alias}`
                    }
                  >
                    <IconButton
                      aria-label={`Copy credentials for ${cred.user_alias}`}
                      onClick={() => copyToClipboard(formattedLine, credKey)}
                      size="small"
                      color={isCopied ? "success" : "default"}
                    >
                      {isCopied ? (
                        <CheckIcon fontSize="small" />
                      ) : (
                        <ContentCopyIcon fontSize="small" />
                      )}
                    </IconButton>
                  </Tooltip>
                </Stack>
              );
            })}
          </Stack>
        </CardContent>
      </Card>

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
