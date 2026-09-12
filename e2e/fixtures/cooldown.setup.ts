import { test as setup } from "@playwright/test";

/**
 * Structural delay between browser projects (chromium → firefox).
 *
 * The in-memory `sessionVerifyIp` sliding window (60 req / 60s) accumulates
 * hits from all browser instances sharing `127.0.0.1`. A 65-second pause lets
 * every chromium timestamp age out of the window so firefox starts with a
 * full 60-token budget. No rate limiter code changes, no bypass, no exposed
 * reset endpoints — just a clean structural gap.
 */
setup("rate limit sliding window cooldown", async () => {
  const COOLDOWN_MS = 65_000;
  setup.setTimeout(COOLDOWN_MS + 5_000);
  await new Promise((resolve) => setTimeout(resolve, COOLDOWN_MS));
});
