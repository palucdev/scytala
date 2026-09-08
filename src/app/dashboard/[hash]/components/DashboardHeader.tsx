"use client";

import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import NoteIcon from "@mui/icons-material/Note";
import PersonIcon from "@mui/icons-material/Person";
import PollOutlinedIcon from "@mui/icons-material/PollOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import SyncIcon from "@mui/icons-material/Sync";

import { LogoutButton } from "./LogoutButton";

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
      <Box
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

      {/* Layer 2: Dashboard name and description */}
      <Box
        sx={{
          py: { xs: 0.5, sm: 1 },
        }}
      >
        <Typography
          variant="h1"
          component="h1"
          sx={{
            fontSize: { xs: "2rem", sm: "2.5rem" },
            color: "primary.main",
            letterSpacing: "0.03em",
            lineHeight: 1.2,
            mb: description ? 1 : 0,
            wordBreak: "break-word",
          }}
        >
          {title}
        </Typography>
        {description && (
          <Typography
            variant="body1"
            sx={{
              color: "text.secondary",
              fontSize: { xs: "1.05rem", sm: "1.15rem" },
              lineHeight: 1.7,
              maxWidth: 800,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {description}
          </Typography>
        )}
      </Box>

      {/* Layer 3: Action buttons toolbar panel */}
      <Box
        aria-label="Dashboard actions"
        sx={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          mt: 2.5,
          pt: { xs: 3, sm: 3.5 },
          pb: { xs: 2.5, sm: 3 },
          px: { xs: 2, sm: 2.5 },
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
        }}
      >
        <Typography
          variant="h6"
          component="h2"
          sx={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translate(-50%, -50%)",
            display: "inline-flex",
            alignItems: "center",
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1.5,
            px: { xs: 2.5, sm: 3 },
            py: 0.5,
            fontFamily: (theme) => theme.typography.h1.fontFamily,
            fontSize: { xs: "1.05rem", sm: "1.2rem" },
            fontWeight: 600,
            color: "primary.main",
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
            userSelect: "none",
          }}
        >
          Dashboard Actions
        </Typography>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: { xs: 1.5, sm: 2 },
            width: "100%",
          }}
        >
          <Button
            component={Link}
            href={`/dashboard/${dashboardHash}/note/new`}
            variant="contained"
            color="primary"
            startIcon={<NoteIcon sx={{ fontSize: 22 }} />}
            id="header-create-note-btn"
            sx={{
              textTransform: "none",
              fontWeight: 600,
              height: 48,
              px: { xs: 2.5, sm: 3 },
              py: 1,
              fontSize: "1.05rem",
              boxShadow: "0 2px 6px rgba(113, 56, 19, 0.25)",
              "&:hover": {
                boxShadow: "0 4px 12px rgba(113, 56, 19, 0.35)",
              },
            }}
          >
            Create note
          </Button>

          <Button
            variant="outlined"
            disabled
            startIcon={<CreateNewFolderOutlinedIcon sx={{ fontSize: 22 }} />}
            sx={{
              textTransform: "none",
              height: 48,
              px: { xs: 2, sm: 2.5 },
              py: 1,
              fontSize: "1.05rem",
              borderColor: "divider",
              color: "text.disabled",
            }}
          >
            Add Directory
          </Button>

          <Button
            variant="outlined"
            disabled
            startIcon={<InsertDriveFileOutlinedIcon sx={{ fontSize: 22 }} />}
            sx={{
              textTransform: "none",
              height: 48,
              px: { xs: 2, sm: 2.5 },
              py: 1,
              fontSize: "1.05rem",
              borderColor: "divider",
              color: "text.disabled",
            }}
          >
            Add File
          </Button>

          <Button
            variant="outlined"
            disabled
            startIcon={<ImageOutlinedIcon sx={{ fontSize: 22 }} />}
            sx={{
              textTransform: "none",
              height: 48,
              px: { xs: 2, sm: 2.5 },
              py: 1,
              fontSize: "1.05rem",
              borderColor: "divider",
              color: "text.disabled",
            }}
          >
            Add Image
          </Button>

          <Button
            variant="outlined"
            disabled
            startIcon={<PollOutlinedIcon sx={{ fontSize: 22 }} />}
            sx={{
              textTransform: "none",
              height: 48,
              px: { xs: 2, sm: 2.5 },
              py: 1,
              fontSize: "1.05rem",
              borderColor: "divider",
              color: "text.disabled",
            }}
          >
            Add Survey
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

export default DashboardHeader;
