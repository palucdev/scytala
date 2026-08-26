"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import CheckIcon from "@mui/icons-material/Check";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

import type { ParticipantCredential } from "@/schemas/dashboard";
import { CredentialRow } from "./CredentialRow";

export interface CredentialsListCardProps {
  credentials: ParticipantCredential[];
  copiedKey: string | null;
  onCopyAll: () => void;
  onCopySingle: (text: string, key: string) => void;
}

export function CredentialsListCard({
  credentials,
  copiedKey,
  onCopyAll,
  onCopySingle,
}: CredentialsListCardProps) {
  return (
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
          </Box>

          <Button
            variant="outlined"
            size="small"
            color={copiedKey === "all" ? "success" : "primary"}
            startIcon={
              copiedKey === "all" ? <CheckIcon /> : <ContentCopyIcon />
            }
            onClick={onCopyAll}
            id="copy-all-credentials-btn"
          >
            {copiedKey === "all" ? "Copied All!" : "Copy All Credentials"}
          </Button>
        </Stack>

        <Stack spacing={0}>
          {credentials.map((cred, idx) => {
            const credKey = `cred-${idx}`;
            const isCopied = copiedKey === credKey;
            const formattedLine = `${cred.userAlias}: ${cred.password}`;

            return (
              <CredentialRow
                key={cred.userAlias}
                credential={cred}
                isCopied={isCopied}
                onCopy={() => onCopySingle(formattedLine, credKey)}
              />
            );
          })}
        </Stack>
      </CardContent>
    </Card>
  );
}

export default CredentialsListCard;
