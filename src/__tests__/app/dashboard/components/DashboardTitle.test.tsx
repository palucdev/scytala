import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import { DashboardTitle } from "@/app/dashboard/[hash]/components/DashboardTitle";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={PapyrusThemeLight}>{ui}</ThemeProvider>);
}

describe("DashboardTitle Component", () => {
  it("renders heading with title and description", () => {
    renderWithTheme(
      <DashboardTitle
        title="Operation Spartan"
        description="Top secret encrypted strategic notes."
      />,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Operation Spartan",
    );
    expect(
      screen.getByText("Top secret encrypted strategic notes."),
    ).toBeInTheDocument();
  });

  it("renders without description when description is null or omitted", () => {
    renderWithTheme(<DashboardTitle title="Minimal Dashboard" />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Minimal Dashboard",
    );
    expect(screen.queryByText("Top secret")).not.toBeInTheDocument();
  });
});
