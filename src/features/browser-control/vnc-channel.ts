import { browserControl } from "./api";

type Reply = { id?: string; data?: string };
// noVNC raw-channel adapter. One in-flight exchange, bounded buffers and no
// retransmission: an ambiguous response closes the stream instead of replaying input.
export class VNCChannel {
  binaryType = "arraybuffer";
  protocol = "";
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose:
    | ((event: { code: number; reason: string; wasClean: boolean }) => void)
    | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: ArrayBuffer }) => void) | null = null;
  private id = "";
  private seq = 0;
  private outgoing: number[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  constructor(
    private userId: string,
    private nodeId: string,
  ) {}
  async connect() {
    try {
      const result = await browserControl<Reply>(
        this.userId,
        this.nodeId,
        "vnc_open",
      );
      this.id = result.id ?? "";
      if (this.readyState === 3) {
        this.drop();
        return;
      }
      if (!this.id) throw Error("VNC connection missing");
      this.readyState = 1;
      this.onopen?.();
      this.deliver(result.data);
      void this.exchange();
    } catch {
      this.onerror?.();
      this.close();
    }
  }
  send(data: Uint8Array) {
    if (this.readyState !== 1) return;
    if (this.outgoing.length + data.byteLength > 64 * 1024) {
      this.close();
      return;
    }
    // Copy immediately; noVNC reuses its send buffer after this call.
    for (const byte of data) this.outgoing.push(byte);
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    clearTimeout(this.timer);
    this.outgoing = [];
    this.drop();
    this.onclose?.({ code: 1000, reason: "Viewer closed", wasClean: true });
  }
  private drop() {
    if (this.id) {
      void browserControl(this.userId, this.nodeId, "vnc_close", {
        id: this.id,
      }).catch(() => {});
      this.id = "";
    }
  }
  private deliver(data?: string) {
    if (!data || this.readyState !== 1) return;
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    this.onmessage?.({ data: bytes.buffer });
  }
  private async exchange() {
    if (this.readyState !== 1) return;
    try {
      const data = this.outgoing.splice(0, 8192);
      const response = await browserControl<Reply>(
        this.userId,
        this.nodeId,
        "vnc_exchange",
        {
          id: this.id,
          seq: this.seq++,
          data: btoa(String.fromCharCode(...data)),
        },
      );
      this.deliver(response.data);
      if (this.readyState === 1)
        this.timer = setTimeout(
          () => void this.exchange(),
          response.data || this.outgoing.length ? 0 : 100,
        );
    } catch {
      this.onerror?.();
      this.close();
    }
  }
}
