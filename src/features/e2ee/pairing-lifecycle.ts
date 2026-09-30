import { ApiError } from "@/features/api/errors";
import { savePendingPairing, type PendingPairing } from "./device-key-store";
import {
  browserPairingInstructions,
  finishBrowserPairing,
  getE2EEPairingStatus,
  PairingPackageMismatchError,
  type BrowserPairingInstructions,
} from "./key-distribution";

export type BrowserPairingState = {
  phase: "pending" | "unconfirmed" | "expired" | "superseded" | "ready";
  pending: PendingPairing;
  instructions?: BrowserPairingInstructions;
  message?: string;
};

export function pairingDeadline(pending: PendingPairing) {
  // Legacy and ambiguous creations lack the server deadline. This bounds
  // automatic retries, not the lifetime of an already approved key package.
  return pending.expiresAt
    ? Date.parse(pending.expiresAt)
    : Date.parse(pending.createdAt) + 10 * 60_000;
}

export async function inspectBrowserPairing(
  userId: string,
  pending: PendingPairing,
): Promise<BrowserPairingState> {
  let mismatchedPackage = false;
  try {
    await finishBrowserPairing(userId, pending.agentId, pending.pairingId);
    return { phase: "ready", pending };
  } catch (error) {
    mismatchedPackage = error instanceof PairingPackageMismatchError;
    if (
      !mismatchedPackage &&
      !(error instanceof ApiError && error.status === 404)
    ) {
      return uncertain(
        pending,
        "Could not retrieve encryption access. Check again or create a new request; recovery data is preserved.",
      );
    }
  }

  try {
    const request = await getE2EEPairingStatus(
      userId,
      pending.agentId,
      pending.pairingId,
    );
    if (request.status === "pending") {
      const confirmed = { ...pending, expiresAt: request.expires_at };
      if (confirmed.expiresAt !== pending.expiresAt)
        await savePendingPairing(confirmed);
      return {
        phase: "pending",
        pending: confirmed,
        instructions: browserPairingInstructions(confirmed),
      };
    }
    if (request.status === "approved") {
      // The package slot may have been replaced by a later approved request.
      if (mismatchedPackage) return terminal(pending, "superseded");
      return uncertain(
        pending,
        "Access was approved, but the key package could not be retrieved. Check again or create a new request.",
      );
    }
    if (request.status === "expired" || request.status === "superseded") {
      return terminal(pending, request.status);
    }
    return uncertain(
      pending,
      "Could not confirm the request status. Check again or create a new request.",
    );
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 404 &&
      pairingDeadline(pending) <= Date.now()
    ) {
      return terminal(pending, "expired");
    }
    // Do not infer approval failure from network/auth errors or a 404: the POST
    // may still be in flight. Bound polling and allow a fresh request instead.
    return uncertain(
      pending,
      "Could not confirm the request status. Check again or create a new request; recovery data is preserved.",
    );
  }
}

function uncertain(
  pending: PendingPairing,
  message: string,
): BrowserPairingState {
  return { phase: "unconfirmed", pending, message };
}

function terminal(
  pending: PendingPairing,
  phase: "expired" | "superseded",
): BrowserPairingState {
  return {
    phase,
    pending,
    message:
      phase === "expired"
        ? "This pairing request expired. Create a new request to continue."
        : "This pairing request was replaced. Use the latest request or create a new one.",
  };
}
