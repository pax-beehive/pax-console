export type PublicRuntimeConfig = {
  wsBaseUrl?: string;
  releaseId?: string;
  commitSha?: string;
};

export function publicRuntimeConfigFromEnv(
  env: Record<string, string | undefined>,
): PublicRuntimeConfig {
  const wsBaseUrl = env.PAX_RUNTIME_WS_BASE_URL?.trim() || undefined;
  if (wsBaseUrl) {
    const url = new URL(wsBaseUrl);
    if (
      !["ws:", "wss:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    ) {
      throw new Error("PAX_RUNTIME_WS_BASE_URL must be a WebSocket origin");
    }
  }
  return {
    wsBaseUrl,
    releaseId: env.PAX_RELEASE_ID,
    commitSha: env.PAX_COMMIT_SHA,
  };
}

export function serializePublicRuntimeConfig(config: PublicRuntimeConfig) {
  return `globalThis.__PAX_RUNTIME_CONFIG__=${JSON.stringify(config).replace(/</g, "\\u003c")};`;
}

export function getPublicRuntimeConfig(): PublicRuntimeConfig | undefined {
  return (
    globalThis as typeof globalThis & {
      __PAX_RUNTIME_CONFIG__?: PublicRuntimeConfig;
    }
  ).__PAX_RUNTIME_CONFIG__;
}
