import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import DashboardCreationWizard from "@/app/new/page";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";
import * as dashboardActionModule from "@/actions/dashboard";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@/actions/dashboard", async (importOriginal) => {
  const actual = await importOriginal<typeof dashboardActionModule>();
  return {
    ...actual,
    createDashboardAction: vi.fn(),
  };
});

function renderWizard() {
  return render(
    <ThemeProvider theme={PapyrusThemeLight}>
      <DashboardCreationWizard />
    </ThemeProvider>,
  );
}

describe("DashboardCreationWizard (/new)", () => {
  const mockCreateDashboardAction = vi.mocked(
    dashboardActionModule.createDashboardAction,
  );

  let clipboardWriteTextMock: ReturnType<typeof vi.fn>;
  let timeoutIds: ReturnType<typeof setTimeout>[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    timeoutIds = [];

    clipboardWriteTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: clipboardWriteTextMock,
      },
      writable: true,
      configurable: true,
    });

    const originalSetTimeout = global.setTimeout;
    vi.spyOn(global, "setTimeout").mockImplementation(((
      fn: TimerHandler,
      delay?: number,
      ...args: unknown[]
    ) => {
      const id = originalSetTimeout(
        fn as (...args: unknown[]) => void,
        delay,
        ...args,
      );
      timeoutIds.push(id);
      return id;
    }) as unknown as typeof setTimeout);
  });

  afterEach(() => {
    for (const id of timeoutIds) {
      clearTimeout(id);
    }
    timeoutIds = [];
    vi.restoreAllMocks();
  });

  describe("Step 1: Dashboard Details", () => {
    it("renders title and description inputs with initial state", () => {
      renderWizard();

      expect(screen.getByText("Create New Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Dashboard Details")).toBeInTheDocument();
      expect(screen.getByLabelText("Dashboard Title")).toBeInTheDocument();
      expect(screen.getByLabelText("Dashboard Description")).toBeInTheDocument();

      const backBtn = screen.getByRole("button", { name: /back/i });
      expect(backBtn).toBeDisabled();
    });

    it("displays validation error when attempting to advance with empty title", async () => {
      renderWizard();

      const nextBtn = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextBtn);

      expect(
        await screen.findByText("Dashboard title is required"),
      ).toBeInTheDocument();
      // Should remain on Step 1
      expect(screen.getByText("Dashboard Details")).toBeInTheDocument();
    });

    it("displays validation error when title exceeds 80 characters", async () => {
      renderWizard();

      const titleInput = screen.getByLabelText("Dashboard Title");
      fireEvent.change(titleInput, { target: { value: "a".repeat(81) } });

      const nextBtn = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextBtn);

      expect(
        await screen.findByText("Dashboard title must not exceed 80 characters"),
      ).toBeInTheDocument();
    });

    it("advances to Step 2 when valid title and description are entered", async () => {
      renderWizard();

      const titleInput = screen.getByLabelText("Dashboard Title");
      const descInput = screen.getByLabelText("Dashboard Description");

      fireEvent.change(titleInput, { target: { value: "Apollo Mission Control" } });
      fireEvent.change(descInput, { target: { value: "Confidential moon landing notes" } });

      const nextBtn = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextBtn);

      expect(await screen.findByText("Participant Credentials")).toBeInTheDocument();
    });
  });

  describe("Step 2: Participant Credentials", () => {
    beforeEach(async () => {
      renderWizard();
      const titleInput = screen.getByLabelText("Dashboard Title");
      fireEvent.change(titleInput, { target: { value: "Alpha Dashboard" } });
      const nextBtn = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextBtn);
      await screen.findByText("Participant Credentials");
    });

    it("renders empty state initially with prompt to add participants", () => {
      const emptyText = screen.getByText(
        "No participants added yet. At least one participant is required.",
      );
      expect(emptyText).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /add participant/i })).toBeInTheDocument();
    });

    it("does not advance if no participants have been added and applies error state", () => {
      const emptyText = screen.getByText(
        "No participants added yet. At least one participant is required.",
      );
      const nextBtn = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextBtn);

      expect(screen.getByText("Participant Credentials")).toBeInTheDocument();
      expect(emptyText).toBeInTheDocument();

      // Adding a participant clears the empty state
      const addBtn = screen.getByRole("button", { name: /add participant/i });
      fireEvent.click(addBtn);
      expect(
        screen.queryByText("No participants added yet. At least one participant is required."),
      ).not.toBeInTheDocument();
    });

    it("adds a participant row with auto-generated secure password", async () => {
      const addBtn = screen.getByRole("button", { name: /add participant/i });
      fireEvent.click(addBtn);

      expect(screen.getByLabelText("Participant 1 Alias")).toBeInTheDocument();
      const passwordInput = screen.getByLabelText("Participant 1 Password") as HTMLInputElement;
      expect(passwordInput.value).toHaveLength(16);
    });

    it("toggles password visibility between password and text type", async () => {
      const addBtn = screen.getByRole("button", { name: /add participant/i });
      fireEvent.click(addBtn);

      const passwordInput = screen.getByLabelText("Participant 1 Password") as HTMLInputElement;
      expect(passwordInput.type).toBe("password");

      const toggleBtn = screen.getByRole("button", { name: /show password/i });
      fireEvent.click(toggleBtn);

      expect(passwordInput.type).toBe("text");

      const hideBtn = screen.getByRole("button", { name: /hide password/i });
      fireEvent.click(hideBtn);

      expect(passwordInput.type).toBe("password");
    });

    it("regenerates password when regenerate button is clicked", async () => {
      const addBtn = screen.getByRole("button", { name: /add participant/i });
      fireEvent.click(addBtn);

      const passwordInput = screen.getByLabelText("Participant 1 Password") as HTMLInputElement;
      const initialPassword = passwordInput.value;

      const regenBtn = screen.getByRole("button", { name: /regenerate password/i });
      fireEvent.click(regenBtn);

      expect(passwordInput.value).toHaveLength(16);
      expect(passwordInput.value).not.toBe(initialPassword);
    });

    it("removes a participant row when delete button is clicked", async () => {
      const addBtn = screen.getByRole("button", { name: /add participant/i });
      fireEvent.click(addBtn);

      expect(screen.getByLabelText("Participant 1 Alias")).toBeInTheDocument();

      const deleteBtn = screen.getByRole("button", { name: /remove/i });
      fireEvent.click(deleteBtn);

      expect(
        screen.getByText("No participants added yet. At least one participant is required."),
      ).toBeInTheDocument();
    });

    it("validates alias field for empty, short, long, invalid characters, and duplicates", async () => {
      const addBtn = screen.getByRole("button", { name: /add participant/i });
      fireEvent.click(addBtn);

      const nextBtn = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextBtn);

      expect(await screen.findByText("Alias is required")).toBeInTheDocument();

      const aliasInput1 = screen.getByLabelText("Participant 1 Alias");
      fireEvent.change(aliasInput1, { target: { value: "a" } });
      fireEvent.click(nextBtn);
      expect(await screen.findByText("Alias must be at least 2 characters")).toBeInTheDocument();

      fireEvent.change(aliasInput1, { target: { value: "invalid alias with spaces" } });
      fireEvent.click(nextBtn);
      expect(
        await screen.findByText("Alias can only contain letters, numbers, hyphens, and underscores"),
      ).toBeInTheDocument();

      // Add second participant to test duplicate alias detection
      const addAnotherBtn = screen.getByRole("button", { name: /add another participant/i });
      fireEvent.click(addAnotherBtn);

      const aliasInput2 = screen.getByLabelText("Participant 2 Alias");
      fireEvent.change(aliasInput1, { target: { value: "Alice_99" } });
      fireEvent.change(aliasInput2, { target: { value: "alice_99" } });

      fireEvent.click(nextBtn);
      const duplicateErrors = await screen.findAllByText("Participant aliases must be unique");
      expect(duplicateErrors.length).toBeGreaterThanOrEqual(1);
    });

    it("validates password field when under 6 chars or over 128 chars and renders error under password", async () => {
      const addBtn = screen.getByRole("button", { name: /add participant/i });
      fireEvent.click(addBtn);

      const aliasInput = screen.getByLabelText("Participant 1 Alias");
      const passwordInput = screen.getByLabelText("Participant 1 Password");
      const nextBtn = screen.getByRole("button", { name: /next/i });

      // Valid alias, short password (< 6 chars)
      fireEvent.change(aliasInput, { target: { value: "ValidAlias" } });
      fireEvent.change(passwordInput, { target: { value: "123" } });
      fireEvent.click(nextBtn);

      expect(
        await screen.findByText("Password must be at least 6 characters"),
      ).toBeInTheDocument();
      // Alias should not have error
      expect(screen.queryByText("Alias is required")).not.toBeInTheDocument();

      // Password too long (> 128 chars)
      fireEvent.change(passwordInput, { target: { value: "a".repeat(129) } });
      fireEvent.click(nextBtn);

      expect(
        await screen.findByText("Password must be at most 128 characters"),
      ).toBeInTheDocument();

      // Regenerating password clears the password error
      const regenBtn = screen.getByRole("button", { name: /regenerate password/i });
      fireEvent.click(regenBtn);
      expect(
        screen.queryByText("Password must be at most 128 characters"),
      ).not.toBeInTheDocument();
    });

    it("renders both alias and password error simultaneously when both are invalid", async () => {
      const addBtn = screen.getByRole("button", { name: /add participant/i });
      fireEvent.click(addBtn);

      const aliasInput = screen.getByLabelText("Participant 1 Alias");
      const passwordInput = screen.getByLabelText("Participant 1 Password");
      const nextBtn = screen.getByRole("button", { name: /next/i });

      fireEvent.change(aliasInput, { target: { value: "" } });
      fireEvent.change(passwordInput, { target: { value: "12" } });
      fireEvent.click(nextBtn);

      expect(await screen.findByText("Alias is required")).toBeInTheDocument();
      expect(
        await screen.findByText("Password must be at least 6 characters"),
      ).toBeInTheDocument();
    });

    it("allows stepping back to Step 1 and preserves entered details", async () => {
      const backBtn = screen.getByRole("button", { name: /back/i });
      fireEvent.click(backBtn);

      expect(screen.getByText("Dashboard Details")).toBeInTheDocument();
      const titleInput = screen.getByLabelText("Dashboard Title") as HTMLInputElement;
      expect(titleInput.value).toBe("Alpha Dashboard");
    });
  });

  describe("Step 3: Review & Submission", () => {
    beforeEach(async () => {
      renderWizard();
      const titleInput = screen.getByLabelText("Dashboard Title");
      const descInput = screen.getByLabelText("Dashboard Description");
      fireEvent.change(titleInput, { target: { value: "Gamma Project" } });
      fireEvent.change(descInput, { target: { value: "Project description notes" } });

      const nextBtn = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextBtn);
      await screen.findByText("Participant Credentials");

      const addBtn = screen.getByRole("button", { name: /add participant/i });
      fireEvent.click(addBtn);

      const aliasInput1 = screen.getByLabelText("Participant 1 Alias");
      fireEvent.change(aliasInput1, { target: { value: "Alice_Prime" } });

      const addAnotherBtn = screen.getByRole("button", { name: /add another participant/i });
      fireEvent.click(addAnotherBtn);

      const aliasInput2 = screen.getByLabelText("Participant 2 Alias");
      fireEvent.change(aliasInput2, { target: { value: "Bob_Sec" } });

      fireEvent.click(nextBtn);
      await screen.findByText("Review & Confirmation");
    });

    it("renders summary details and credentials with copy functionality in review", async () => {
      expect(screen.getByText("Gamma Project")).toBeInTheDocument();
      expect(screen.getByText("Project description notes")).toBeInTheDocument();
      expect(screen.getByText("Configured Participants (2)")).toBeInTheDocument();
      expect(screen.getByText("Alice_Prime")).toBeInTheDocument();
      expect(screen.getByText("Bob_Sec")).toBeInTheDocument();

      // Test copying single credential in review
      const copyAliceBtn = screen.getByRole("button", {
        name: "Copy credentials for Alice_Prime",
      });
      fireEvent.click(copyAliceBtn);
      expect(clipboardWriteTextMock).toHaveBeenCalledWith(
        expect.stringContaining("Alice_Prime: "),
      );

      // Test copy all credentials in review
      const copyAllBtn = screen.getByRole("button", {
        name: /copy all credentials/i,
      });
      fireEvent.click(copyAllBtn);
      expect(clipboardWriteTextMock).toHaveBeenCalledWith(
        expect.stringContaining("Dashboard: Gamma Project"),
      );
    });

    it("handles server action error and displays alert while preserving state", async () => {
      mockCreateDashboardAction.mockResolvedValueOnce({
        success: false,
        error: "Database constraint error: slug collision",
      });

      const createBtn = screen.getByRole("button", { name: /create dashboard/i });
      fireEvent.click(createBtn);

      expect(
        await screen.findByText(/Database constraint error: slug collision/),
      ).toBeInTheDocument();

      // Still on Review step, ready for retry
      expect(screen.getByText("Review & Confirmation")).toBeInTheDocument();
      expect(screen.getByText("Gamma Project")).toBeInTheDocument();
    });

    it("persists entities in db on button click and advances to Step 4 (RR-01 & RR-06)", async () => {
      mockCreateDashboardAction.mockResolvedValueOnce({
        success: true,
        dashboard: {
          id: "dash-123",
          title: "Gamma Project",
          description: "Project description notes",
          hash: "slug-gamma-12345",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        credentials: [
          { userAlias: "Alice_Prime", password: "password-alice-123" },
          { userAlias: "Bob_Sec", password: "password-bob-456" },
        ],
      });

      const createBtn = screen.getByRole("button", { name: /create dashboard/i });
      fireEvent.click(createBtn);

      // Verify createDashboardAction was called with properly formatted payload
      await waitFor(() => {
        expect(mockCreateDashboardAction).toHaveBeenCalledWith({
          title: "Gamma Project",
          description: "Project description notes",
          users: [
            expect.objectContaining({ userAlias: "Alice_Prime" }),
            expect.objectContaining({ userAlias: "Bob_Sec" }),
          ],
        });
      });

      // Verify transition to Step 4
      expect(await screen.findByText("Dashboard Created!")).toBeInTheDocument();
      expect(screen.getByText("Gamma Project", { selector: "strong" })).toBeInTheDocument();
      expect(screen.getByText("Success", { selector: ".MuiAlertTitle-root" })).toBeInTheDocument();
    });

    it("remains resilient on Step 4 even when client navigation fails (RR-01)", async () => {
      mockCreateDashboardAction.mockResolvedValueOnce({
        success: true,
        dashboard: {
          id: "dash-123",
          title: "Gamma Project",
          description: "Project description notes",
          hash: "slug-gamma-12345",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        credentials: [
          { userAlias: "Alice_Prime", password: "password-alice-123" },
        ],
      });

      // Simulate router.push failing
      mockPush.mockImplementationOnce(() => {
        throw new Error("Navigation timeout");
      });

      const createBtn = screen.getByRole("button", { name: /create dashboard/i });
      fireEvent.click(createBtn);

      expect(await screen.findByText("Dashboard Created!")).toBeInTheDocument();

      const enterBtn = screen.getByRole("button", { name: /enter dashboard/i });
      fireEvent.click(enterBtn);
      expect(mockPush).toHaveBeenCalledWith("/dashboard/slug-gamma-12345");

      // Even after navigation attempt, created entities and credentials remain accessible on screen!
      expect(screen.getByText("Dashboard Created!")).toBeInTheDocument();
      expect(screen.getByText("Alice_Prime")).toBeInTheDocument();
    });
  });

  describe("Step 4: Share & Success Screen", () => {
    beforeEach(async () => {
      mockCreateDashboardAction.mockResolvedValueOnce({
        success: true,
        dashboard: {
          id: "dash-999",
          title: "Delta Space",
          description: null,
          hash: "delta-hash-xyz",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        credentials: [
          { userAlias: "Commander", password: "cmd-secret-pass-99" },
          { userAlias: "Pilot", password: "plt-secret-pass-88" },
        ],
      });

      renderWizard();
      const titleInput = screen.getByLabelText("Dashboard Title");
      fireEvent.change(titleInput, { target: { value: "Delta Space" } });

      const nextBtn = screen.getByRole("button", { name: /next/i });
      fireEvent.click(nextBtn);
      await screen.findByText("Participant Credentials");

      const addBtn = screen.getByRole("button", { name: /add participant/i });
      fireEvent.click(addBtn);
      const aliasInput = screen.getByLabelText("Participant 1 Alias");
      fireEvent.change(aliasInput, { target: { value: "Commander" } });

      fireEvent.click(nextBtn);
      await screen.findByText("Review & Confirmation");

      const createBtn = screen.getByRole("button", { name: /create dashboard/i });
      fireEvent.click(createBtn);

      await screen.findByText("Dashboard Created!");
    });

    it("copies shareable dashboard URL to clipboard", async () => {
      const copyUrlBtn = screen.getByRole("button", { name: /copy dashboard link/i });
      fireEvent.click(copyUrlBtn);

      expect(clipboardWriteTextMock).toHaveBeenCalledWith(
        expect.stringContaining("/dashboard/delta-hash-xyz"),
      );
    });

    it("copies individual participant credential to clipboard", async () => {
      const copyCmdBtn = screen.getByRole("button", {
        name: "Copy credentials for Commander",
      });
      fireEvent.click(copyCmdBtn);

      expect(clipboardWriteTextMock).toHaveBeenCalledWith("Commander: cmd-secret-pass-99");
    });

    it("copies all credentials formatted text to clipboard", async () => {
      const copyAllBtn = screen.getByRole("button", { name: /copy all credentials/i });
      fireEvent.click(copyAllBtn);

      expect(clipboardWriteTextMock).toHaveBeenCalledWith(
        expect.stringContaining("Dashboard: Delta Space"),
      );
      expect(clipboardWriteTextMock).toHaveBeenCalledWith(
        expect.stringContaining("Commander: cmd-secret-pass-99"),
      );
      expect(clipboardWriteTextMock).toHaveBeenCalledWith(
        expect.stringContaining("Pilot: plt-secret-pass-88"),
      );
    });

    it("navigates to the dashboard URL when Enter Dashboard is clicked", () => {
      const enterBtn = screen.getByRole("button", { name: /enter dashboard/i });
      fireEvent.click(enterBtn);

      expect(mockPush).toHaveBeenCalledWith("/dashboard/delta-hash-xyz");
    });
  });
});
