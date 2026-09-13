/* eslint-disable react-hooks/rules-of-hooks */
import { test as base, expect } from "@playwright/test";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  truncateSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

export interface TestDashboardParticipant {
  alias: string;
  password: string;
}

export interface TestDashboardInfo {
  hash: string;
  title: string;
  alias: string;
  password: string;
  shareableUrl: string;
  participants: TestDashboardParticipant[];
}

export interface CreateTestDashboardOptions {
  title?: string;
  description?: string;
  alias?: string;
  password?: string;
  additionalParticipants?: { alias: string; password?: string }[];
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

let testIpCounter = 0;

/**
 * Unique loopback-independent client IP per test.
 *
 * The in-memory `sessionVerifyIp` sliding window (60 req / 60s) lives in the
 * dev-server process and is keyed on the client IP. Without isolation every
 * test shares `127.0.0.1`, so consecutive tests drain the same bucket and
 * would need long cooldowns. Assigning a synthetic `x-forwarded-for` IP per
 * test gives each one a private bucket. In production Cloudflare sets
 * `cf-connecting-ip`, which takes precedence, so client-supplied
 * `x-forwarded-for` cannot bypass IP limiting outside tests.
 */
function nextTestIp(): string {
  testIpCounter += 1;
  const hi = Math.floor(testIpCounter / 250) + 1;
  const lo = (testIpCounter % 250) + 1;
  return `10.240.${hi}.${lo}`;
}

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

function isLocalSupabaseUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname === "host.docker.internal"
    );
  } catch {
    return false;
  }
}

/**
 * Dashboard hashes visited/created during this run (fixture + navigation
 * hook). `cleanupE2ENotes` scopes its deletion to the notes of exactly these
 * dashboards so pre-existing local data is never touched.
 *
 * Test workers and the global teardown run in separate Node processes, so the
 * registry is also mirrored to an NDJSON file (NDJSON appends are
 * crash-friendly across parallel workers); teardown merges it back in.
 */
const createdDashboardHashes = new Set<string>();

const registryPath = resolve(
  process.env.E2E_DASHBOARD_REGISTRY ??
    "test-results/e2e-created-dashboards.jsonl",
);

function appendRegistryFile(hash: string): void {
  try {
    mkdirSync(dirname(registryPath), { recursive: true });
    appendFileSync(registryPath, `${hash}\n`, "utf-8");
  } catch {
    // Registry persistence is best-effort; in-memory set still covers the
    // common (single-process) case.
  }
}

export function registerCreatedDashboard(hash: string): void {
  if (!hash || createdDashboardHashes.has(hash)) {
    return;
  }
  createdDashboardHashes.add(hash);
  appendRegistryFile(hash);
}

function readRegistryFile(): string[] {
  try {
    return existsSync(registryPath)
      ? readFileSync(registryPath, "utf-8")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function truncateRegistryFile(): void {
  try {
    if (existsSync(registryPath)) {
      truncateSync(registryPath, 0);
    }
  } catch {
    // Best-effort; stale entries are idempotent next run.
  }
}

export async function cleanupE2ENotes(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (url && key && isLocalSupabaseUrl(url)) {
    try {
      const supabase = createClient(url, key);
      const hashes = [
        ...new Set([...createdDashboardHashes, ...readRegistryFile()]),
      ].filter(Boolean);
      if (hashes.length === 0) {
        return;
      }
      const { data, error: fetchError } = await supabase
        .from("dashboards")
        .select("id")
        .in("hash", hashes);
      if (fetchError) {
        console.warn("cleanupE2ENotes failed:", fetchError.message);
        return;
      }
      const dashboardIds = (data ?? []).map((row) => row.id);
      if (dashboardIds.length === 0) {
        return;
      }
      const { error, count: deletedCount } = await supabase
        .from("notes")
        .delete({ count: "exact" })
        .in("dashboard_id", dashboardIds);
      if (error) {
        console.warn("cleanupE2ENotes failed:", error.message);
      } else if (deletedCount === 0) {
        console.warn(
          "cleanupE2ENotes: registered dashboards had no matching notes (possibly stale registry)",
        );
      }
      if (error) {
        console.warn("cleanupE2ENotes failed:", error.message);
      } else {
        truncateRegistryFile();
      }
    } catch {
      // Ignore in mock or offline runs
    }
  }
}

export const test = base.extend<
  TestFixtures & { _rateLimitReset: void; _rateLimitIpIsolation: void }
>({
  /**
   * Rewrites `x-forwarded-for` to a unique synthetic IP for every outgoing
   * request of this test, so the dev-server's in-memory IP rate limiters
   * (`sessionVerifyIp`, `authIp`) see a fresh bucket per test and no cooldown
   * sleeps are needed.
   */
  _rateLimitIpIsolation: [
    async ({ context }, use) => {
      const ip = nextTestIp();
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        const dashboardMatch = url.pathname.match(/^\/dashboard\/([^/]+)/);
        if (dashboardMatch && dashboardMatch[1] !== "new") {
          registerCreatedDashboard(decodeURIComponent(dashboardMatch[1]));
        }
        const headers = route.request().headers();
        headers["x-forwarded-for"] = ip;
        return route.continue({ headers });
      });
      await use();
    },
    { auto: true },
  ],
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

      const additionalParticipants = options?.additionalParticipants ?? [];
      for (const [offset, participant] of additionalParticipants.entries()) {
        await page.locator("#add-participant-btn").click();

        const participantNumber = offset + 2;
        const extraAliasInput = page.locator(
          `input[aria-label="Participant ${participantNumber} Alias"]`,
        );
        await extraAliasInput.waitFor({ state: "visible" });
        await extraAliasInput.fill(participant.alias);

        const extraPasswordInput = page.locator(
          `input[aria-label="Participant ${participantNumber} Password"]`,
        );
        if (participant.password) {
          await extraPasswordInput.fill(participant.password);
        }
      }

      await page.locator("#wizard-next-btn").click();

      // Step 3: Review
      await page.locator("#wizard-create-btn").click();

      // Step 4: Success
      await expect(page.locator("#wizard-success-alert")).toBeVisible();
      const shareableUrlInput = page.locator("#shareable-url-input");
      await expect(shareableUrlInput).toBeVisible();
      const shareableUrl = await shareableUrlInput.inputValue();
      const hash = shareableUrl.split("/dashboard/")[1]?.trim() || "";
      registerCreatedDashboard(hash);

      const participants: TestDashboardParticipant[] = [
        { alias, password },
      ];
      for (const participant of additionalParticipants) {
        if (participant.password) {
          participants.push({
            alias: participant.alias,
            password: participant.password,
          });
          continue;
        }
        const credentialRow = page
          .getByRole("button", {
            name: `Copy credentials for ${participant.alias}`,
          })
          .locator("..");
        const passwordText =
          (await credentialRow.locator(".credential-password").textContent()) ??
          "";
        participants.push({ alias: participant.alias, password: passwordText });
      }

      return {
        hash,
        title,
        alias,
        password,
        shareableUrl,
        participants,
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
