"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import AddIcon from "@mui/icons-material/Add";

export function EmptyNotesState() {
  return (
    <Card
      variant="outlined"
      sx={{
        bgcolor: "background.paper",
        borderColor: "divider",
        borderRadius: 2,
        py: { xs: 6, sm: 8 },
        px: { xs: 3, sm: 4 },
        textAlign: "center",
        boxShadow: "0 2px 8px rgba(35, 24, 13, 0.04)",
      }}
    >
      <CardContent sx={{ p: 0 }}>
        <Stack
          spacing={2.5}
          sx={{
            alignItems: "center",
            maxWidth: 420,
            mx: "auto",
          }}
        >
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              bgcolor: "action.hover",
              color: "text.secondary",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <DescriptionOutlinedIcon sx={{ fontSize: 32 }} />
          </Box>

          <Box>
            <Typography
              variant="h3"
              component="h2"
              sx={{
                fontSize: "1.35rem",
                color: "primary.main",
                mb: 1,
              }}
            >
              No notes yet
            </Typography>
            <Typography variant="body1" sx={{ color: "text.secondary" }}>
              Notes created by participants on this dashboard will appear here
              as tiles.
            </Typography>
          </Box>

          <Tooltip title="Note creation coming in S-03">
            <span>
              <Button
                variant="contained"
                color="primary"
                disabled
                startIcon={<AddIcon />}
                id="empty-state-new-note-btn"
                sx={{
                  mt: 1,
                  px: 3,
                  textTransform: "none",
                }}
              >
                New Note
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default EmptyNotesState;
