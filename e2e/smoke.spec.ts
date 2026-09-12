import { test, expect } from "./fixtures/test-base";

test.describe("Smoke Test", () => {
  test("loads the landing page and verifies brand title and CTA", async ({
    page,
  }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    // Verify main brand title
    await expect(
      page.getByRole("heading", { name: "Scytala", level: 1 }),
    ).toBeVisible();

    // Verify 'Get Started' link pointing to /new
    const getStartedLink = page.locator("#get-started-link");
    await expect(getStartedLink).toBeVisible();
    await expect(getStartedLink).toHaveAttribute("href", "/new");
  });

  test("navigates to /new and renders wizard details step", async ({
    page,
  }) => {
    const response = await page.goto("/new");
    expect(response?.status()).toBe(200);

    await expect(
      page.getByRole("heading", { name: "Dashboard Details" }),
    ).toBeVisible();
    await expect(page.locator("#dashboard-title-input")).toBeVisible();
    await expect(page.locator("#wizard-next-btn")).toBeVisible();
  });
});
