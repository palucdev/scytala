"use client";

import { createTheme } from "@mui/material/styles";

/* ------------------------------------------------------------------ */
/*  Module augmentation – extend MUI's Palette with a custom "active" */
/*  channel used for highlighted / selected items.                    */
/* ------------------------------------------------------------------ */
declare module "@mui/material/styles" {
  interface Palette {
    active: Palette["primary"];
  }
  interface PaletteOptions {
    active?: PaletteOptions["primary"];
  }
}

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
    active: {
      main: "#713813", // --papyrus-active — matches primary accent / button
      dark: "#562a0c",
      light: "#e8d5c4", // --papyrus-active-light — warm parchment tint
      contrastText: "#f5ead0",
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
          "&.MuiAlert-standard.MuiAlert-colorSuccess": {
            backgroundColor: "#d4e4cf",
            color: "#284422",
            border: "1px solid #aecba7",
            "& .MuiAlert-icon": { color: "#4d6e43" },
          },
          "&.MuiAlert-standard.MuiAlert-colorError": {
            backgroundColor: "#f0cfc9",
            color: "#6c2113",
            border: "1px solid #dba89e",
            "& .MuiAlert-icon": { color: "#9c3b28" },
          },
          "&.MuiAlert-standard.MuiAlert-colorWarning": {
            backgroundColor: "#f0deba",
            color: "#6e4209",
            border: "1px solid #dfc291",
            "& .MuiAlert-icon": { color: "#b8731d" },
          },
          "&.MuiAlert-standard.MuiAlert-colorInfo": {
            backgroundColor: "#ebdfc0",
            color: "#533e14",
            border: "1px solid #d4c48e",
            "& .MuiAlert-icon": { color: "#8c6b2d" },
          },
        },
      },
    },

    /* -------------------------------------------------------------- */
    /*  Stepper — papyrus-themed with warm brown active highlight     */
    /* -------------------------------------------------------------- */
    MuiStepIcon: {
      styleOverrides: {
        root: {
          color: "#cfbe97", // inactive — matches --papyrus-border
          fontSize: "1.75rem",
          "&.Mui-completed": {
            color: "#4a3825", // completed — papyrus-text-secondary
          },
          "&.Mui-active": {
            color: "#713813", // active — primary accent / button brown
          },
        },
        text: {
          fontFamily: '"Crimson Text", Georgia, serif',
          fontWeight: 600,
          fontSize: "0.75rem",
          fontVariantNumeric: "lining-nums",
        },
      },
    },

    MuiStepLabel: {
      styleOverrides: {
        label: {
          fontFamily: '"Crimson Text", Georgia, serif',
          fontSize: "0.925rem",
          color: "#665038", // --papyrus-text-muted for inactive
          "&.Mui-completed": {
            color: "#4a3825", // --papyrus-text-secondary
            fontWeight: 600,
          },
          "&.Mui-active": {
            color: "#713813", // active — primary accent
            fontWeight: 600,
          },
        },
      },
    },

    MuiStepConnector: {
      styleOverrides: {
        line: {
          borderColor: "#cfbe97", // --papyrus-border
          borderTopWidth: 2,
        },
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: "#eadcbe", // sun-warmed parchment — subtly deeper than card
          "&:hover": {
            backgroundColor: "#e7d8b8",
          },
          "&.Mui-focused": {
            backgroundColor: "#e7d8b8",
          },
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
