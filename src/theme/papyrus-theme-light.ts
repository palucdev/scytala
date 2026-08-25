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
    error: {
      main: "#9c3b28", // Papyrus brick / terracotta red
      dark: "#7a2b1b",
      light: "#f7dcd7",
      contrastText: "#ffffff",
    },
    warning: {
      main: "#b8731d", // Papyrus amber / warm ochre
      dark: "#8f5712",
      light: "#faeedb",
      contrastText: "#23180d",
    },
    info: {
      main: "#8c6b2d", // Papyrus antique gold
      dark: "#694e1c",
      light: "#f6edd9",
      contrastText: "#23180d",
    },
    success: {
      main: "#4d6e43", // Papyrus sage / olive green
      dark: "#375230",
      light: "#dce8d7",
      contrastText: "#ffffff",
    },
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

    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontFamily: '"Crimson Text", Georgia, serif',
          fontSize: "1rem",
        },
        standardSuccess: {
          backgroundColor: "#e2ede0",
          color: "#284422",
          border: "1px solid #c2dac0",
        },
        standardError: {
          backgroundColor: "#fce9e6",
          color: "#6c2113",
          border: "1px solid #f2c0b8",
        },
        standardWarning: {
          backgroundColor: "#faeedb",
          color: "#6e4209",
          border: "1px solid #eed2a7",
        },
        standardInfo: {
          backgroundColor: "#f6eedb",
          color: "#533e14",
          border: "1px solid #e5d3a5",
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
