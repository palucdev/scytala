import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import { DeleteNoteDialog } from "@/app/dashboard/[hash]/note/[noteId]/components/DeleteNoteDialog";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";
import * as noteActionsModule from "@/actions/notes";
import type { DeleteNoteActionResult } from "@/schemas/notes";

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: mockRefresh,
  }),
}));

vi.mock("@/actions/notes", () => ({
  deleteNoteAction: vi.fn(),
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={PapyrusThemeLight}>{ui}</ThemeProvider>);
}

describe("DeleteNoteDialog Component", () => {
  const mockDeleteNoteAction = vi.mocked(noteActionsModule.deleteNoteAction);
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders closed when open=false", () => {
    renderWithTheme(
      <DeleteNoteDialog
        open={false}
        onClose={mockOnClose}
        dashboardHash="dash-123"
        noteId="note-123"
        noteTitle="Meeting Notes"
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders open with note title, description, password field, and actions", () => {
    renderWithTheme(
      <DeleteNoteDialog
        open={true}
        onClose={mockOnClose}
        dashboardHash="dash-123"
        noteId="note-123"
        noteTitle="Meeting Notes"
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Delete Note")).toBeInTheDocument();
    expect(
      screen.getByText(/Are you sure you want to delete “Meeting Notes”?/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Please enter your user password to confirm deletion/),
    ).toBeInTheDocument();

    const passwordInput = screen.getByLabelText("User Password");
    expect(passwordInput).toBeInTheDocument();
    expect(passwordInput).toHaveAttribute("type", "password");

    const deleteBtn = screen.getByRole("button", { name: "Delete" });
    expect(deleteBtn).toBeDisabled();

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    expect(cancelBtn).not.toBeDisabled();
  });

  it("displays fallback 'Untitled Note' if note title is empty or blank", () => {
    renderWithTheme(
      <DeleteNoteDialog
        open={true}
        onClose={mockOnClose}
        dashboardHash="dash-123"
        noteId="note-123"
        noteTitle="   "
      />,
    );

    expect(
      screen.getByText(/Are you sure you want to delete “Untitled Note”?/),
    ).toBeInTheDocument();
  });

  it("enables delete button when password is entered, disables when cleared", () => {
    renderWithTheme(
      <DeleteNoteDialog
        open={true}
        onClose={mockOnClose}
        dashboardHash="dash-123"
        noteId="note-123"
        noteTitle="Meeting Notes"
      />,
    );

    const passwordInput = screen.getByLabelText("User Password");
    const deleteBtn = screen.getByRole("button", { name: "Delete" });

    expect(deleteBtn).toBeDisabled();

    fireEvent.change(passwordInput, { target: { value: "   " } });
    expect(deleteBtn).toBeDisabled();

    fireEvent.change(passwordInput, { target: { value: "secret123" } });
    expect(deleteBtn).not.toBeDisabled();

    fireEvent.change(passwordInput, { target: { value: "" } });
    expect(deleteBtn).toBeDisabled();
  });

  it("calls onClose when Cancel button is clicked and clears password and error", () => {
    const { rerender } = renderWithTheme(
      <DeleteNoteDialog
        open={true}
        onClose={mockOnClose}
        dashboardHash="dash-123"
        noteId="note-123"
        noteTitle="Meeting Notes"
      />,
    );

    const passwordInput = screen.getByLabelText("User Password");
    fireEvent.change(passwordInput, { target: { value: "secret" } });

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(cancelBtn);

    expect(mockOnClose).toHaveBeenCalledTimes(1);

    // Reopen dialog to verify state was cleared
    rerender(
      <ThemeProvider theme={PapyrusThemeLight}>
        <DeleteNoteDialog
          open={true}
          onClose={mockOnClose}
          dashboardHash="dash-123"
          noteId="note-123"
          noteTitle="Meeting Notes"
        />
      </ThemeProvider>,
    );

    const newPasswordInput = screen.getByLabelText("User Password");
    expect(newPasswordInput).toHaveValue("");
  });

  it("shows error alert when deleteNoteAction fails", async () => {
    mockDeleteNoteAction.mockResolvedValueOnce({
      success: false,
      error: "Invalid password.",
    });

    renderWithTheme(
      <DeleteNoteDialog
        open={true}
        onClose={mockOnClose}
        dashboardHash="dash-123"
        noteId="note-123"
        noteTitle="Meeting Notes"
      />,
    );

    const passwordInput = screen.getByLabelText("User Password");
    fireEvent.change(passwordInput, { target: { value: "wrongpass" } });

    const deleteBtn = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockDeleteNoteAction).toHaveBeenCalledWith({
        dashboardHash: "dash-123",
        noteId: "note-123",
        password: "wrongpass",
      });
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid password.");
    });

    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it("navigates and refreshes dashboard on successful delete", async () => {
    mockDeleteNoteAction.mockResolvedValueOnce({
      success: true,
    });

    renderWithTheme(
      <DeleteNoteDialog
        open={true}
        onClose={mockOnClose}
        dashboardHash="dash-123"
        noteId="note-123"
        noteTitle="Meeting Notes"
      />,
    );

    const passwordInput = screen.getByLabelText("User Password");
    fireEvent.change(passwordInput, { target: { value: "correctpass" } });

    const deleteBtn = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockDeleteNoteAction).toHaveBeenCalledWith({
        dashboardHash: "dash-123",
        noteId: "note-123",
        password: "correctpass",
      });
      expect(mockOnClose).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith("/dashboard/dash-123");
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it("triggers deletion when Enter key is pressed in password field", async () => {
    mockDeleteNoteAction.mockResolvedValueOnce({
      success: true,
    });

    renderWithTheme(
      <DeleteNoteDialog
        open={true}
        onClose={mockOnClose}
        dashboardHash="dash-123"
        noteId="note-123"
        noteTitle="Meeting Notes"
      />,
    );

    const passwordInput = screen.getByLabelText("User Password");
    fireEvent.change(passwordInput, { target: { value: "pass123" } });
    fireEvent.keyDown(passwordInput, { key: "Enter" });

    await waitFor(() => {
      expect(mockDeleteNoteAction).toHaveBeenCalledWith({
        dashboardHash: "dash-123",
        noteId: "note-123",
        password: "pass123",
      });
      expect(mockReplace).toHaveBeenCalledWith("/dashboard/dash-123");
    });
  });

  it("does not trigger deletion when Enter is pressed with empty password", () => {
    renderWithTheme(
      <DeleteNoteDialog
        open={true}
        onClose={mockOnClose}
        dashboardHash="dash-123"
        noteId="note-123"
        noteTitle="Meeting Notes"
      />,
    );

    const passwordInput = screen.getByLabelText("User Password");
    fireEvent.keyDown(passwordInput, { key: "Enter" });

    expect(mockDeleteNoteAction).not.toHaveBeenCalled();
  });

  it("shows network error when deleteNoteAction throws an exception", async () => {
    mockDeleteNoteAction.mockRejectedValueOnce(new Error("Connection error"));

    renderWithTheme(
      <DeleteNoteDialog
        open={true}
        onClose={mockOnClose}
        dashboardHash="dash-123"
        noteId="note-123"
        noteTitle="Meeting Notes"
      />,
    );

    const passwordInput = screen.getByLabelText("User Password");
    fireEvent.change(passwordInput, { target: { value: "pass123" } });

    const deleteBtn = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Network error. Please check your connection and try again.",
      );
    });
  });

  it("disables controls while action is in flight", async () => {
    let resolveAction: (val: DeleteNoteActionResult) => void;
    mockDeleteNoteAction.mockReturnValueOnce(
      new Promise((res) => {
        resolveAction = res;
      }),
    );

    renderWithTheme(
      <DeleteNoteDialog
        open={true}
        onClose={mockOnClose}
        dashboardHash="dash-123"
        noteId="note-123"
        noteTitle="Meeting Notes"
      />,
    );

    const passwordInput = screen.getByLabelText("User Password");
    fireEvent.change(passwordInput, { target: { value: "pass123" } });

    const deleteBtn = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(deleteBtn);

    expect(deleteBtn).toBeDisabled();
    expect(screen.getByText("Deleting...")).toBeInTheDocument();
    expect(passwordInput).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    // Try closing while pending - should not close
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockOnClose).not.toHaveBeenCalled();

    resolveAction!({ success: true });

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });
});
