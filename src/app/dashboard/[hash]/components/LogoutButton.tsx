"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import LogoutIcon from "@mui/icons-material/Logout";

import type { SxProps, Theme } from "@mui/material/styles";

export interface LogoutButtonProps {
  variant?: "text" | "outlined" | "contained";
  size?: "small" | "medium" | "large";
  dashboardHash?: string;
  redirectTo?: string;
  sx?: SxProps<Theme>;
}

export function LogoutButton({
  variant = "outlined",
  size = "medium",
  dashboardHash,
  redirectTo,
  sx,
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
            <LogoutIcon />
          )
        }
        aria-label="Log out"
        id="dashboard-logout-btn"
        sx={{
          textTransform: "none",
          minWidth: 90,
          ...sx,
        }}
      >
        {isSubmitting ? "Logging out..." : "Log out"}
      </Button>
    </Box>
  );
}

export default LogoutButton;

