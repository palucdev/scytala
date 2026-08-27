"use client";

import { useEffect } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ErrorOutlinedIcon from "@mui/icons-material/ErrorOutlined";

import { logger } from "@/lib/logger";

export interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    logger.error("App route error boundary caught error", error, {
      digest: error.digest,
    });
  }, [error]);

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        px: 2,
        py: 4,
      }}
    >
      <Container maxWidth="sm" disableGutters>
        <Card
          variant="outlined"
          sx={{
            bgcolor: "background.paper",
            borderColor: "divider",
            borderRadius: 2,
            py: { xs: 5, sm: 6 },
            px: { xs: 3, sm: 4 },
            textAlign: "center",
            boxShadow: "0 2px 12px rgba(35, 24, 13, 0.08)",
          }}
        >
          <CardContent sx={{ p: 0 }}>
            <Stack spacing={3} sx={{ alignItems: "center" }}>
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  bgcolor: "error.light",
                  color: "error.main",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ErrorOutlinedIcon sx={{ fontSize: 36 }} />
              </Box>

              <Box>
                <Typography
                  variant="h1"
                  component="h1"
                  sx={{
                    fontSize: { xs: "1.75rem", sm: "2.25rem" },
                    color: "text.primary",
                    mb: 1.5,
                  }}
                >
                  Something Went Wrong
                </Typography>
                <Typography
                  variant="body1"
                  sx={{
                    color: "text.secondary",
                    maxWidth: 420,
                    mx: "auto",
                  }}
                >
                  An unexpected error occurred while processing your request.
                  Please try again or return to the home page.
                </Typography>
              </Box>

              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                sx={{
                  pt: 1,
                  width: "100%",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Button
                  variant="contained"
                  color="primary"
                  onClick={() => reset()}
                  id="error-try-again-btn"
                  sx={{ width: { xs: "100%", sm: "auto" } }}
                >
                  Try Again
                </Button>
                <Button
                  variant="outlined"
                  color="primary"
                  href="/"
                  id="error-return-home-btn"
                  sx={{ width: { xs: "100%", sm: "auto" } }}
                >
                  Return Home
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
