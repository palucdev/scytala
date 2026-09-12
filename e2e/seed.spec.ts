import { test, expect } from "./fixtures/test-base";

test.describe("E2E Seed Exemplar (Risk #4: Browser Workflow & Persistence)", () => {
  test("created workspace and initial note persist across session and reload", async ({
    page,
    createTestDashboard,
    loginToDashboard,
  }) => {
    const timestamp = Date.now();
    const workspaceTitle = `Seed Workspace ${timestamp}`;
    const noteTitle = `Seed Note ${timestamp}`;
    const noteContent = "Hello from seed test verification";

    // 1. Setup: Create dynamic test dashboard
    const dashboard = await createTestDashboard({
      title: workspaceTitle,
      alias: "SeedUser",
    });

    // 2. Action: Login to created dashboard
    await loginToDashboard(dashboard.hash, dashboard.alias, dashboard.password);

    // Assert dashboard view is visible with user alias
    await expect(page.getByText(dashboard.alias)).toBeVisible();

    // 3. Create a note
    const createNoteBtn = page.getByRole("link", { name: "Create note" });
    if (await createNoteBtn.isVisible()) {
      await createNoteBtn.click();
    } else {
      await page.goto(`/dashboard/${dashboard.hash}/note/new`);
    }

    await page.getByRole("textbox", { name: "Note title" }).fill(noteTitle);
    await page.getByRole("textbox", { name: "Note content" }).fill(noteContent);
    const saveBtn = page.getByRole("button", { name: "Save note" });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    await expect(saveBtn).toBeDisabled();

    // Return to dashboard
    await page.getByRole("link", { name: "Back" }).click();
    const leaveBtn = page.getByRole("button", { name: "Leave" });
    if (await leaveBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await leaveBtn.click();
    }
    await page.waitForURL(`**/dashboard/${dashboard.hash}`);

    // Re-open saved note from dashboard tile
    await page.getByRole("link", { name: `Open note: ${noteTitle}` }).click();
    await page.waitForURL(`**/dashboard/${dashboard.hash}/note/*`);

    // 4. Assert: Note title is visible in editor and survives reload
    await expect(
      page.getByRole("textbox", { name: "Note title" }),
    ).toHaveValue(noteTitle);

    await page.reload();
    await expect(
      page.getByRole("textbox", { name: "Note title" }),
    ).toHaveValue(noteTitle);
  });
});
