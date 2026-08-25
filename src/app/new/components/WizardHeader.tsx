"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export function WizardHeader() {
  return (
    <Box sx={{ textAlign: "center", mb: 4 }}>
      <Typography
        variant="h1"
        component="h1"
        sx={{
          fontSize: { xs: "2rem", sm: "2.5rem" },
          color: "primary.main",
          mb: 1,
        }}
      >
        Create New Dashboard
      </Typography>
      <Typography variant="body1" sx={{ color: "text.secondary" }}>
        Set up a private, end-to-end encrypted dashboard with dedicated
        participant credentials.
      </Typography>
    </Box>
  );
}

export default WizardHeader;
