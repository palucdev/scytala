"use client";

import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import OutlinedInput from "@mui/material/OutlinedInput";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import CheckIcon from "@mui/icons-material/Check";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LinkIcon from "@mui/icons-material/Link";

export interface ShareableLinkCardProps {
  dashboardUrl: string;
  isCopied: boolean;
  onCopy: () => void;
}

export function ShareableLinkCard({
  dashboardUrl,
  isCopied,
  onCopy,
}: ShareableLinkCardProps) {
  return (
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
              <Tooltip title={isCopied ? "Copied!" : "Copy link"}>
                <IconButton
                  aria-label="Copy dashboard link"
                  onClick={onCopy}
                  edge="end"
                  color={isCopied ? "success" : "default"}
                >
                  {isCopied ? <CheckIcon /> : <ContentCopyIcon />}
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
  );
}

export default ShareableLinkCard;
