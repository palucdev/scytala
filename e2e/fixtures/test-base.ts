/* eslint-disable react-hooks/rules-of-hooks */
import { test as base, expect } from "@playwright/test";

export interface TestDashboardInfo {
  hash: string;
  title: string;
  alias: string;
  password: string;
  shareableUrl: string;
}

export interface CreateTestDashboardOptions {
  title?: string;
  description?: string;
  alias?: string;
  password?: string;
}

export interface TestFixtures {
  clipboard: {
    readText: () => Promise<string>;
    writeText: (text: string) => Promise<void>;
  };
  createTestDashboard: (
    options?: CreateTestDashboardOptions,
  ) => Promise<TestDashboardInfo>;
  loginToDashboard: (
    hash: string,
    alias: string,
    password: string,
  ) => Promise<void>;
}

import { createClient } from "@supabase/supabase-js";

export async function clearRateLimits(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (url && key) {
    try {
      const supabase = createClient(url, key);
      await supabase.from("rate_limits").delete().neq("key", "");
    } catch {
      // Ignore in mock or offline runs
    }
  }
}

export const test = base.extend<TestFixtures & { _rateLimitReset: void }>({
  _rateLimitReset: [
    async ({}, use) => {
      await clearRateLimits();
      await use();
    },
    { auto: true },
  ],
  clipboard: async ({ page, context }, use) => {
    try {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    } catch {
      // Ignored for browsers that do not support permissions API (e.g. Firefox)
    }

    await use({
      readText: async () => {
        return page.evaluate(() => navigator.clipboard.readText());
      },
      writeText: async (text: string) => {
        return page.evaluate((t) => navigator.clipboard.writeText(t), text);
      },
    });
  },

  createTestDashboard: async ({ page, context }, use) => {
    try {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    } catch {
      // Ignored for browsers that do not support permissions API
    }

    const helper = async (
      options?: CreateTestDashboardOptions,
    ): Promise<TestDashboardInfo> => {
      const title = options?.title ?? `E2E Workspace ${Date.now()}`;
      const description =
        options?.description ?? "End-to-end automated test workspace";
      const alias = options?.alias ?? "Alice";

      // Step 1: Details
      await page.goto("/new");
      await page.locator("#dashboard-title-input").fill(title);
      await page.locator("#dashboard-description-input").fill(description);
      await page.locator("#wizard-next-btn").click();

      // Step 2: Participants
      const addFirstBtn = page.locator("#add-first-participant-btn");
      if (await addFirstBtn.isVisible()) {
        await addFirstBtn.click();
      }

      const aliasInput = page.locator('input[aria-label="Participant 1 Alias"]');
      await aliasInput.waitFor({ state: "visible" });
      await aliasInput.fill(alias);

      const passwordInput = page.locator(
        'input[aria-label="Participant 1 Password"]',
      );
      if (options?.password) {
        await passwordInput.fill(options.password);
      }
      const password = await passwordInput.inputValue();

      await page.locator("#wizard-next-btn").click();

      // Step 3: Review
      await page.locator("#wizard-create-btn").click();

      // Step 4: Success
      await expect(page.locator("#wizard-success-alert")).toBeVisible();
      const shareableUrlInput = page.locator("#shareable-url-input");
      await expect(shareableUrlInput).toBeVisible();
      const shareableUrl = await shareableUrlInput.inputValue();
      const hash = shareableUrl.split("/dashboard/")[1]?.trim() || "";

      return {
        hash,
        title,
        alias,
        password,
        shareableUrl,
      };
    };

    await use(helper);
  },

  loginToDashboard: async ({ page }, use) => {
    const helper = async (
      hash: string,
      alias: string,
      password: string,
    ): Promise<void> => {
      await page.goto(`/dashboard/${hash}`);
      await page.locator("#login-user-alias").fill(alias);
      await page.locator("#login-password").fill(password);
      await page.getByRole("button", { name: "Sign In" }).click();

      // Wait for router.refresh() transition from LoginForm to DashboardView
      await expect(page.locator("#login-user-alias")).toBeHidden();
      await expect(page.locator("#dashboard-logout-btn")).toBeVisible();
    };

    await use(helper);
  },
});

export { expect };
