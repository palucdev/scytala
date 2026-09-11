import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import { NoteVersionPreviewActions } from "@/app/dashboard/[hash]/note/[noteId]/components/NoteVersionPreviewActions";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={PapyrusThemeLight}>{ui}</ThemeProvider>);
}

describe("NoteVersionPreviewActions Component", () => {
  it("renders show changes switch and close preview button", () => {
    const handleToggleDiff = vi.fn();
    const handleClose = vi.fn();

    renderWithTheme(
      <NoteVersionPreviewActions
        showDiff={false}
        onToggleDiff={handleToggleDiff}
        onClose={handleClose}
      />,
    );

    const switchEl = screen.getByRole("switch", { name: /show changes/i });
    expect(switchEl).toBeInTheDocument();
    expect(switchEl).not.toBeChecked();

    const closeBtn = screen.getByRole("button", { name: /close preview/i });
    expect(closeBtn).toBeInTheDocument();
  });

  it("reflects checked state when showDiff is true", () => {
    renderWithTheme(
      <NoteVersionPreviewActions
        showDiff={true}
        onToggleDiff={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const switchEl = screen.getByRole("switch", { name: /show changes/i });
    expect(switchEl).toBeChecked();
  });

  it("calls onToggleDiff when the switch is clicked", () => {
    const handleToggleDiff = vi.fn();

    renderWithTheme(
      <NoteVersionPreviewActions
        showDiff={false}
        onToggleDiff={handleToggleDiff}
        onClose={vi.fn()}
      />,
    );

    const switchEl = screen.getByRole("switch", { name: /show changes/i });
    fireEvent.click(switchEl);

    expect(handleToggleDiff).toHaveBeenCalledTimes(1);
    expect(handleToggleDiff).toHaveBeenCalledWith(true);
  });

  it("calls onClose when the close icon button is clicked", () => {
    const handleClose = vi.fn();

    renderWithTheme(
      <NoteVersionPreviewActions
        showDiff={false}
        onToggleDiff={vi.fn()}
        onClose={handleClose}
      />,
    );

    const closeBtn = screen.getByRole("button", { name: /close preview/i });
    fireEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
