"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import LogoutIcon from "@mui/icons-material/Logout";

import { logoutFromDashboardAction } from "@/actions/auth";

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
  const [isPending, setIsPending] = useState(false);

  const handleLogout = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isPending) return;

    setIsPending(true);
    try {
      const result = await logoutFromDashboardAction(
        dashboardHash ? { dashboardHash } : undefined,
      );
      if (result?.success) {
        if (typeof window !== "undefined") {
          const targetUrl = redirectTo || window.location.pathname;
          window.location.replace(targetUrl);
        }
      } else {
        setIsPending(false);
      }
    } catch {
      setIsPending(false);
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      color="primary"
      onClick={handleLogout}
      disabled={isPending}
      startIcon={
        isPending ? (
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
      {isPending ? "Logging out..." : "Log out"}
    </Button>
  );
}

export default LogoutButton;
