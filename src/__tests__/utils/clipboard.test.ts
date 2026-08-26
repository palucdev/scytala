import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { copyToClipboard } from "@/utils/clipboard";

describe("src/utils/clipboard", () => {
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      writable: true,
      configurable: true,
    });
  });

  it("returns true when writeText succeeds", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    const result = await copyToClipboard("sample text");
    expect(result).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith("sample text");
  });

  it("returns false and logs error when writeText rejects", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const writeTextMock = vi
      .fn()
      .mockRejectedValue(new Error("Permission denied"));

    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    const result = await copyToClipboard("sample text");
    expect(result).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to copy to clipboard:",
      expect.any(Error),
    );
  });

  it("returns false when clipboard API is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const result = await copyToClipboard("sample text");
    expect(result).toBe(false);
  });
});
