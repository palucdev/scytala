"use client";

import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";
import type { ReactNode } from "react";

export default function MUIThemeProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={PapyrusThemeLight}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
