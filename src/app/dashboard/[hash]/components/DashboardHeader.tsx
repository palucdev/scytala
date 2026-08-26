import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import PersonIcon from "@mui/icons-material/Person";
import SyncIcon from "@mui/icons-material/Sync";

import { LogoutButton } from "./LogoutButton";

export interface DashboardHeaderProps {
  title: string;
  description?: string | null;
  userAlias: string;
}

export function DashboardHeader({
  title,
  description,
  userAlias,
}: DashboardHeaderProps) {
  return (
    <Box
      component="header"
      sx={{
        borderBottom: "1px solid",
        borderColor: "divider",
        pb: 3,
        mb: 4,
      }}
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        sx={{
          justifyContent: "space-between",
          alignItems: { xs: "flex-start", md: "center" },
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            variant="h1"
            component="h1"
            sx={{
              fontSize: { xs: "1.75rem", sm: "2.25rem" },
              color: "primary.main",
              mb: description ? 0.75 : 0,
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
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {description}
            </Typography>
          )}
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
          <Chip
            icon={<PersonIcon fontSize="small" />}
            label={userAlias}
            variant="outlined"
            size="medium"
            sx={{
              borderColor: "divider",
              bgcolor: "background.paper",
              fontWeight: 600,
              color: "text.primary",
            }}
          />

          <Tooltip title="Remote synchronization coming in S-05">
            <span>
              <Button
                variant="outlined"
                size="small"
                disabled
                startIcon={<SyncIcon fontSize="small" />}
                sx={{ textTransform: "none" }}
              >
                Sync (Up to date)
              </Button>
            </span>
          </Tooltip>

          <LogoutButton />
        </Stack>
      </Stack>
    </Box>
  );
}

export default DashboardHeader;
