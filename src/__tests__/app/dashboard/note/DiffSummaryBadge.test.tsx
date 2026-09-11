import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import { DiffSummaryBadge } from "@/app/dashboard/[hash]/note/[noteId]/components/DiffSummaryBadge";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={PapyrusThemeLight}>{ui}</ThemeProvider>);
}

describe("DiffSummaryBadge Component", () => {
  it("renders null when both added and removed chars are 0 or less", () => {
    const { container } = renderWithTheme(
      <DiffSummaryBadge addedChars={0} removedChars={0} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders badge when addedChars > 0", () => {
    renderWithTheme(<DiffSummaryBadge addedChars={15} removedChars={0} />);
    expect(screen.getByText("Diff: +15 / -0 chars")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Diff: +15 / -0 characters"),
    ).toBeInTheDocument();
  });

  it("renders badge when removedChars > 0", () => {
    renderWithTheme(<DiffSummaryBadge addedChars={0} removedChars={8} />);
    expect(screen.getByText("Diff: +0 / -8 chars")).toBeInTheDocument();
  });

  it("renders badge when both added and removed chars > 0", () => {
    renderWithTheme(<DiffSummaryBadge addedChars={25} removedChars={12} />);
    expect(screen.getByText("Diff: +25 / -12 chars")).toBeInTheDocument();
  });
});
