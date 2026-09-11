declare module "@novnc/novnc/lib/rfb" {
  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, channel: object);
    scaleViewport: boolean;
    resizeSession: boolean;
    viewOnly: boolean;
    qualityLevel: number;
    compressionLevel: number;
    disconnect(): void;
  }
}
