import { getAgentTunnelUrl } from "@/features/runtime/tunnel-url";

export function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

// Hosted Console pages do not serve the public Manager installer endpoints.
const hostedManagerOrigins: Record<string, string> = {
  "https://paxworkspace.net": "https://api.paxworkspace.net",
  "https://stage.paxworkspace.net": "https://stage-api.paxworkspace.net",
  "https://ws.lakeward.net": "https://api.lakeward.net",
};

function installerScript(product: "paxl" | "paxd", variable: string) {
  // Buffer the entire response: a failed/partial download must never execute.
  return [
    `url="$${variable}/api/v1/public/${product}/install.sh"`,
    'script=$(curl -fsSL --max-redirs 1 "$url") || exit $?',
    'case "${script%%$\'\\n\'*}" in "#!/usr/bin/env bash"|"#!/bin/bash"|"#!/bin/sh") ;; *) printf "Expected a shell installer from %s; check the API URL or login redirect.\\n" "$url" >&2; exit 1 ;; esac',
    'bash <<< "$script"',
  ].join("; ");
}

export function buildDeviceInstallCommand(token = "") {
  const endpoint = new URL(getAgentTunnelUrl("setup"));
  endpoint.protocol = endpoint.protocol === "ws:" ? "http:" : "https:";
  if (endpoint.username || endpoint.password)
    throw new Error("The public API origin must not contain credentials.");
  const origin = hostedManagerOrigins[endpoint.origin] ?? endpoint.origin;
  const paxdScript = installerScript("paxd", "PAX_DOWNLOAD_URL");
  // Setup installs both paxl and paxd. Explicitly clear an inherited token for
  // browser sign-in so that choice cannot silently register another account.
  return `PAX_DOWNLOAD_URL=${shellQuote(origin)} PAX_CLOUD_URL=${shellQuote(origin)} PAX_SETUP_AFTER_INSTALL=1 PAX_REGISTRATION_TOKEN=${shellQuote(token)} bash -o pipefail -c ${shellQuote(paxdScript)}`;
}
