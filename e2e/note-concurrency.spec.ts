import { test, expect } from "./fixtures/test-base";

test.describe(
  "Note Concurrency E2E (Risk #3 & #7: Multi-User Conflict Handling)",
  () => {
    test("conflicting save warns without destroying draft and reload recovers latest version", async ({
      page,
      browser,
      createTestDashboard,
      loginToDashboard,
    }) => {
      test.setTimeout(120000);

      const timestamp = Date.now();
      const aliceAlias = "Alice";
      const bobAlias = "Bob";
      const noteTitle = `Concurrency Note ${timestamp}`;

      // -------------------------------------------------------------
      // Step 1: Create dashboard with Alice and Bob
      // -------------------------------------------------------------
      const dashboard = await createTestDashboard({
        title: `Concurrency Workspace ${timestamp}`,
        description: "Dual-context note concurrency verification workspace",
        alias: aliceAlias,
        additionalParticipants: [{ alias: bobAlias }],
      });

      const bob = dashboard.participants.find(
        (participant) => participant.alias === bobAlias,
      );
      expect(bob).toBeTruthy();
      expect(bob?.password.length).toBeGreaterThanOrEqual(16);

      // -------------------------------------------------------------
      // Step 2: Alice logs in and creates note v1
      // -------------------------------------------------------------
      await loginToDashboard(dashboard.hash, dashboard.alias, dashboard.password);

      await expect(
        page.getByRole("heading", { name: "No notes yet" }),
      ).toBeVisible();

      await page.locator("#header-create-note-btn").click();
      await page.waitForURL(`**/dashboard/${dashboard.hash}/note/new`);
      await page.getByRole("textbox", { name: "Note title" }).fill(noteTitle);
      await page
        .getByRole("textbox", { name: "Note content" })
        .fill("Initial shared content");

      const aliceSaveBtn = page.getByRole("button", { name: "Save note" });
      await expect(aliceSaveBtn).toBeEnabled();
      await aliceSaveBtn.click();

      await page.waitForURL(
        new RegExp(`/dashboard/${dashboard.hash}/note/[0-9a-fA-F-]{36}$`),
      );
      const noteUrl = page.url();
      const noteId = noteUrl.split("/note/")[1]?.split("?")[0]?.trim();
      expect(noteId).toBeTruthy();
      await expect(page.getByText("v1")).toBeVisible();

      // -------------------------------------------------------------
      // Step 3: Bob logs in via an isolated browser context
      // (session cookies are scoped per dashboard hash, so a second
      // context is required to keep Alice's session intact)
      // -------------------------------------------------------------
      const bobContext = await browser.newContext();
      const bobPage = await bobContext.newPage();

      await bobPage.goto(`/dashboard/${dashboard.hash}`);
      await bobPage.locator("#login-user-alias").fill(bobAlias);
      await bobPage.locator("#login-password").fill(bob!.password);
      await bobPage.getByRole("button", { name: "Sign In" }).click();
      await expect(bobPage.locator("#login-user-alias")).toBeHidden();
      await expect(bobPage.locator("#dashboard-logout-btn")).toBeVisible();

      await bobPage.goto(`/dashboard/${dashboard.hash}/note/${noteId}`);
      await expect(bobPage.getByText("v1")).toBeVisible();

      // -------------------------------------------------------------
      // Step 4: Alice saves v2 while Bob still holds stale v1
      // -------------------------------------------------------------
      await page
        .getByRole("textbox", { name: "Note content" })
        .fill("Alice version 2");
      await aliceSaveBtn.click();
      await expect(page.getByText("v2")).toBeVisible();

      // -------------------------------------------------------------
      // Step 5: Bob's stale save is rejected; draft is preserved
      // -------------------------------------------------------------
      const bobContent = bobPage.getByRole("textbox", { name: "Note content" });
      await bobContent.fill("Bob conflicting draft");

      const bobSaveBtn = bobPage.getByRole("button", { name: "Save note" });
      await expect(bobSaveBtn).toBeEnabled();
      await bobSaveBtn.click();

      const conflictAlert = bobPage
        .getByRole("alert")
        .filter({
          hasText:
            "This note has been modified by someone else. Please reload and try again.",
        });
      await expect(conflictAlert).toBeVisible();

      // Alice's content must not be overwritten server-side, and Bob's
      // unsaved draft must remain in his textarea before he reloads.
      await expect(bobContent).toHaveValue("Bob conflicting draft");
      await expect(page.getByText("v2")).toBeVisible();

      // -------------------------------------------------------------
      // Step 6: Bob reloads and receives Alice's v2 server state
      // -------------------------------------------------------------
      await conflictAlert.getByRole("button", { name: "Reload" }).click();

      await expect(bobPage.getByText("v2")).toBeVisible();
      await expect(bobContent).toHaveValue("Alice version 2");
      await expect(conflictAlert).toBeHidden();

      // -------------------------------------------------------------
      // Step 7: Bob's clean follow-up edit saves as v3
      // -------------------------------------------------------------
      await bobContent.fill("Bob follow-up version 3");
      await expect(bobSaveBtn).toBeEnabled();
      await bobSaveBtn.click();

      await expect(bobPage.getByText("v3")).toBeVisible();
      await expect(bobContent).toHaveValue("Bob follow-up version 3");

      await bobContext.close();
    });
  },
);
