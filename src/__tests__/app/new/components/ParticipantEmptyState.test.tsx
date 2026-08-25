import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import { ParticipantEmptyState } from "@/app/new/components/participants/ParticipantEmptyState";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";

describe("ParticipantEmptyState", () => {
  it("renders default state without error styling", () => {
    const handleAdd = vi.fn();
    render(
      <ThemeProvider theme={PapyrusThemeLight}>
        <ParticipantEmptyState onAddParticipant={handleAdd} />
      </ThemeProvider>,
    );

    const text = screen.getByText(
      "No participants added yet. At least one participant is required.",
    );
    expect(text).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add participant/i })).toBeInTheDocument();
  });

  it("renders error state when hasError is true", () => {
    const handleAdd = vi.fn();
    render(
      <ThemeProvider theme={PapyrusThemeLight}>
        <ParticipantEmptyState onAddParticipant={handleAdd} hasError={true} />
      </ThemeProvider>,
    );

    const text = screen.getByText(
      "No participants added yet. At least one participant is required.",
    );
    expect(text).toBeInTheDocument();
  });

  it("calls onAddParticipant when button is clicked", () => {
    const handleAdd = vi.fn();
    render(
      <ThemeProvider theme={PapyrusThemeLight}>
        <ParticipantEmptyState onAddParticipant={handleAdd} />
      </ThemeProvider>,
    );

    const btn = screen.getByRole("button", { name: /add participant/i });
    fireEvent.click(btn);
    expect(handleAdd).toHaveBeenCalledTimes(1);
  });
});
