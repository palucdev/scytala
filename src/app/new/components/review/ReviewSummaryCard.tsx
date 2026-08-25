"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import CheckIcon from "@mui/icons-material/Check";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

import { formatCredentialsText } from "@/schemas/dashboard";

export interface ReviewSummaryCardProps {
  title: string;
  description: string;
  users: Array<{ id: string; user_alias: string; password: string }>;
}

export function ReviewSummaryCard({
  title,
  description,
  users,
}: ReviewSummaryCardProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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
    const formatted = formatCredentialsText(
      title,
      "(Generated after creation)",
      users.map((u) => ({
        user_alias: u.user_alias,
        password: u.password,
      })),
    );
    copyToClipboard(formatted, "all");
  };

  return (
    <Card
      variant="outlined"
      sx={{
        bgcolor: "background.paper",
        borderColor: "divider",
      }}
    >
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack spacing={2.5}>
          {/* Dashboard Title */}
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

          {/* Description */}
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

          {/* Configured Participants with Credentials */}
          <Box>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              sx={{
                justifyContent: "space-between",
                alignItems: { xs: "flex-start", sm: "center" },
                mb: 1.5,
              }}
            >
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
                Configured Participants ({users.length})
              </Typography>

              {users.length > 0 && (
                <Button
                  variant="outlined"
                  size="small"
                  color={copiedKey === "all" ? "success" : "primary"}
                  startIcon={
                    copiedKey === "all" ? <CheckIcon /> : <ContentCopyIcon />
                  }
                  onClick={handleCopyAll}
                  id="review-copy-all-credentials-btn"
                >
                  {copiedKey === "all" ? "Copied All!" : "Copy All Credentials"}
                </Button>
              )}
            </Stack>

            <Stack spacing={0}>
              {users.map((user, idx) => {
                const credKey = `review-cred-${idx}`;
                const isCopied = copiedKey === credKey;
                const formattedLine = `${user.user_alias}: ${user.password}`;

                return (
                  <Stack
                    key={user.id}
                    direction="row"
                    onClick={() => copyToClipboard(formattedLine, credKey)}
                    sx={{
                      justifyContent: "space-between",
                      alignItems: "center",
                      py: 1,
                      px: 2,
                      borderRadius: 1,
                      cursor: "pointer",
                      "&:nth-of-type(odd)": {
                        bgcolor: "action.hover",
                      },
                      "&:hover": {
                        bgcolor: "action.selected",
                        "& .credential-password": {
                          filter: "none",
                        },
                      },
                    }}
                  >
                    <Box sx={{ minWidth: 0, flex: 1, pr: 2 }}>
                      <Typography
                        variant="body1"
                        sx={{ fontWeight: 600, color: "text.primary" }}
                      >
                        {user.user_alias || "Unnamed"}
                      </Typography>
                      <Typography
                        variant="body1"
                        className="credential-password"
                        sx={{
                          fontFamily: "monospace",
                          color: "text.secondary",
                          letterSpacing: "0.05em",
                          wordBreak: "break-all",
                          filter: "blur(6px)",
                          transition: "filter 0.2s ease",
                        }}
                      >
                        {user.password}
                      </Typography>
                    </Box>

                    <Tooltip
                      title={
                        isCopied
                          ? "Copied!"
                          : `Copy credentials for ${user.user_alias}`
                      }
                    >
                      <IconButton
                        aria-label={`Copy credentials for ${user.user_alias}`}
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
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default ReviewSummaryCard;
