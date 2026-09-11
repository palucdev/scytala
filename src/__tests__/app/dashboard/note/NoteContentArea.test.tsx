import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import {
  NoteContentArea,
  renderDiffToken,
  MAX_NOTE_CONTENT_LENGTH,
} from "@/app/dashboard/[hash]/note/[noteId]/components/NoteContentArea";
import type { DiffLineRow } from "@/lib/diff";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={PapyrusThemeLight}>{ui}</ThemeProvider>);
}

describe("NoteContentArea Component", () => {
  describe("Edit mode", () => {
    it("renders textarea with value, placeholder, and handles change", () => {
      const handleChange = vi.fn();
      renderWithTheme(
        <NoteContentArea
          mode="edit"
          value="Initial note body"
          onChange={handleChange}
        />,
      );

      const textarea = screen.getByLabelText("Note content");
      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveValue("Initial note body");
      expect(textarea).toHaveAttribute(
        "maxLength",
        String(MAX_NOTE_CONTENT_LENGTH),
      );

      fireEvent.change(textarea, { target: { value: "Updated note body" } });
      expect(handleChange).toHaveBeenCalledTimes(1);
    });

    it("displays error helper text in edit mode", () => {
      renderWithTheme(
        <NoteContentArea
          mode="edit"
          value=""
          error={true}
          helperText="Content is required"
        />,
      );

      expect(screen.getByText("Content is required")).toBeInTheDocument();
    });

    it("handles scroll event to synchronize gutter", () => {
      const { container } = renderWithTheme(
        <NoteContentArea
          mode="edit"
          value="Line 1\nLine 2\nLine 3"
          onChange={vi.fn()}
        />,
      );

      const textarea = screen.getByLabelText("Note content");
      const gutter = container.querySelector("pre[aria-hidden='true']");
      expect(gutter).toBeInTheDocument();

      fireEvent.scroll(textarea, { target: { scrollTop: 50 } });
      expect(gutter?.scrollTop).toBe(50);
    });
  });

  describe("Preview mode", () => {
    it("renders pre element snapshot when showDiff is false", () => {
      renderWithTheme(
        <NoteContentArea
          mode="preview"
          content="Static snapshot content"
          showDiff={false}
        />,
      );

      const pre = screen.getByLabelText("Note content snapshot");
      expect(pre).toBeInTheDocument();
      expect(pre).toHaveTextContent("Static snapshot content");
    });

    it("handles scroll in preview pre element", () => {
      const { container } = renderWithTheme(
        <NoteContentArea
          mode="preview"
          content="Line 1\nLine 2\nLine 3"
          showDiff={false}
        />,
      );

      const pre = screen.getByLabelText("Note content snapshot");
      const gutter = container.querySelector("pre[aria-hidden='true']");
      expect(gutter).toBeInTheDocument();

      fireEvent.scroll(pre, { target: { scrollTop: 75 } });
      expect(gutter?.scrollTop).toBe(75);
    });

    it("renders diff view with rows and colored tokens when showDiff is true", () => {
      const diffRows: DiffLineRow[] = [
        {
          lineNumber: 1,
          type: "normal",
          tokens: [{ value: "Unchanged line" }],
        },
        {
          lineNumber: 2,
          type: "add",
          tokens: [{ value: "Added token", added: true }],
        },
        {
          lineNumber: undefined,
          type: "delete",
          tokens: [{ value: "Deleted token", removed: true }],
        },
        {
          lineNumber: 3,
          type: "modify",
          tokens: [
            { value: "Old token", removed: true },
            { value: "New token", added: true },
          ],
        },
        {
          lineNumber: 4,
          type: "normal",
          tokens: [], // empty line
        },
      ];

      renderWithTheme(
        <NoteContentArea
          mode="preview"
          showDiff={true}
          diffRows={diffRows}
          diffLineNumbers={[1, 2, "-", 3, 4]}
        />,
      );

      expect(screen.getByLabelText("Note diff content")).toBeInTheDocument();
      expect(screen.getByTestId("diff-row-0")).toBeInTheDocument();
      expect(screen.getByTestId("diff-row-1")).toBeInTheDocument();
      expect(screen.getByTestId("diff-row-2")).toBeInTheDocument();
      expect(screen.getByTestId("diff-row-3")).toBeInTheDocument();
      expect(screen.getByTestId("diff-row-4")).toBeInTheDocument();

      expect(screen.getByLabelText("Added: Added token")).toBeInTheDocument();
      expect(screen.getByLabelText("Deleted: Deleted token")).toBeInTheDocument();
    });
  });

  describe("renderDiffToken helper", () => {
    it("renders added token with ins element", () => {
      const { container } = render(
        <>{renderDiffToken({ value: "added text", added: true }, 0)}</>,
      );
      const ins = container.querySelector("ins");
      expect(ins).toBeInTheDocument();
      expect(ins).toHaveTextContent("added text");
    });

    it("renders removed token with del element", () => {
      const { container } = render(
        <>{renderDiffToken({ value: "deleted text", removed: true }, 0)}</>,
      );
      const del = container.querySelector("del");
      expect(del).toBeInTheDocument();
      expect(del).toHaveTextContent("deleted text");
    });

    it("renders unchanged token with span element", () => {
      const { container } = render(
        <>{renderDiffToken({ value: "plain text" }, 0)}</>,
      );
      const span = container.querySelector("span");
      expect(span).toBeInTheDocument();
      expect(span).toHaveTextContent("plain text");
    });
  });
});
