"use client";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import PersonIcon from "@mui/icons-material/Person";

import { LogoutButton } from "@/app/dashboard/[hash]/components/LogoutButton";

export interface ScytalaUserHeaderProps {
  userAlias: string;
  dashboardHash?: string;
  children?: React.ReactNode;
}

export function ScytalaUserHeader({
  userAlias,
  dashboardHash,
  children,
}: ScytalaUserHeaderProps) {
  return (
    <Box
      component="header"
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 1.5,
        pb: 2,
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Chip
          icon={
            <PersonIcon
              sx={{ color: "primary.main !important", fontSize: 18 }}
            />
          }
          label={userAlias}
          variant="outlined"
          size="medium"
          sx={{
            height: 40,
            borderRadius: "20px",
            borderColor: "divider",
            bgcolor: "background.paper",
            fontWeight: 600,
            color: "text.primary",
            px: 0.5,
            fontSize: "0.95rem",
            boxShadow: "0 1px 3px rgba(35, 24, 13, 0.05)",
          }}
        />
      </Box>

      <Stack
        direction="row"
        spacing={1.5}
        sx={{
          alignItems: "center",
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        {children}

        <LogoutButton
          dashboardHash={dashboardHash}
          sx={{
            height: 40,
            px: 2,
            py: 0.75,
            fontSize: "0.95rem",
            borderColor: "divider",
            bgcolor: "background.paper",
            color: "text.primary",
            "&:hover": {
              borderColor: "primary.main",
              bgcolor: "rgba(113, 56, 19, 0.04)",
            },
          }}
        />
      </Stack>
    </Box>
  );
}

export default ScytalaUserHeader;
