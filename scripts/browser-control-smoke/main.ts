import RFB from "@novnc/novnc/lib/rfb";
import { VNCChannel } from "../../src/features/browser-control/vnc-channel";
const channel = new VNCChannel("fixture", "fixture");
const rfb = new RFB(document.getElementById("screen")!, channel);
rfb.viewOnly = true;
rfb.scaleViewport = true;
rfb.qualityLevel = 5;
rfb.compressionLevel = 6;
rfb.addEventListener(
  "connect",
  () => (document.getElementById("status")!.textContent = "Connected"),
);
rfb.addEventListener(
  "disconnect",
  () => (document.getElementById("status")!.textContent = "Disconnected"),
);
void channel.connect();
