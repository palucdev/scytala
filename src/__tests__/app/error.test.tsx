import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import ErrorBoundary from "@/app/error";
import GlobalError from "@/app/global-error";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";
import { logger } from "@/lib/logger";

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe("Route Error Boundary (src/app/error.tsx)", () => {
  const mockReset = vi.fn();
  const mockLoggerError = vi.mocked(logger.error);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderErrorBoundary(error: Error & { digest?: string }) {
    return render(
      <ThemeProvider theme={PapyrusThemeLight}>
        <ErrorBoundary error={error} reset={mockReset} />
      </ThemeProvider>,
    );
  }

  it("renders error card with heading, message, and action buttons", () => {
    const testError = new Error("Database connection failure");
    renderErrorBoundary(testError);

    expect(
      screen.getByRole("heading", { name: /something went wrong/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /an unexpected error occurred while processing your request/i,
      ),
    ).toBeInTheDocument();

    const tryAgainBtn = screen.getByRole("button", { name: /try again/i });
    expect(tryAgainBtn).toBeInTheDocument();

    const returnHomeBtn = screen.getByRole("link", { name: /return home/i });
    expect(returnHomeBtn).toBeInTheDocument();
    expect(returnHomeBtn).toHaveAttribute("href", "/");
  });

  it("logs the caught error with digest to the structured logger", () => {
    const testError = Object.assign(new Error("Unexpected crash"), {
      digest: "err_digest_12345",
    });
    renderErrorBoundary(testError);

    expect(mockLoggerError).toHaveBeenCalledWith(
      "App route error boundary caught error",
      testError,
      { digest: "err_digest_12345" },
    );
  });

  it("calls reset when Try Again button is clicked", () => {
    const testError = new Error("Retryable error");
    renderErrorBoundary(testError);

    const tryAgainBtn = screen.getByRole("button", { name: /try again/i });
    fireEvent.click(tryAgainBtn);

    expect(mockReset).toHaveBeenCalledTimes(1);
  });
});

describe("Global Root Error Boundary (src/app/global-error.tsx)", () => {
  const mockReset = vi.fn();
  const mockLoggerError = vi.mocked(logger.error);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders global error card with html/body wrapper and triggers reset", () => {
    const testError = Object.assign(new Error("Root layout failure"), {
      digest: "global_digest_999",
    });
    render(<GlobalError error={testError} reset={mockReset} />);

    expect(
      screen.getByRole("heading", { name: /critical application error/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /a critical system error occurred/i,
      ),
    ).toBeInTheDocument();

    expect(mockLoggerError).toHaveBeenCalledWith(
      "Global root layout error boundary caught error",
      testError,
      { digest: "global_digest_999" },
    );

    const tryAgainBtn = screen.getByRole("button", { name: /try again/i });
    fireEvent.click(tryAgainBtn);
    expect(mockReset).toHaveBeenCalledTimes(1);

    const returnHomeBtn = screen.getByRole("link", { name: /return home/i });
    expect(returnHomeBtn).toHaveAttribute("href", "/");
  });
});
