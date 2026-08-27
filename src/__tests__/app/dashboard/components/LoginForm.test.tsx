import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import LoginForm from "@/app/dashboard/[hash]/components/LoginForm";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";
import * as authActionModule from "@/actions/auth";

const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

vi.mock("@/actions/auth", () => ({
  loginToDashboardAction: vi.fn(),
}));

function renderLoginForm(dashboardHash = "test-dashboard-hash") {
  return render(
    <ThemeProvider theme={PapyrusThemeLight}>
      <LoginForm dashboardHash={dashboardHash} />
    </ThemeProvider>,
  );
}

describe("LoginForm Client Component", () => {
  const mockLoginToDashboardAction = vi.mocked(
    authActionModule.loginToDashboardAction,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders form elements with minimalist branding and accessible inputs", () => {
    renderLoginForm("hash-xyz-123");

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Scytala Dashboard Login",
    );
    expect(
      screen.getByText(
        "Enter your participant credentials to access this dashboard.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("User Alias")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();

    const submitBtn = screen.getByRole("button", { name: /sign in/i });
    expect(submitBtn).toBeInTheDocument();
    expect(submitBtn).not.toBeDisabled();
  });

  it("toggles password visibility when show/hide password icon button is clicked", () => {
    renderLoginForm();

    const passwordInput = screen.getByLabelText("Password") as HTMLInputElement;
    expect(passwordInput.type).toBe("password");

    const toggleBtn = screen.getByRole("button", { name: /show password/i });
    fireEvent.click(toggleBtn);

    expect(passwordInput.type).toBe("text");
    expect(
      screen.getByRole("button", { name: /hide password/i }),
    ).toBeInTheDocument();

    const hideBtn = screen.getByRole("button", { name: /hide password/i });
    fireEvent.click(hideBtn);

    expect(passwordInput.type).toBe("password");
    expect(
      screen.getByRole("button", { name: /show password/i }),
    ).toBeInTheDocument();
  });

  it("submits valid credentials, calls loginToDashboardAction, and calls router.refresh on success", async () => {
    mockLoginToDashboardAction.mockResolvedValueOnce({
      success: true,
    });

    renderLoginForm("my-secret-hash");

    const aliasInput = screen.getByLabelText("User Alias");
    const passwordInput = screen.getByLabelText("Password");
    const submitBtn = screen.getByRole("button", { name: /sign in/i });

    fireEvent.change(aliasInput, { target: { value: "Alice_Commander" } });
    fireEvent.change(passwordInput, { target: { value: "SecurePass123!" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockLoginToDashboardAction).toHaveBeenCalledWith({
        dashboardHash: "my-secret-hash",
        userAlias: "Alice_Commander",
        password: "SecurePass123!",
      });
    });

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("displays error alert when login action returns failure without field errors", async () => {
    mockLoginToDashboardAction.mockResolvedValueOnce({
      success: false,
      error: "Invalid alias or password.",
    });

    renderLoginForm();

    const aliasInput = screen.getByLabelText("User Alias");
    const passwordInput = screen.getByLabelText("Password");
    const submitBtn = screen.getByRole("button", { name: /sign in/i });

    fireEvent.change(aliasInput, { target: { value: "UnknownUser" } });
    fireEvent.change(passwordInput, { target: { value: "WrongPassword" } });
    fireEvent.click(submitBtn);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Invalid alias or password.");
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("displays field errors when login action returns validation fieldErrors", async () => {
    mockLoginToDashboardAction.mockResolvedValueOnce({
      success: false,
      error: "Invalid credentials format.",
      fieldErrors: {
        userAlias: ["Alias must be at least 2 characters"],
        password: ["Password is required"],
      },
    });

    renderLoginForm();

    const submitBtn = screen.getByRole("button", { name: /sign in/i });
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText("Alias must be at least 2 characters"),
    ).toBeInTheDocument();
    expect(screen.getByText("Password is required")).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid credentials format.",
    );
  });

  it("clears previous errors when submitting the form again", async () => {
    mockLoginToDashboardAction
      .mockResolvedValueOnce({
        success: false,
        error: "Initial error message",
      })
      .mockResolvedValueOnce({
        success: true,
      });

    renderLoginForm();

    const aliasInput = screen.getByLabelText("User Alias");
    const passwordInput = screen.getByLabelText("Password");
    const submitBtn = screen.getByRole("button", { name: /sign in/i });

    fireEvent.change(aliasInput, { target: { value: "BadAlias" } });
    fireEvent.change(passwordInput, { target: { value: "BadPass" } });
    fireEvent.click(submitBtn);

    expect(await screen.findByText("Initial error message")).toBeInTheDocument();

    fireEvent.change(aliasInput, { target: { value: "GoodAlias" } });
    fireEvent.change(passwordInput, { target: { value: "GoodPass" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.queryByText("Initial error message")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    });
  });
});
