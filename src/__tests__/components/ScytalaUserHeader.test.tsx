import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Button from "@mui/material/Button";
import { ThemeProvider } from "@mui/material/styles";

import { ScytalaUserHeader } from "@/components/ScytalaUserHeader";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={PapyrusThemeLight}>{ui}</ThemeProvider>);
}

describe("ScytalaUserHeader Component", () => {
  it("renders user nameplate with user alias", () => {
    renderWithTheme(<ScytalaUserHeader userAlias="Alice_Commander" />);

    expect(screen.getByText("Alice_Commander")).toBeInTheDocument();
  });

  it("renders logout button and passes dashboardHash", () => {
    const { container } = renderWithTheme(
      <ScytalaUserHeader
        userAlias="Alice_Commander"
        dashboardHash="secret-hash-16c"
      />,
    );

    const logoutBtn = screen.getByRole("button", { name: /log out/i });
    expect(logoutBtn).toBeInTheDocument();

    const hashInput = container.querySelector('input[name="dashboardHash"]');
    expect(hashInput).toHaveValue("secret-hash-16c");
  });

  it("renders children actions in the action slot", () => {
    renderWithTheme(
      <ScytalaUserHeader userAlias="Alice_Commander">
        <Button id="custom-action-btn">Custom Action</Button>
      </ScytalaUserHeader>,
    );

    expect(
      screen.getByRole("button", { name: /custom action/i }),
    ).toBeInTheDocument();
  });
});
