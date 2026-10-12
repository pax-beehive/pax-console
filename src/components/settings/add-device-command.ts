export type DeviceSetup = { script_url: string; machine_url: string };

export function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function publicURL(value: string) {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new Error("Device setup requires a public HTTPS URL.");
  return url;
}

export function validateDeviceSetup(setup: DeviceSetup): DeviceSetup {
  publicURL(setup.script_url);
  const machine = publicURL(setup.machine_url);
  if (machine.pathname !== "/" || machine.search)
    throw new Error("Device setup requires a machine API origin.");
  return setup;
}

export function buildDeviceSetupCommand(setup: DeviceSetup, token = "") {
  validateDeviceSetup(setup);
  return `PAX_REGISTRATION_TOKEN=${shellQuote(token)} paxd setup --cloud-url ${shellQuote(setup.machine_url)}${token ? " --registration-token-env" : ""}`;
}

export function buildDeviceInstallCommand(setup: DeviceSetup, token = "") {
  validateDeviceSetup(setup);
  // Keep pipefail local to the pasted command and explicitly clear old tokens
  // for browser sign-in. Bootstrap logic belongs to the regional setup script.
  return `(set -o pipefail; curl -fsSL --max-redirs 1 ${shellQuote(setup.script_url)} |\n  PAX_REGISTRATION_TOKEN=${shellQuote(token)} bash)`;
}
