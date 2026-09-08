"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import HistoryIcon from "@mui/icons-material/History";
import PersonIcon from "@mui/icons-material/Person";

import { LogoutButton } from "@/app/dashboard/[hash]/components/LogoutButton";

export interface NoteEditorHeaderProps {
  userAlias: string;
  dashboardHash?: string;
}

export function NoteEditorHeader({
  userAlias,
  dashboardHash,
}: NoteEditorHeaderProps) {
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
        mb: { xs: 2.5, sm: 3 },
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
        <Tooltip title="Note history coming soon">
          <span>
            <Button
              variant="outlined"
              disabled
              startIcon={<HistoryIcon />}
              id="note-history-btn"
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
              Note history
            </Button>
          </span>
        </Tooltip>

        <Tooltip title="Contributors coming soon">
          <span>
            <Button
              variant="outlined"
              disabled
              startIcon={<GroupOutlinedIcon />}
              id="note-contributors-btn"
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
              Contributors
            </Button>
          </span>
        </Tooltip>

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

export default NoteEditorHeader;
