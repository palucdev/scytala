import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import {
  NoteVersionPreview,
} from "@/app/dashboard/[hash]/note/[noteId]/components/NoteVersionPreview";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";
import type { HydratedNoteVersion } from "@/schemas/notes";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={PapyrusThemeLight}>{ui}</ThemeProvider>);
}

const mockVersion1: HydratedNoteVersion = {
  id: "ver-1",
  note_id: "note-123",
  version: 1,
  title: "Original Title",
  content: "Hello world\nThis is version 1",
  author_id: "user-1",
  author_alias: "Alice",
  created_at: "2026-09-10T10:00:00Z",
};

describe("NoteVersionPreview Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders read-only snapshot with version badge, author attribution, and line numbers", () => {
    const handleClose = vi.fn();
    const handleRestore = vi.fn();

    renderWithTheme(
      <NoteVersionPreview
        selectedVersion={mockVersion1}
        currentTitle="Original Title"
        currentContent={"Hello world\nThis is version 1"}
        onClosePreview={handleClose}
        onRestore={handleRestore}
        isRestoring={false}
      />,
    );

    expect(
      screen.getByText("Viewing v1 (Read-only)"),
    ).toBeInTheDocument();
    expect(screen.getByText(/by Alice/)).toBeInTheDocument();
    expect(screen.getByText("Original Title")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Note content snapshot").textContent,
    ).toBe("Hello world\nThis is version 1");

    // Exit preview button
    const exitBtn = screen.getByRole("button", { name: /exit preview/i });
    fireEvent.click(exitBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("displays title difference callout when version title differs from current draft", () => {
    renderWithTheme(
      <NoteVersionPreview
        selectedVersion={mockVersion1}
        currentTitle="Modified Current Title"
        currentContent="Hello world"
        onClosePreview={vi.fn()}
        onRestore={vi.fn()}
        isRestoring={false}
      />,
    );

    expect(screen.getByText("Title difference:")).toBeInTheDocument();
    expect(screen.getByText(/In this version:/)).toBeInTheDocument();
    expect(screen.getByText(/Current draft:/)).toBeInTheDocument();

    const historicalDel = screen.getByLabelText("Historical title: Original Title");
    expect(historicalDel.tagName.toLowerCase()).toBe("del");
    expect(historicalDel).toHaveTextContent("Original Title");
    const currentIns = screen.getByLabelText("Current draft title: Modified Current Title");
    expect(currentIns.tagName.toLowerCase()).toBe("ins");
    expect(currentIns).toHaveTextContent("Modified Current Title");
  });

  it("does not display Diff: +0 / -0 chars when only title changed and show changes is toggled on", () => {
    renderWithTheme(
      <NoteVersionPreview
        selectedVersion={mockVersion1}
        currentTitle="Different Title Only"
        currentContent={"Hello world\nThis is version 1"}
        onClosePreview={vi.fn()}
        onRestore={vi.fn()}
        isRestoring={false}
      />,
    );

    // Toggle Show changes switch
    const diffSwitch = screen.getByRole("switch", { name: /show changes/i });
    fireEvent.click(diffSwitch);

    // Content diff count (+0 / -0) should NOT be displayed
    expect(screen.queryByText(/Diff: \+0 \/ -0 chars/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\+0 \/ -0/)).not.toBeInTheDocument();

    // Red/green title difference is highlighted
    expect(screen.getByLabelText("Historical title: Original Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Current draft title: Different Title Only")).toBeInTheDocument();
  });

  it("renders Untitled placeholder when version title is empty", () => {
    const untitledVersion = { ...mockVersion1, title: "" };
    renderWithTheme(
      <NoteVersionPreview
        selectedVersion={untitledVersion}
        currentTitle=""
        currentContent="Some text"
        onClosePreview={vi.fn()}
        onRestore={vi.fn()}
        isRestoring={false}
      />,
    );

    expect(screen.getByText("(Untitled note)")).toBeInTheDocument();
    expect(screen.queryByText("Title difference:")).not.toBeInTheDocument();
  });

  it("renders Switch version button on mobile viewports and calls onOpenDrawer", () => {
    const handleOpenDrawer = vi.fn();

    renderWithTheme(
      <NoteVersionPreview
        selectedVersion={mockVersion1}
        currentTitle="Original Title"
        currentContent="Hello world"
        onClosePreview={vi.fn()}
        onRestore={vi.fn()}
        onOpenDrawer={handleOpenDrawer}
        isRestoring={false}
        isMobile={true}
      />,
    );

    const switchBtn = screen.getByRole("button", { name: /switch version/i });
    expect(switchBtn).toBeInTheDocument();
    fireEvent.click(switchBtn);
    expect(handleOpenDrawer).toHaveBeenCalledTimes(1);
  });

  it("toggles inline diff and renders added and removed word tokens with WCAG contrast tags", () => {
    renderWithTheme(
      <NoteVersionPreview
        selectedVersion={{
          ...mockVersion1,
          content: "Hello old world",
        }}
        currentTitle="Original Title"
        currentContent="Hello new brave world"
        initialShowDiff={false}
        onClosePreview={vi.fn()}
        onRestore={vi.fn()}
        isRestoring={false}
      />,
    );

    // Initially showDiff is false: snapshot view is shown
    expect(screen.getByLabelText("Note content snapshot")).toBeInTheDocument();
    expect(screen.queryByLabelText("Note diff content")).not.toBeInTheDocument();

    // Toggle Show changes switch
    const diffSwitch = screen.getByRole("switch", { name: /show changes/i });
    fireEvent.click(diffSwitch);

    // Diff view is now active
    expect(screen.queryByLabelText("Note content snapshot")).not.toBeInTheDocument();
    const diffContent = screen.getByLabelText("Note diff content");
    expect(diffContent).toBeInTheDocument();

    // ins tag for addition
    const addedElement = screen.getByLabelText("Added: new");
    expect(addedElement.tagName.toLowerCase()).toBe("ins");
    expect(screen.getByLabelText(/Added: brave/)).toBeInTheDocument();

    // del tag for deletion
    const removedElement = screen.getByLabelText("Deleted: old");
    expect(removedElement.tagName.toLowerCase()).toBe("del");

    // Screen reader announcement live region exists
    expect(
      screen.getByText(/characters added, .* characters removed/),
    ).toBeInTheDocument();
  });

  it("toggles show changes on unchanged content seamlessly preserving gutter line numbers and diff content", () => {
    renderWithTheme(
      <NoteVersionPreview
        selectedVersion={mockVersion1}
        currentTitle="Original Title"
        currentContent={"Hello world\nThis is version 1"}
        onClosePreview={vi.fn()}
        onRestore={vi.fn()}
        isRestoring={false}
      />,
    );

    // Initial snapshot view
    expect(screen.getByLabelText("Note content snapshot")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    const gutterPre = dialog.querySelector("pre[aria-hidden='true']");
    expect(gutterPre?.textContent).toBe("1\n2");

    // Toggle Show changes switch
    const diffSwitch = screen.getByRole("switch", { name: /show changes/i });
    fireEvent.click(diffSwitch);

    // Snapshot is gone, diff is visible
    expect(screen.queryByLabelText("Note content snapshot")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Note diff content")).toBeInTheDocument();

    // Gutter line numbers remain 1\n2 without distortion
    expect(gutterPre?.textContent).toBe("1\n2");

    // Rows render normal unchanged tokens
    expect(screen.getByTestId("diff-row-0")).toHaveTextContent("Hello world");
    expect(screen.getByTestId("diff-row-1")).toHaveTextContent("This is version 1");
  });

  it("opens confirmation dialog when Restore this version is clicked and calls onRestore on confirm", async () => {
    const handleRestore = vi.fn();

    renderWithTheme(
      <NoteVersionPreview
        selectedVersion={mockVersion1}
        currentTitle="Original Title"
        currentContent="Hello world"
        onClosePreview={vi.fn()}
        onRestore={handleRestore}
        isRestoring={false}
        isDirty={false}
      />,
    );

    const restoreBtn = screen.getByRole("button", {
      name: /restore this version/i,
    });
    fireEvent.click(restoreBtn);

    // Dialog opens
    expect(
      screen.getByRole("heading", { name: "Restore Version 1?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/This will restore the note's title and content to version 1 \(saved by Alice\)\./),
    ).toBeInTheDocument();

    // Confirm restore
    const confirmBtn = screen.getByRole("button", { name: "Restore Version" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(handleRestore).toHaveBeenCalledWith(mockVersion1);
    });
  });

  it("warns about overwriting unsaved draft changes when isDirty is true", async () => {
    renderWithTheme(
      <NoteVersionPreview
        selectedVersion={mockVersion1}
        currentTitle="Original Title"
        currentContent="Hello world"
        onClosePreview={vi.fn()}
        onRestore={vi.fn()}
        isRestoring={false}
        isDirty={true}
      />,
    );

    const restoreBtn = screen.getByRole("button", {
      name: /restore this version/i,
    });
    fireEvent.click(restoreBtn);

    expect(
      screen.getByText(/Any unsaved changes in your current draft will be overwritten\./),
    ).toBeInTheDocument();

    // Cancel closes dialog without restoring
    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Restore Version 1?" }),
      ).not.toBeInTheDocument();
    });
  });

  it("disables restore button and shows loading state when isRestoring is true", () => {
    renderWithTheme(
      <NoteVersionPreview
        selectedVersion={mockVersion1}
        currentTitle="Original Title"
        currentContent="Hello world"
        onClosePreview={vi.fn()}
        onRestore={vi.fn()}
        isRestoring={true}
      />,
    );

    const restoreBtn = screen.getByRole("button", {
      name: /restore this version/i,
    });
    expect(restoreBtn).toBeDisabled();
    expect(screen.getByText("Restoring...")).toBeInTheDocument();
  });

  it("renders within a modal Dialog with role dialog and supports header close button", () => {
    const handleClose = vi.fn();

    renderWithTheme(
      <NoteVersionPreview
        selectedVersion={mockVersion1}
        currentTitle="Original Title"
        currentContent="Hello world"
        onClose={handleClose}
        onRestore={vi.fn()}
        isRestoring={false}
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const closeIconBtn = screen.getByRole("button", { name: /close preview/i });
    fireEvent.click(closeIconBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("returns null when selectedVersion is null", () => {
    const { container } = renderWithTheme(
      <NoteVersionPreview
        selectedVersion={null}
        currentTitle="Original Title"
        currentContent="Hello world"
        onClose={vi.fn()}
        onRestore={vi.fn()}
        isRestoring={false}
      />,
    );

    expect(container.firstChild).toBeNull();
  });
});
