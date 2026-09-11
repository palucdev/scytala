import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import {
  NoteTitleInput,
  MAX_NOTE_TITLE_LENGTH,
} from "@/app/dashboard/[hash]/note/[noteId]/components/NoteTitleInput";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={PapyrusThemeLight}>{ui}</ThemeProvider>);
}

describe("NoteTitleInput Component", () => {
  it("renders input with value, placeholder and handles change", () => {
    const handleChange = vi.fn();
    renderWithTheme(
      <NoteTitleInput
        value="My Project"
        onChange={handleChange}
      />,
    );

    const input = screen.getByLabelText("Note title");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("My Project");
    expect(input).toHaveAttribute("maxLength", String(MAX_NOTE_TITLE_LENGTH));

    fireEvent.change(input, { target: { value: "My New Project" } });
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it("renders with error state and helper text", () => {
    renderWithTheme(
      <NoteTitleInput
        value=""
        onChange={vi.fn()}
        error={true}
        helperText="Title is required"
      />,
    );

    expect(screen.getByText("Title is required")).toBeInTheDocument();
  });

  it("supports disabled state and custom maxLength", () => {
    renderWithTheme(
      <NoteTitleInput
        value="Disabled Title"
        onChange={vi.fn()}
        disabled={true}
        maxLength={50}
      />,
    );

    const input = screen.getByLabelText("Note title");
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute("maxLength", "50");
  });
});
