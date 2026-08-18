"use client";

import { createTheme } from "@mui/material/styles";

/**
 * PapyrusThemeLight — a MUI theme that mirrors the papyrus CSS custom-property
 * palette defined in globals.css.
 */
export const PapyrusThemeLight = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#713813", // --papyrus-accent
      dark: "#562a0c", // --papyrus-accent-hover
      contrastText: "#f5ead0",
    },
    secondary: {
      main: "#b88636", // --papyrus-highlight
    },
    background: {
      default: "#f5ead0", // --papyrus-bg
      paper: "#efe0c4", // --papyrus-surface
    },
    text: {
      primary: "#23180d", // --papyrus-text
      secondary: "#4a3825", // --papyrus-text-secondary
      disabled: "#665038", // --papyrus-text-muted
    },
    divider: "#cfbe97", // --papyrus-border
  },

  typography: {
    fontFamily: '"Crimson Text", Georgia, serif',

    h1: {
      fontFamily: '"IM Fell English", Georgia, serif',
      fontWeight: 400,
      letterSpacing: "0.04em",
      lineHeight: 1.1,
    },

    h3: {
      fontFamily: '"IM Fell English", Georgia, serif',
      fontSize: "1.125rem",
      fontWeight: 400,
    },

    body1: {
      lineHeight: 1.75,
    },

    caption: {
      fontSize: "0.875rem",
      lineHeight: 1.6,
    },

    button: {
      fontFamily: '"IM Fell English", Georgia, serif',
      fontSize: "1.1rem",
      letterSpacing: "0.03em",
      textTransform: "none" as const,
    },
  },

  shape: {
    borderRadius: 4,
  },

  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          padding: "0.875rem 2.5rem",
          transition: "background 0.2s ease, transform 0.15s ease",
        },
      },
    },

    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: "#f5ead0",
          color: "#23180d",
          fontFamily: '"Crimson Text", Georgia, serif',
          margin: 0,
        },
      },
    },
  },
});
