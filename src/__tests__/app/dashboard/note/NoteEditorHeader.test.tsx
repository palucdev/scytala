import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import { NoteEditorHeader } from "@/app/dashboard/[hash]/note/[noteId]/components/NoteEditorHeader";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={PapyrusThemeLight}>{ui}</ThemeProvider>);
}

describe("NoteEditorHeader Component", () => {
  it("renders user nameplate with user alias", () => {
    renderWithTheme(<NoteEditorHeader userAlias="Alice_Commander" />);

    expect(screen.getByText("Alice_Commander")).toBeInTheDocument();
  });

  it("renders disabled Note history and Contributors dummy buttons with icons", () => {
    renderWithTheme(<NoteEditorHeader userAlias="Bob_Operator" />);

    const historyBtn = screen.getByRole("button", { name: /note history/i });
    expect(historyBtn).toBeInTheDocument();
    expect(historyBtn).toBeDisabled();

    const contributorsBtn = screen.getByRole("button", { name: /contributors/i });
    expect(contributorsBtn).toBeInTheDocument();
    expect(contributorsBtn).toBeDisabled();
  });

  it("renders LogoutButton and passes dashboardHash", () => {
    const { container } = renderWithTheme(
      <NoteEditorHeader
        userAlias="Alice_Commander"
        dashboardHash="secret-hash-16c"
      />,
    );

    const logoutBtn = screen.getByRole("button", { name: /log out/i });
    expect(logoutBtn).toBeInTheDocument();
    expect(logoutBtn).not.toBeDisabled();

    const hashInput = container.querySelector('input[name="dashboardHash"]');
    expect(hashInput).toHaveValue("secret-hash-16c");
  });
});
