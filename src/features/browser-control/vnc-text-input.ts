// Keep the transient desktop paste bounded. Count code points so supplementary
// characters such as emoji are treated as a single character.
export const MAX_VNC_TEXT_LENGTH = 2000;

export async function sendVNCText(
  text: string,
  sendText: (text: string) => Promise<void>,
) {
  if (Array.from(text).length > MAX_VNC_TEXT_LENGTH)
    throw Error("Text is too long");
  // Preserve the composed text exactly. Character-to-keycode conversion loses
  // Unicode on fresh X11 mappings; an uncertain paste must never be retried.
  await sendText(text);
}
