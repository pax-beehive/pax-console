export type ToolCallOutputMode = "append" | "replace";

export type ToolCallOutputUpdate = {
  mode: ToolCallOutputMode;
  value: unknown;
};

export function extractToolCallOutputUpdate(
  frame: unknown,
): ToolCallOutputUpdate | undefined {
  const record = asRecord(frame);
  const meta = asRecord(record?._meta);
  const terminalDelta =
    asRecord(meta?.terminal_output_delta) ??
    asRecord(meta?.terminalOutputDelta);
  const terminalData = terminalDelta?.data;

  if (typeof terminalData === "string") {
    return { mode: "append", value: terminalData };
  }

  return undefined;
}

export function mergeToolCallOutput(
  current: unknown,
  incoming: unknown,
  mode: ToolCallOutputMode = "replace",
) {
  if (incoming === undefined) {
    return current;
  }
  if (mode !== "append" || current === undefined) {
    return incoming;
  }

  const currentText = textFromToolPayload(current);
  const incomingText = textFromToolPayload(incoming);
  if (currentText === undefined || incomingText === undefined) {
    return incoming;
  }

  return `${currentText}${incomingText}`;
}

export function textFromToolPayload(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const text = value.map(textFromToolPayload).filter(Boolean).join("");
    return text || undefined;
  }

  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  for (const key of [
    "text",
    "output",
    "command",
    "description",
    "content",
    "result",
    "rawInput",
    "raw_input",
  ]) {
    const text = textFromToolPayload(record[key]);
    if (text) {
      return text;
    }
  }

  return undefined;
}

function asRecord(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}
