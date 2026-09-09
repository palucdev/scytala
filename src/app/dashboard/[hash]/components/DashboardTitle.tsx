"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export interface DashboardTitleProps {
  title: string;
  description?: string | null;
}

export function DashboardTitle({ title, description }: DashboardTitleProps) {
  return (
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
  );
}

export default DashboardTitle;
