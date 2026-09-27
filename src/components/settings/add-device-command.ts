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
  return `curl -fsSL --max-redirs 1 ${shellQuote(`${origin}/api/v1/public/paxd/install.sh`)} | PAX_DOWNLOAD_URL=${shellQuote(origin)} PAX_CLOUD_URL=${shellQuote(origin)} PAX_SETUP_AFTER_INSTALL=1 PAX_REGISTRATION_TOKEN=${shellQuote(token)} bash`;
}
