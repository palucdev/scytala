import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import SearchOffOutlinedIcon from "@mui/icons-material/SearchOffOutlined";

export default function NotFound() {
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
                  bgcolor: "info.light",
                  color: "info.main",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <SearchOffOutlinedIcon sx={{ fontSize: 36 }} />
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
                  404 — Page Not Found
                </Typography>
                <Typography
                  variant="body1"
                  sx={{
                    color: "text.secondary",
                    maxWidth: 420,
                    mx: "auto",
                  }}
                >
                  The requested page or dashboard could not be found. It may
                  have expired, been relocated, or the URL might be mistyped.
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
                  href="/new"
                  id="not-found-create-dashboard-btn"
                  sx={{ width: { xs: "100%", sm: "auto" } }}
                >
                  Create New Dashboard
                </Button>
                <Button
                  variant="outlined"
                  color="primary"
                  href="/"
                  id="not-found-return-home-btn"
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
