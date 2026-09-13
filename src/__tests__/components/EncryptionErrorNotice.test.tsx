import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import { EncryptionErrorNotice } from "@/components/EncryptionErrorNotice";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={PapyrusThemeLight}>{ui}</ThemeProvider>);
}

const CIPHERTEXT_SAMPLE = "v1:AAAAAAAAAAAAAAAAAAAAAA: tampered-ciphertext";
const KEY_MATERIAL_HINT = "NOTE_ENCRYPTION_KEY";
const STACK_HINT = "at decryptNoteField";

describe("EncryptionErrorNotice Component", () => {
  it("renders a generic error notice for a note with a try-again hint", () => {
    renderWithTheme(<EncryptionErrorNotice />);

    expect(screen.getByText("Note unavailable")).toBeInTheDocument();
    expect(
      screen.getByText(/problem with its stored encryption/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/try again later/i)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("never renders ciphertext, key material, or stack details", () => {
    const { container } = renderWithTheme(
      <EncryptionErrorNotice />,
    );

    expect(container.textContent).not.toContain(CIPHERTEXT_SAMPLE);
    expect(container.textContent).not.toContain(KEY_MATERIAL_HINT);
    expect(container.textContent).not.toContain(STACK_HINT);
    expect(container.textContent).not.toMatch(/v1:/);
  });
});
