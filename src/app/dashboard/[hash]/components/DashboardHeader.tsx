"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import SyncIcon from "@mui/icons-material/Sync";

import { ScytalaUserHeader } from "@/components/ScytalaUserHeader";
import { DashboardTitle } from "./DashboardTitle";
import { DashboardActionToolbar } from "./DashboardActionToolbar";

export interface DashboardHeaderProps {
  title: string;
  description?: string | null;
  userAlias: string;
  dashboardHash: string;
}

export function DashboardHeader({
  title,
  description,
  userAlias,
  dashboardHash,
}: DashboardHeaderProps) {
  return (
    <Box
      component="header"
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: { xs: 2.5, sm: 3 },
        mb: { xs: 3, sm: 4 },
      }}
    >
      {/* Layer 1: Username nameplate, Configuration, Sync, and Log out buttons */}
      <ScytalaUserHeader
        userAlias={userAlias}
        dashboardHash={dashboardHash}
      >
        <Tooltip title="Dashboard settings coming in future updates">
          <span>
            <Button
              variant="outlined"
              disabled
              startIcon={<SettingsOutlinedIcon />}
              id="header-configure-btn"
              sx={{
                textTransform: "none",
                height: 40,
                px: 2,
                py: 0.75,
                borderColor: "divider",
                color: "text.secondary",
                bgcolor: "background.paper",
                fontSize: "0.95rem",
              }}
            >
              Dashboard settings
            </Button>
          </span>
        </Tooltip>

        <Tooltip title="Remote synchronization coming in S-05">
          <span>
            <Button
              variant="outlined"
              disabled
              startIcon={<SyncIcon />}
              sx={{
                textTransform: "none",
                height: 40,
                px: 2,
                py: 0.75,
                borderColor: "divider",
                color: "text.secondary",
                bgcolor: "background.paper",
                fontSize: "0.95rem",
              }}
            >
              Sync (Up to date)
            </Button>
          </span>
        </Tooltip>
      </ScytalaUserHeader>

      {/* Layer 2: Dashboard name and description */}
      <DashboardTitle title={title} description={description} />

      {/* Layer 3: Action buttons toolbar panel */}
      <DashboardActionToolbar dashboardHash={dashboardHash} />
    </Box>
  );
}

export default DashboardHeader;
