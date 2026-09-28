import { getAgentTunnelUrl } from "@/features/runtime/tunnel-url";

export function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function buildDeviceInstallCommand(token: string) {
  const endpoint = new URL(getAgentTunnelUrl("setup"));
  endpoint.protocol = endpoint.protocol === "ws:" ? "http:" : "https:";
  if (endpoint.username || endpoint.password)
    throw new Error("The public API origin must not contain credentials.");
  const origin = endpoint.origin;
  // pipefail makes a failed download fail the step even if bash receives no
  // script. Keep registration/setup variables on the paxd step only.
  const paxlScript =
    'curl -fsSL --max-redirs 1 "$PAXL_DOWNLOAD_URL/api/v1/public/paxl/install.sh" | bash';
  const paxdScript =
    'curl -fsSL --max-redirs 1 "$PAX_DOWNLOAD_URL/api/v1/public/paxd/install.sh" | bash';
  return `PAXL_DOWNLOAD_URL=${shellQuote(origin)} bash -o pipefail -c ${shellQuote(paxlScript)} && PAX_DOWNLOAD_URL=${shellQuote(origin)} PAX_CLOUD_URL=${shellQuote(origin)} PAX_SETUP_AFTER_INSTALL=1 PAX_REGISTRATION_TOKEN=${shellQuote(token)} bash -o pipefail -c ${shellQuote(paxdScript)}`;
}
