import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import { RateLimitNotice } from "@/components/RateLimitNotice";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={PapyrusThemeLight}>{ui}</ThemeProvider>);
}

describe("RateLimitNotice Component", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders 429 title, security explanation, and retry button", () => {
    renderWithTheme(<RateLimitNotice retryAfterSeconds={30} />);

    expect(screen.getByText("429 — Too Many Requests")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Too many session verification attempts have been made from your network/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Please wait 30 seconds before trying again/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /To protect dashboard security and prevent resource exhaustion, session verification requests are temporarily throttled at the edge/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /retry now/i }),
    ).toBeInTheDocument();
  });

  it("renders generic wait message when retryAfterSeconds is omitted or non-positive", () => {
    const { rerender } = renderWithTheme(<RateLimitNotice />);
    expect(
      screen.getByText(/Please wait a moment before trying again/i),
    ).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={PapyrusThemeLight}>
        <RateLimitNotice retryAfterSeconds={0} />
      </ThemeProvider>,
    );
    expect(
      screen.getByText(/Please wait a moment before trying again/i),
    ).toBeInTheDocument();
  });

  it("reloads window when Retry Now button is clicked", () => {
    const mockReload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, reload: mockReload },
    });

    renderWithTheme(<RateLimitNotice retryAfterSeconds={10} />);
    fireEvent.click(screen.getByRole("button", { name: /retry now/i }));

    expect(mockReload).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });
});
