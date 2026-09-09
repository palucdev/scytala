"use client";

import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";

export interface RateLimitNoticeProps {
  retryAfterSeconds?: number;
}

export function RateLimitNotice({ retryAfterSeconds }: RateLimitNoticeProps) {
  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Card variant="outlined" sx={{ p: 2 }}>
        <CardContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            <AlertTitle>429 — Too Many Requests</AlertTitle>
            Too many session verification attempts have been made from your network.
            {retryAfterSeconds && retryAfterSeconds > 0
              ? ` Please wait ${retryAfterSeconds} seconds before trying again.`
              : " Please wait a moment before trying again."}
          </Alert>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            To protect dashboard security and prevent resource exhaustion, session verification
            requests are temporarily throttled at the edge.
          </Typography>
          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <Button
              variant="outlined"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.location.reload();
                }
              }}
            >
              Retry Now
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Container>
  );
}

export default RateLimitNotice;
