/**
 * Writes text to the clipboard. Falls back to a hidden textarea and
 * `document.execCommand("copy")` when the async clipboard API is missing
 * (older browsers, insecure contexts). Resolves to whether the copy worked.
 */
export async function copyTextToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or unfocused document; try the legacy path.
    }
  }

  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  const previousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  try {
    textarea.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
    previousFocus?.focus();
  }
}
