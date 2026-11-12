"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch, API_USER_SCOPE, userPath } from "@/features/api/client";
import { queryKeys } from "@/features/api/query-keys";

/** Voice input availability for the caller on their manager instance. */
export type VoiceConfig = {
  enabled: boolean;
  provider?: string;
  sample_rate?: number;
  encoding?: string;
  max_duration_seconds?: number;
};

export function useVoiceConfig(enabled = true) {
  return useQuery({
    queryKey: queryKeys.voiceConfig(),
    queryFn: () =>
      apiFetch<VoiceConfig>(userPath(API_USER_SCOPE, "/voice/config")),
    enabled,
    staleTime: 5 * 60_000,
    // A manager without the voice endpoint simply has voice input off.
    retry: false,
  });
}
