import * as operations from "./short-code-crypto";
self.onmessage = async (
  event: MessageEvent<{
    id: number;
    operation: keyof typeof operations;
    args: unknown[];
  }>,
) => {
  const { id, operation, args } = event.data;
  try {
    const call = operations[operation] as (
      ...input: unknown[]
    ) => Promise<unknown>;
    if (typeof call !== "function")
      throw new Error("Unknown cryptographic operation");
    self.postMessage({ id, value: await call(...args) });
  } catch {
    // Never serialize library exceptions containing protocol inputs or secrets.
    self.postMessage({ id, error: "Pairing handshake failed" });
  }
};
