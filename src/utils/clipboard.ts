/**
 * Copies text to the clipboard using the Clipboard API.
 * Returns true on success, false on failure.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return false;
  } catch (err) {
    console.error("Failed to copy to clipboard:", err);
    return false;
  }
}
