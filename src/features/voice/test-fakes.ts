// Test doubles for voice input. Not imported by application code.
import type { StartMicrophone } from "./microphone";

export class FakeVoiceSocket {
  readyState = 0;
  binaryType = "blob";
  sent: (string | ArrayBuffer)[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(readonly url: string) {}

  send(data: string | ArrayBuffer) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
  }

  open() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  receive(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent);
  }

  drop() {
    this.readyState = 3;
    this.onclose?.({} as CloseEvent);
  }

  json() {
    return this.sent
      .filter((data): data is string => typeof data === "string")
      .map((data) => JSON.parse(data));
  }

  audio() {
    return this.sent
      .filter((data): data is ArrayBuffer => typeof data !== "string")
      .map((data) => [...new Int16Array(data)]);
  }
}

export function fakeVoiceTransport(sampleRate = 16_000) {
  const sockets: FakeVoiceSocket[] = [];
  let feed: (samples: Float32Array) => void = () => undefined;
  const stops: number[] = [];
  const startMicrophone: StartMicrophone = async (onSamples) => {
    feed = onSamples;
    return { sampleRate, stop: () => stops.push(Date.now()) };
  };
  return {
    sockets,
    stops,
    feed: (samples: number[]) => feed(Float32Array.from(samples)),
    options: {
      createSocket: (url: string) => {
        const socket = new FakeVoiceSocket(url);
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
      startMicrophone,
    },
  };
}
