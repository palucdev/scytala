"use client";


import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import CheckIcon from "@mui/icons-material/Check";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

import type { ParticipantCredential } from "@/schemas/dashboard";

export interface CredentialRowProps {
  credential: ParticipantCredential;
  isCopied: boolean;
  onCopy: () => void;
}

export function CredentialRow({
  credential,
  isCopied,
  onCopy,
}: CredentialRowProps) {
  return (
    <Stack
      direction="row"
      onClick={onCopy}
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
          {credential.user_alias}
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
          {credential.password}
        </Typography>
      </Box>

      <Tooltip
        title={
          isCopied
            ? "Copied!"
            : `Copy credentials for ${credential.user_alias}`
        }
      >
        <IconButton
          aria-label={`Copy credentials for ${credential.user_alias}`}
          onClick={onCopy}
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
}

export default CredentialRow;
