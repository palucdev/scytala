import { test, expect } from "./fixtures/test-base";

test.describe("Note Lifecycle & Deletion Security (Risk #3: Cryptographic Integrity & Concurrency)", () => {
  test("note deletion requires re-authentication, rejects invalid password, and purges on correct password", async ({
    page,
    createTestDashboard,
    loginToDashboard,
  }) => {
    test.setTimeout(120000);

    const timestamp = Date.now();
    const workspaceTitle = `Lifecycle Workspace ${timestamp}`;
    const userAlias = "Bob";
    const userPassword = "Password!987654321#";
    const noteTitle = `Lifecycle Deletion Note ${timestamp}`;
    const noteContent = "This note will be safely deleted after re-authentication verification.";

    // -------------------------------------------------------------
    // Step 1: Create Dashboard & Authenticate
    // -------------------------------------------------------------
    const dashboard = await createTestDashboard({
      title: workspaceTitle,
      alias: userAlias,
      password: userPassword,
    });

    await loginToDashboard(dashboard.hash, userAlias, userPassword);

    await expect(page.getByText(userAlias)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "No notes yet" }),
    ).toBeVisible();

    // -------------------------------------------------------------
    // Step 2: Author and Save a Note
    // -------------------------------------------------------------
    const createNoteBtn = page.locator("#header-create-note-btn");
    await expect(createNoteBtn).toBeVisible();
    await createNoteBtn.click();

    await page.waitForURL(`**/dashboard/${dashboard.hash}/note/new`);
    await expect(
      page.getByRole("heading", { name: "Text note" }),
    ).toBeVisible();

    await page.getByRole("textbox", { name: "Note title" }).fill(noteTitle);
    await page.getByRole("textbox", { name: "Note content" }).fill(noteContent);

    const saveBtn = page.getByRole("button", { name: "Save note" });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    await page.waitForURL(
      new RegExp(`/dashboard/${dashboard.hash}/note/[0-9a-fA-F-]{36}$`),
    );
    await expect(page.getByText("v1")).toBeVisible();

    // Return to dashboard
    await page.getByRole("link", { name: "Back" }).click();
    await page.waitForURL(`**/dashboard/${dashboard.hash}`);

    // Verify note tile exists
    await expect(
      page.getByRole("heading", { name: noteTitle, level: 2 }),
    ).toBeVisible();

    // -------------------------------------------------------------
    // Step 3: Open Note Editor
    // -------------------------------------------------------------
    await page.getByRole("link", { name: `Open note: ${noteTitle}` }).click();
    await page.waitForURL(`**/dashboard/${dashboard.hash}/note/*`);

    // -------------------------------------------------------------
    // Step 4: Open Delete Dialog & Attempt with Invalid Password
    // -------------------------------------------------------------
    const deleteBtn = page.getByRole("button", { name: "Delete note" });
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    const deleteDialog = page.getByRole("dialog");
    await expect(deleteDialog).toBeVisible();
    await expect(
      deleteDialog.getByRole("heading", { name: "Delete Note" }),
    ).toBeVisible();

    const passwordInput = deleteDialog.locator("#delete-note-password-input");
    await expect(passwordInput).toBeVisible();
    await passwordInput.fill("IncorrectPassword123!");

    const confirmDeleteBtn = deleteDialog.getByRole("button", { name: "Delete" });
    await expect(confirmDeleteBtn).toBeEnabled();
    await confirmDeleteBtn.click();

    // Assert re-authentication failure alert
    const errorAlert = deleteDialog.getByRole("alert");
    await expect(errorAlert).toBeVisible();
    await expect(deleteDialog).toBeVisible();

    // -------------------------------------------------------------
    // Step 5: Submit Correct Password & Assert Deletion
    // -------------------------------------------------------------
    await passwordInput.fill(userPassword);
    await expect(confirmDeleteBtn).toBeEnabled();
    await confirmDeleteBtn.click();

    // Dialog should close and page should redirect back to dashboard
    await expect(deleteDialog).toBeHidden();
    await page.waitForURL(`**/dashboard/${dashboard.hash}`);

    // Verify empty state is rendered and deleted note is gone
    await expect(
      page.getByRole("heading", { name: "No notes yet" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: noteTitle, level: 2 }),
    ).toBeHidden();
  });
});
