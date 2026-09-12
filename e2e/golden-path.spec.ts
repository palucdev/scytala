import { test, expect } from "./fixtures/test-base";

test.describe("Golden Path E2E (Risk #4: Browser Workflow & Persistence)", () => {
  test("complete user journey from wizard creation to note CRUD, version restore, and logout", async ({
    page,
    clipboard,
    browserName,
  }) => {
    const timestamp = Date.now();
    const workspaceTitle = `E2E Test Workspace ${timestamp}`;
    const workspaceDescription = "Automated Golden Path verification workspace";
    const userAlias = "Alice";
    const noteTitle = `Initial E2E Note ${timestamp}`;
    const initialContent = "Line 1: Initial content";
    const updatedContent = "Line 1: Initial content\nLine 2: Appended update";

    page.on("console", (msg) => console.log("[BROWSER CONSOLE]", msg.type(), msg.text()));
    page.on("pageerror", (err) => console.log("[BROWSER ERROR]", err.message));

    // -------------------------------------------------------------
    // Step 1: Wizard Creation
    // -------------------------------------------------------------
    await page.goto("/new");
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("heading", { name: "Dashboard Details" }),
    ).toBeVisible();

    const titleInput = page.locator("#dashboard-title-input");
    await expect(titleInput).toBeVisible();
    await titleInput.focus();
    await titleInput.pressSequentially(workspaceTitle);
    await expect(
      page.getByText(`${workspaceTitle.length}/80 characters`),
    ).toBeVisible();

    const descInput = page.locator("#dashboard-description-input");
    await descInput.fill(workspaceDescription);
    await expect(
      page.getByText(`${workspaceDescription.length}/300 characters`),
    ).toBeVisible();

    await page.locator("#wizard-next-btn").click();

    // Step 2: Participant Credentials
    await expect(
      page.getByRole("heading", { name: "Participant Credentials" }),
    ).toBeVisible();

    const addFirstBtn = page.locator("#add-first-participant-btn");
    await expect(addFirstBtn).toBeVisible();
    await addFirstBtn.click();

    const aliasInput = page.locator('input[aria-label="Participant 1 Alias"]');
    await expect(aliasInput).toBeVisible();
    await aliasInput.fill(userAlias);

    const passwordInput = page.locator(
      'input[aria-label="Participant 1 Password"]',
    );
    await expect(passwordInput).toBeVisible();
    const userPassword = await passwordInput.inputValue();
    expect(userPassword.length).toBeGreaterThanOrEqual(16);

    await page.locator("#wizard-next-btn").click();

    // Step 3: Review
    await expect(
      page.getByRole("heading", { name: "Review & Confirmation" }),
    ).toBeVisible();
    await expect(page.getByText(workspaceTitle)).toBeVisible();
    await expect(page.getByText(userAlias)).toBeVisible();

    await page.locator("#wizard-create-btn").click();

    // -------------------------------------------------------------
    // Step 2: Success & Clipboard Copy
    // -------------------------------------------------------------
    await expect(page.locator("#wizard-success-alert")).toBeVisible();

    const shareableUrlInput = page.locator("#shareable-url-input");
    await expect(shareableUrlInput).toBeVisible();
    const shareableUrl = await shareableUrlInput.inputValue();
    expect(shareableUrl).toContain("/dashboard/");
    const dashboardHash = shareableUrl.split("/dashboard/")[1]?.trim();
    expect(dashboardHash).toBeTruthy();

    // Copy credentials and assert clipboard content
    const copyAllBtn = page.locator("#copy-all-credentials-btn");
    await expect(copyAllBtn).toBeVisible();
    await copyAllBtn.click();
    await expect(page.getByText("Copied All!")).toBeVisible();

    if (browserName === "chromium") {
      const clipboardContent = await clipboard.readText();
      expect(clipboardContent).toContain(userAlias);
      expect(clipboardContent).toContain(userPassword);
    }

    // Enter Dashboard
    await page.locator("#enter-dashboard-btn").click();
    await page.waitForURL(`**/dashboard/${dashboardHash}`);

    // -------------------------------------------------------------
    // Step 3: Authentication (Login)
    // -------------------------------------------------------------
    await expect(page.locator("#login-user-alias")).toBeVisible();
    await expect(page.locator("#login-password")).toBeVisible();

    await page.locator("#login-user-alias").fill(userAlias);
    await page.locator("#login-password").fill(userPassword);
    await page.getByRole("button", { name: "Sign In" }).click();

    // Wait for transition from LoginForm to DashboardView
    await expect(page.locator("#login-user-alias")).toBeHidden();
    await expect(page.getByText(userAlias)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "No notes yet" }),
    ).toBeVisible();

    // -------------------------------------------------------------
    // Step 4: Note Authoring & Save
    // -------------------------------------------------------------
    const createNoteBtn = page.locator("#header-create-note-btn");
    await expect(createNoteBtn).toBeVisible();
    await createNoteBtn.click();

    await page.waitForURL(`**/dashboard/${dashboardHash}/note/new`);
    await expect(
      page.getByRole("heading", { name: "Text note" }),
    ).toBeVisible();

    await page.getByRole("textbox", { name: "Note title" }).fill(noteTitle);
    await page.getByRole("textbox", { name: "Note content" }).fill(initialContent);

    test.setTimeout(120000);

    const saveBtn = page.getByRole("button", { name: "Save note" });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // Await save completion (button transitions to disabled state)
    await expect(saveBtn).toBeDisabled();

    // Navigate back to Dashboard
    await page.getByRole("link", { name: "Back" }).click();
    const leaveBtn = page.getByRole("button", { name: "Leave" });
    if (await leaveBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await leaveBtn.click();
    }
    await page.waitForURL(`**/dashboard/${dashboardHash}`);

    // Assert note tile in NoteGrid
    await expect(
      page.getByRole("heading", { name: noteTitle, level: 2 }),
    ).toBeVisible();
    await expect(page.getByText("v1")).toBeVisible();

    // -------------------------------------------------------------
    // Step 5: Note Editing & Version History Drawer
    // -------------------------------------------------------------
    await page.getByRole("link", { name: `Open note: ${noteTitle}` }).click();
    await page.waitForURL(`**/dashboard/${dashboardHash}/note/*`);
    const noteUrl = page.url();
    const noteId = noteUrl.split("/note/")[1]?.split("?")[0]?.trim();
    expect(noteId).toBeTruthy();

    // Update note content
    const contentInput = page.getByRole("textbox", { name: "Note content" });
    await contentInput.fill(updatedContent);

    const updateSaveBtn = page.getByRole("button", { name: "Save note" });
    await expect(updateSaveBtn).toBeEnabled();
    await updateSaveBtn.click();
    await expect(updateSaveBtn).toBeDisabled();

    // Wait for server revalidation and version chip increment to v2
    await expect(page.getByText("v2")).toBeVisible();

    // Open version history drawer
    const historyBtn = page.locator("#note-history-btn");
    await expect(historyBtn).toBeEnabled();
    await historyBtn.click();

    await expect(
      page.getByRole("heading", { name: "Version History" }),
    ).toBeVisible();

    // Select historical version v1 in drawer
    const v1Item = page.locator(".MuiListItemButton-root").filter({ hasText: /v1/ });
    await expect(v1Item).toBeVisible();
    await v1Item.click();

    // Version preview modal opens
    await expect(page.locator("#note-preview-dialog-title")).toBeVisible();

    // Click Restore version
    const restoreBtn = page.getByRole("button", {
      name: "Restore this version",
    });
    await expect(restoreBtn).toBeVisible();
    await restoreBtn.click();

    // Confirm restore dialog
    const confirmRestoreBtn = page.getByRole("button", {
      name: "Restore Version",
    });
    await expect(confirmRestoreBtn).toBeVisible();
    await confirmRestoreBtn.click();

    // Verify preview modal closes, editor reloads with v1 content and v3 version
    await expect(page.locator("#note-preview-dialog-title")).toBeHidden();
    await expect(contentInput).toHaveValue(initialContent);
    await expect(page.getByText("v3")).toBeVisible();

    // -------------------------------------------------------------
    // Step 6: Logout & Session Eviction
    // -------------------------------------------------------------
    await page.getByRole("link", { name: "Back" }).click();
    const leaveBtnStep6 = page.getByRole("button", { name: "Leave" });
    if (await leaveBtnStep6.isVisible({ timeout: 1500 }).catch(() => false)) {
      await leaveBtnStep6.click();
    }
    await page.waitForURL(`**/dashboard/${dashboardHash}`);
    await expect(page.getByRole("heading", { name: "Text note" })).toBeHidden();
    await expect(
      page.getByRole("heading", { name: workspaceTitle, level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: noteTitle, level: 2 }),
    ).toBeVisible();

    const logoutForm = page.locator('form[action="/api/auth/logout"]');
    await expect(logoutForm).toBeVisible();
    const logoutBtn = logoutForm.locator("#dashboard-logout-btn");
    await expect(logoutBtn).toBeVisible();
    await expect(logoutBtn).toBeEnabled();

    // Trigger logout submission and ensure session cookie eviction
    const logoutResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/auth/logout"),
      { timeout: 15000 },
    );
    await logoutBtn.click();
    const responded = await Promise.race([
      logoutResponsePromise.then(() => true),
      page.waitForTimeout(3000).then(() => false),
    ]);
    if (!responded) {
      await logoutForm.evaluate((form: HTMLFormElement) => form.requestSubmit());
      await logoutResponsePromise;
    }

    // Await redirect and verify login form presentation
    await expect(page.locator("#login-user-alias")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#login-password")).toBeVisible();
    await expect(page.getByText(workspaceTitle)).toBeHidden();

    // Attempt direct navigation to note editor, verify redirect/presentation of login form
    await page.goto(`/dashboard/${dashboardHash}/note/${noteId}`);
    await expect(page.locator("#login-user-alias")).toBeVisible();
    await expect(page.locator("#login-password")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Text note" })).toBeHidden();
  });
});
