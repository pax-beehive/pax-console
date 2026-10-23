import { ApiError } from "@/features/api/errors";
import type { ArtifactFetchDenial } from "@/features/api/types";

export const E2EE_FETCH_UNAVAILABLE =
  "Fetching is unavailable for end-to-end encrypted sessions.";
export const NODE_OFFLINE_MESSAGE = "The agent's machine is offline.";

export function localFileDenialMessage(
  denial: Pick<ArtifactFetchDenial, "code" | "message">,
  path: string,
) {
  switch (denial.code) {
    case "hidden_path_denied":
      return "Hidden files and folders cannot be fetched.";
    case "credential_path_denied":
      return "This looks like a credential or key file and is never uploaded.";
    case "owner_only_denied":
      return `The file is readable only by its owner (for example 0600), which usually means it is private. To fetch it, run chmod 644 ${path} on that machine.`;
    case "not_found":
      return "The file does not exist on that machine. The agent may be running in a container where paths differ.";
    case "outside_home":
      return "Only files in the home directory can be fetched.";
    case "not_regular_file":
      return "Only regular files can be fetched, not folders, devices, or sockets.";
    case "permission_denied":
      return "The agent's machine does not allow reading this file.";
    case "too_large":
      return "The file is larger than 5 GiB and cannot be fetched.";
    case "invalid_path":
      return "This is not a valid absolute file path.";
    default:
      return denial.message || "This file cannot be fetched.";
  }
}

export function localFilePublicationFailureMessage(
  errorCode?: string,
  errorMessage?: string,
) {
  const detail = errorMessage?.trim();
  switch (errorCode) {
    case "secret_detected":
      return `A possible secret was found in this file${detail ? ` (${detail})` : ""}, so the upload was blocked.`;
    case "too_large":
      return "The file is larger than 5 GiB and cannot be fetched.";
    case "not_found":
      return "The file no longer exists on the agent's machine.";
    case "permission_denied":
      return "The agent's machine does not allow reading this file.";
    case "node_offline":
      return NODE_OFFLINE_MESSAGE;
    default:
      return detail
        ? `The upload failed: ${detail}`
        : "The upload failed. Try fetching the file again.";
  }
}

export function localFileFetchErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 503) {
      return NODE_OFFLINE_MESSAGE;
    }
    if (error.status === 409) {
      return E2EE_FETCH_UNAVAILABLE;
    }
    return `Couldn't reach the file fetch service (HTTP ${error.status}).`;
  }
  return "Couldn't reach the file fetch service. Try again.";
}
