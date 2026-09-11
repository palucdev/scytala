"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import HistoryIcon from "@mui/icons-material/History";

import { ScytalaUserHeader } from "@/components/ScytalaUserHeader";

export interface NoteEditorHeaderProps {
  userAlias: string;
  dashboardHash?: string;
  mode?: "create" | "edit";
  onOpenHistory?: () => void;
}

export function NoteEditorHeader({
  userAlias,
  dashboardHash,
  mode = "edit",
  onOpenHistory,
}: NoteEditorHeaderProps) {
  const isCreate = mode === "create";

  return (
    <Box sx={{ mb: { xs: 2.5, sm: 3 } }}>
      <ScytalaUserHeader
        userAlias={userAlias}
        dashboardHash={dashboardHash}
      >
        {isCreate ? (
          <Tooltip title="History is available after saving">
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
        ) : (
          <Button
            variant="outlined"
            onClick={onOpenHistory}
            startIcon={<HistoryIcon />}
            id="note-history-btn"
            sx={{
              textTransform: "none",
              height: 40,
              px: 2,
              py: 0.75,
              borderColor: "divider",
              color: "text.primary",
              bgcolor: "background.paper",
              fontSize: "0.95rem",
            }}
          >
            Note history
          </Button>
        )}

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
      </ScytalaUserHeader>
    </Box>
  );
}

export default NoteEditorHeader;
