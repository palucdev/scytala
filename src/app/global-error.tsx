"use client";

import { useEffect } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";

import MUIThemeProvider from "@/providers/mui-theme-provider";
import { logger } from "@/lib/logger";

export interface GlobalErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorBoundaryProps) {
  useEffect(() => {
    logger.error("Global root layout error boundary caught error", error, {
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          backgroundColor: "#f5ead0",
          color: "#23180d",
          fontFamily: '"Crimson Text", Georgia, serif',
          display: "flex",
          flexDirection: "column",
        }}
      >
        <MUIThemeProvider>
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
                      <ReportProblemOutlinedIcon sx={{ fontSize: 36 }} />
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
                        Critical Application Error
                      </Typography>
                      <Typography
                        variant="body1"
                        sx={{
                          color: "text.secondary",
                          maxWidth: 420,
                          mx: "auto",
                        }}
                      >
                        A critical system error occurred. You can attempt to
                        reload the application state or return to the landing
                        page.
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
                        id="global-error-try-again-btn"
                        sx={{ width: { xs: "100%", sm: "auto" } }}
                      >
                        Try Again
                      </Button>
                      <Button
                        variant="outlined"
                        color="primary"
                        href="/"
                        id="global-error-return-home-btn"
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
        </MUIThemeProvider>
      </body>
    </html>
  );
}
