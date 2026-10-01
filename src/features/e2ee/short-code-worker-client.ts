import type * as Operations from "./short-code-crypto";

type OperationsType = typeof Operations;
export class ShortCodeCrypto {
  private worker = new Worker(
    new URL("./short-code.worker.ts", import.meta.url),
    { type: "module" },
  );
  private serial = 0;
  private closed = false;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  constructor() {
    this.worker.onmessage = (event) => {
      const entry = this.pending.get(event.data.id);
      this.pending.delete(event.data.id);
      if (!entry) return;
      if (event.data.error) entry.reject(new Error("Pairing handshake failed"));
      else entry.resolve(event.data.value);
    };
    this.worker.onerror = () => this.close();
  }
  call<K extends keyof OperationsType>(
    operation: K,
    ...args: Parameters<OperationsType[K]>
  ): Promise<Awaited<ReturnType<OperationsType[K]>>> {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new Error("Pairing operation cancelled"));
        return;
      }
      const id = ++this.serial;
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      this.worker.postMessage({ id, operation, args });
    });
  }
  close() {
    this.closed = true;
    this.worker.terminate();
    for (const entry of this.pending.values())
      entry.reject(new Error("Pairing operation cancelled"));
    this.pending.clear();
  }
}
