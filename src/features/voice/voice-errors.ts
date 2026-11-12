export class VoiceInputError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "VoiceInputError";
  }
}

const serverMessages: Record<string, string> = {
  bad_request: "Voice input sent an invalid request",
  provider_unavailable: "Speech recognition is unavailable right now",
  provider_failed: "Speech recognition stopped unexpectedly",
  timeout: "Speech recognition did not finish in time",
};

export function serverVoiceError(code: string) {
  return new VoiceInputError(
    code || "provider_failed",
    serverMessages[code] ?? "Speech recognition failed",
  );
}
