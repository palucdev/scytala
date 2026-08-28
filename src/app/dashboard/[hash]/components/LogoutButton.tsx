"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import LogoutIcon from "@mui/icons-material/Logout";

export interface LogoutButtonProps {
  variant?: "text" | "outlined" | "contained";
  size?: "small" | "medium" | "large";
  dashboardHash?: string;
  redirectTo?: string;
}

export function LogoutButton({
  variant = "outlined",
  size = "small",
  dashboardHash,
  redirectTo,
}: LogoutButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <Box
      component="form"
      action="/api/auth/logout"
      method="POST"
      onSubmit={() => setIsSubmitting(true)}
      sx={{ display: "inline-block" }}
    >
      {dashboardHash && (
        <input type="hidden" name="dashboardHash" value={dashboardHash} />
      )}
      {redirectTo && (
        <input type="hidden" name="redirectTo" value={redirectTo} />
      )}
      <Button
        type="submit"
        variant={variant}
        size={size}
        color="primary"
        disabled={isSubmitting}
        startIcon={
          isSubmitting ? (
            <CircularProgress size={16} color="inherit" />
          ) : (
            <LogoutIcon fontSize="small" />
          )
        }
        aria-label="Log out"
        id="dashboard-logout-btn"
        sx={{
          textTransform: "none",
          minWidth: 90,
        }}
      >
        {isSubmitting ? "Logging out..." : "Log out"}
      </Button>
    </Box>
  );
}

export default LogoutButton;

