import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import { DashboardActionToolbar } from "@/app/dashboard/[hash]/components/DashboardActionToolbar";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={PapyrusThemeLight}>{ui}</ThemeProvider>);
}

describe("DashboardActionToolbar Component", () => {
  it("renders toolbar title, create note link, and disabled action buttons", () => {
    renderWithTheme(<DashboardActionToolbar dashboardHash="secret-hash-16c" />);

    expect(screen.getByText("Dashboard Actions")).toBeInTheDocument();

    const createNoteBtn = screen.getByRole("link", { name: /create note/i });
    expect(createNoteBtn).toBeInTheDocument();
    expect(createNoteBtn).toHaveAttribute(
      "href",
      "/dashboard/secret-hash-16c/note/new",
    );

    expect(screen.getByRole("button", { name: /add directory/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /add file/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /add image/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /add survey/i })).toBeDisabled();
  });
});
