import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import { EditorToolbar } from "@/app/dashboard/[hash]/note/[noteId]/components/EditorToolbar";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={PapyrusThemeLight}>{ui}</ThemeProvider>);
}

describe("EditorToolbar Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Create mode", () => {
    it("renders 'Text note' title, back button, save button, and no delete button or version chip", () => {
      renderWithTheme(
        <EditorToolbar
          mode="create"
          noteTitle=""
          dashboardHash="dash-123"
          isSaving={false}
          isDirty={false}
          onSave={vi.fn()}
          onDelete={vi.fn()}
        />,
      );

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "Text note",
      );
      expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
      expect(
        screen.getByRole("link", { name: /back to dashboard/i }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /delete/i }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/v\d+/)).not.toBeInTheDocument();
    });
  });

  describe("Edit mode", () => {
    it("renders 'Text note' header, version chip, delete button, and save button", () => {
      renderWithTheme(
        <EditorToolbar
          mode="edit"
          noteTitle="Important Document"
          version={3}
          dashboardHash="dash-123"
          isSaving={false}
          isDirty={true}
          onSave={vi.fn()}
          onDelete={vi.fn()}
        />,
      );

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "Text note",
      );
      expect(screen.getByText("v3")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /delete note/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /save note/i })).toBeEnabled();
    });

    it("displays 'Text note' header even when title is blank in edit mode", () => {
      renderWithTheme(
        <EditorToolbar
          mode="edit"
          noteTitle="   "
          version={1}
          dashboardHash="dash-123"
          isSaving={false}
          isDirty={false}
          onSave={vi.fn()}
          onDelete={vi.fn()}
        />,
      );

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "Text note",
      );
    });
  });

  describe("Actions and interactions", () => {
    it("calls onSave when save button is clicked while dirty", () => {
      const handleSave = vi.fn();
      renderWithTheme(
        <EditorToolbar
          mode="create"
          noteTitle="Test"
          dashboardHash="dash-123"
          isSaving={false}
          isDirty={true}
          onSave={handleSave}
          onDelete={vi.fn()}
        />,
      );

      const saveBtn = screen.getByRole("button", { name: /save/i });
      expect(saveBtn).toBeEnabled();
      fireEvent.click(saveBtn);
      expect(handleSave).toHaveBeenCalledTimes(1);
    });

    it("disables save button and displays spinner when isSaving is true", () => {
      renderWithTheme(
        <EditorToolbar
          mode="create"
          noteTitle="Test"
          dashboardHash="dash-123"
          isSaving={true}
          isDirty={true}
          onSave={vi.fn()}
          onDelete={vi.fn()}
        />,
      );

      const saveBtn = screen.getByRole("button", { name: /save/i });
      expect(saveBtn).toBeDisabled();
      expect(screen.getByText("Saving...")).toBeInTheDocument();
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
    });

    it("disables delete button when isSaving is true", () => {
      renderWithTheme(
        <EditorToolbar
          mode="edit"
          noteTitle="Test"
          version={1}
          dashboardHash="dash-123"
          isSaving={true}
          isDirty={false}
          onSave={vi.fn()}
          onDelete={vi.fn()}
        />,
      );

      expect(screen.getByRole("button", { name: /delete/i })).toBeDisabled();
    });

    it("calls onDelete when delete button is clicked", () => {
      const handleDelete = vi.fn();
      renderWithTheme(
        <EditorToolbar
          mode="edit"
          noteTitle="Test"
          version={1}
          dashboardHash="dash-123"
          isSaving={false}
          isDirty={false}
          onSave={vi.fn()}
          onDelete={handleDelete}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /delete/i }));
      expect(handleDelete).toHaveBeenCalledTimes(1);
    });

    it("prompts with unsaved changes dialog before navigating back when dirty and user cancels", async () => {
      renderWithTheme(
        <EditorToolbar
          mode="create"
          noteTitle="Draft"
          dashboardHash="dash-123"
          isSaving={false}
          isDirty={true}
          onSave={vi.fn()}
          onDelete={vi.fn()}
        />,
      );

      const backLink = screen.getByRole("link", { name: /back to dashboard/i });
      fireEvent.click(backLink);

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(
        screen.getByText(
          "You have unsaved changes. Are you sure you want to leave?",
        ),
      ).toBeInTheDocument();

      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("prompts with unsaved changes dialog before navigating back when dirty and navigates when user confirms leave", () => {
      renderWithTheme(
        <EditorToolbar
          mode="create"
          noteTitle="Draft"
          dashboardHash="dash-123"
          isSaving={false}
          isDirty={true}
          onSave={vi.fn()}
          onDelete={vi.fn()}
        />,
      );

      const backLink = screen.getByRole("link", { name: /back to dashboard/i });
      fireEvent.click(backLink);

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      const leaveButton = screen.getByRole("button", { name: /leave/i });
      fireEvent.click(leaveButton);

      expect(mockPush).toHaveBeenCalledWith("/dashboard/dash-123");
    });
  });
});
