import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import { ParticipantCard } from "@/app/new/components/participants/ParticipantCard";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";

describe("ParticipantCard", () => {
  const defaultUser = {
    id: "user-1",
    userAlias: "Alice",
    password: "secretpassword123",
  };

  const defaultProps = {
    user: defaultUser,
    index: 0,
    isPasswordVisible: false,
    onTogglePasswordVisibility: vi.fn(),
    onUpdateAlias: vi.fn(),
    onUpdatePassword: vi.fn(),
    onRegeneratePassword: vi.fn(),
    onRemove: vi.fn(),
  };

  function renderCard(props = {}) {
    return render(
      <ThemeProvider theme={PapyrusThemeLight}>
        <ParticipantCard {...defaultProps} {...props} />
      </ThemeProvider>,
    );
  }

  it("renders participant alias and password fields with initial values", () => {
    renderCard();

    expect(screen.getByLabelText("Participant 1 Alias")).toHaveValue("Alice");
    const passwordInput = screen.getByLabelText(
      "Participant 1 Password",
    ) as HTMLInputElement;
    expect(passwordInput.value).toBe("secretpassword123");
    expect(passwordInput.type).toBe("password");
  });

  it("renders password error helper text when passwordError is provided", () => {
    renderCard({
      passwordError: "Password must be at least 6 characters",
    });

    expect(
      screen.getByText("Password must be at least 6 characters"),
    ).toBeInTheDocument();
  });

  it("renders alias error helper text when aliasError is provided", () => {
    renderCard({
      aliasError: "Alias must be at least 2 characters",
    });

    expect(
      screen.getByText("Alias must be at least 2 characters"),
    ).toBeInTheDocument();
  });

  it("triggers callback when editing alias or password", () => {
    const onUpdateAlias = vi.fn();
    const onUpdatePassword = vi.fn();

    renderCard({ onUpdateAlias, onUpdatePassword });

    fireEvent.change(screen.getByLabelText("Participant 1 Alias"), {
      target: { value: "Bob" },
    });
    expect(onUpdateAlias).toHaveBeenCalledWith("Bob");

    fireEvent.change(screen.getByLabelText("Participant 1 Password"), {
      target: { value: "newpass123" },
    });
    expect(onUpdatePassword).toHaveBeenCalledWith("newpass123");
  });

  it("triggers callbacks for toggle visibility, regenerate, and remove buttons", () => {
    const onTogglePasswordVisibility = vi.fn();
    const onRegeneratePassword = vi.fn();
    const onRemove = vi.fn();

    renderCard({
      onTogglePasswordVisibility,
      onRegeneratePassword,
      onRemove,
    });

    fireEvent.click(screen.getByRole("button", { name: /show password/i }));
    expect(onTogglePasswordVisibility).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: /regenerate password/i }),
    );
    expect(onRegeneratePassword).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
