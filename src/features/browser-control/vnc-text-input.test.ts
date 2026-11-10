import { expect, it, vi } from "vitest";
import { MAX_VNC_TEXT_LENGTH, sendVNCText } from "./vnc-text-input";

it("forwards composed Unicode, case, symbols, line breaks and tabs without converting to keys", async () => {
  const send = vi.fn().mockResolvedValue(undefined);
  const text = "aA!@é你好😀\r\n\t";
  await sendVNCText(text, send);
  expect(send).toHaveBeenCalledExactlyOnceWith(text);
});

it("counts Unicode code points and rejects oversized pastes before sending", async () => {
  const send = vi.fn().mockResolvedValue(undefined);
  await expect(
    sendVNCText("a".repeat(MAX_VNC_TEXT_LENGTH + 1), send),
  ).rejects.toThrow();
  expect(send).not.toHaveBeenCalled();
  await sendVNCText("😀".repeat(MAX_VNC_TEXT_LENGTH), send);
  expect(send).toHaveBeenCalledOnce();
});

it("propagates an ambiguous failure without replaying the paste", async () => {
  const send = vi.fn().mockRejectedValue(Error("Lost acknowledgement"));
  await expect(sendVNCText("private text", send)).rejects.toThrow(
    "Lost acknowledgement",
  );
  expect(send).toHaveBeenCalledOnce();
});
