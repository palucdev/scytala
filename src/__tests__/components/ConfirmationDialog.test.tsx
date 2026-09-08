import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={PapyrusThemeLight}>{ui}</ThemeProvider>);
}

describe("ConfirmationDialog Component", () => {
  it("renders title, description, and default button labels when open", () => {
    renderWithTheme(
      <ConfirmationDialog
        open={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Discard Draft"
        description="Are you sure you want to discard your draft?"
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Discard Draft",
    );
    expect(
      screen.getByText("Are you sure you want to discard your draft?"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeInTheDocument();
  });

  it("does not render dialog content when open is false", () => {
    renderWithTheme(
      <ConfirmationDialog
        open={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Hidden Dialog"
        description="This should not appear."
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders custom confirm and cancel labels and styles", () => {
    renderWithTheme(
      <ConfirmationDialog
        open={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete Item"
        description="Item will be deleted."
        confirmLabel="Yes, Delete"
        cancelLabel="No, Keep"
        confirmColor="error"
        confirmVariant="contained"
      />,
    );

    expect(
      screen.getByRole("button", { name: /yes, delete/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /no, keep/i }),
    ).toBeInTheDocument();
  });

  it("calls onClose when cancel button is clicked", () => {
    const handleClose = vi.fn();
    renderWithTheme(
      <ConfirmationDialog
        open={true}
        onClose={handleClose}
        onConfirm={vi.fn()}
        title="Confirm Action"
        description="Action description"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("calls onConfirm when confirm button is clicked", () => {
    const handleConfirm = vi.fn();
    renderWithTheme(
      <ConfirmationDialog
        open={true}
        onClose={vi.fn()}
        onConfirm={handleConfirm}
        title="Confirm Action"
        description="Action description"
        confirmLabel="Proceed"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /proceed/i }));
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it("disables buttons and renders progress spinner when loading", () => {
    renderWithTheme(
      <ConfirmationDialog
        open={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Async Action"
        description="Processing async request..."
        loading={true}
      />,
    );

    const confirmBtn = screen.getByRole("button", { name: /confirm/i });
    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    expect(confirmBtn).toBeDisabled();
    expect(cancelBtn).toBeDisabled();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });
});
