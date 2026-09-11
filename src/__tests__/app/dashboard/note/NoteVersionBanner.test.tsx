import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import { NoteVersionBanner } from "@/app/dashboard/[hash]/note/[noteId]/components/NoteVersionBanner";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={PapyrusThemeLight}>{ui}</ThemeProvider>);
}

describe("NoteVersionBanner Component", () => {
  it("renders version chip, author alias, and time", () => {
    renderWithTheme(
      <NoteVersionBanner
        version={3}
        authorAlias="Alice_Commander"
        createdAt="2026-09-01T00:00:00Z"
      />,
    );

    expect(screen.getByText("Viewing v3 (Read-only)")).toBeInTheDocument();
    expect(screen.getByText(/Alice_Commander/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /switch version/i }),
    ).not.toBeInTheDocument();
  });

  it("renders switch version button in mobile mode when onOpenDrawer is provided", () => {
    const handleOpenDrawer = vi.fn();
    renderWithTheme(
      <NoteVersionBanner
        version={2}
        authorAlias="Bob_Operator"
        createdAt="2026-09-02T00:00:00Z"
        isMobile={true}
        onOpenDrawer={handleOpenDrawer}
      />,
    );

    const switchBtn = screen.getByRole("button", { name: /switch version/i });
    expect(switchBtn).toBeInTheDocument();

    fireEvent.click(switchBtn);
    expect(handleOpenDrawer).toHaveBeenCalledTimes(1);
  });
});
