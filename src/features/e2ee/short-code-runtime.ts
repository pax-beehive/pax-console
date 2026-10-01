import { ApiError } from "@/features/api/errors";
import { type PendingPairing } from "./device-key-store";
import {
  type E2EEPairingRequest,
  listE2EEPairingRequests,
  approveBrowserPairing,
} from "./key-distribution";
import {
  encodePairingValue,
  decodePairingValue,
  pairingSecretCommitment,
} from "./pairing";
import { loadRootKey } from "./root-key-store";
import {
  codeGeneration,
  generationDeadline,
  normalizeShortCode,
  confirmationDeadline,
  SHORT_PAIRING_LIFETIME_MS,
} from "./short-code-policy";
import { ShortCodeCrypto } from "./short-code-worker-client";
import { relay, shortPairingPath, type ShortAttempt } from "./short-code-api";
import { reserveLocalAttempt, shortState } from "./short-code-state";

export function shortContext(
  userId: string,
  request: Pick<
    E2EEPairingRequest,
    | "pairing_id"
    | "agent_id"
    | "device_id"
    | "key_epoch"
    | "recipient_public_key"
  >,
  attempt: ShortAttempt,
) {
  return JSON.stringify([
    "pax/short-code/v2",
    userId,
    request.agent_id,
    request.pairing_id,
    request.device_id,
    request.key_epoch,
    request.recipient_public_key,
    attempt.attempt_id,
    attempt.generation,
  ]);
}
function pause(signal: AbortSignal, delay = 750) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(new Error("Pairing cancelled"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, delay);
    signal.addEventListener("abort", abort, { once: true });
  });
}
export async function serveShortPairing(
  userId: string,
  pending: PendingPairing,
  worker: ShortCodeCrypto,
  signal: AbortSignal,
) {
  // A second tab can display the same code but must not overwrite a live
  // tab's persisted OPAQUE state with a different registration.
  if (navigator.locks) {
    return navigator.locks.request(
      `pax/short-code/recipient/${userId}/${pending.pairingId}`,
      { signal },
      () => serveShortPairingLocked(userId, pending, worker, signal),
    );
  }
  return serveShortPairingLocked(userId, pending, worker, signal);
}
async function serveShortPairingLocked(
  userId: string,
  pending: PendingPairing,
  worker: ShortCodeCrypto,
  signal: AbortSignal,
) {
  const local = pending.shortCode;
  if (
    !local ||
    local.ownerUserId !== userId ||
    !local.serverCreatedAt ||
    !pending.expiresAt
  )
    return;
  const path = shortPairingPath(userId, pending.agentId, pending.pairingId);
  const request = {
    pairing_id: pending.pairingId,
    agent_id: pending.agentId,
    device_id: pending.deviceId,
    key_epoch: pending.keyEpoch,
    recipient_public_key: encodePairingValue(pending.publicKey),
  };
  const started = Date.parse(local.serverCreatedAt),
    expires = Math.min(
      Date.parse(pending.expiresAt),
      started + SHORT_PAIRING_LIFETIME_MS,
    );
  const offset = local.clockOffsetMs ?? 0;
  type Saved = {
    state: string;
    answer: string;
    context: string;
    hello: string;
    finish?: string;
    payload?: string;
    failed?: boolean;
  };
  const savedStates = new Map<string, Saved>();
  while (!signal.aborted && Date.now() + offset < expires) {
    let attempts: ShortAttempt[];
    try {
      attempts = await relay<ShortAttempt[]>(
        path + "/attempts",
        local.capability,
        undefined,
        signal,
      );
    } catch (error) {
      if (signal.aborted || (error instanceof ApiError && error.status < 500))
        throw error;
      await pause(signal, 1500);
      continue;
    }
    if (attempts.length > 30) throw new Error("Too many pairing attempts");
    for (const attempt of attempts) {
      signal.throwIfAborted();
      const now = Date.now() + offset;
      if (
        attempt.pairing_id !== pending.pairingId ||
        !Number.isSafeInteger(attempt.generation) ||
        attempt.generation < 0 ||
        attempt.generation > 9 ||
        now < started + attempt.generation * 60_000 ||
        now >= generationDeadline(started, expires, attempt.generation)
      )
        continue;
      await reserveLocalAttempt(
        userId,
        pending.agentId,
        `${pending.pairingId}:${attempt.generation}:${attempt.attempt_id}`,
      );
      const context = shortContext(userId, request, attempt);
      const storageId = `attempt:${userId}:${pending.pairingId}:${attempt.attempt_id}`;
      let saved =
        savedStates.get(attempt.attempt_id) ??
        (await shortState<Saved>(storageId));
      if (
        saved &&
        (saved.failed ||
          saved.context !== context ||
          saved.hello !== attempt.client_hello)
      )
        continue;
      try {
        if (attempt.stage === 0) {
          if (!saved) {
            const code = await worker.call(
              "deriveShortCode",
              local.seed,
              pending.pairingId,
              attempt.generation,
            );
            const registration = await worker.call(
              "registerCode",
              code,
              context,
            );
            const answer = await worker.call(
              "answerCodeLogin",
              registration,
              attempt.client_hello,
              context,
            );
            saved = {
              state: answer.state,
              answer: answer.message,
              context,
              hello: attempt.client_hello,
            };
            await shortState(storageId, () => saved!);
          }
          savedStates.set(attempt.attempt_id, saved);
          signal.throwIfAborted();
          await relay(
            path + `/attempts/${encodeURIComponent(attempt.attempt_id)}`,
            local.capability,
            { stage: 1, payload: saved.answer },
            signal,
          );
        } else if (attempt.stage === 2 && attempt.client_finish && saved) {
          if (saved.finish && saved.finish !== attempt.client_finish) continue;
          if (!saved.payload) {
            const key = await worker.call(
              "finishCodeAnswer",
              saved.state,
              attempt.client_finish,
            );
            const payload = await worker.call(
              "sealPairingSecret",
              key,
              encodePairingValue(pending.secret),
              context,
            );
            saved = {
              ...saved,
              finish: attempt.client_finish,
              payload: JSON.stringify(payload),
            };
            await shortState(storageId, () => saved!);
            savedStates.set(attempt.attempt_id, saved);
          }
          signal.throwIfAborted();
          await relay(
            path + `/attempts/${encodeURIComponent(attempt.attempt_id)}`,
            local.capability,
            { stage: 3, payload: saved.payload },
            signal,
          );
        }
      } catch (error) {
        if (signal.aborted) throw error;
        if (
          error instanceof ApiError ||
          error instanceof TypeError ||
          (error instanceof DOMException && error.name === "AbortError")
        )
          continue;
        const failed: Saved = {
          ...(saved ?? {
            state: "",
            answer: "",
            context,
            hello: attempt.client_hello,
          }),
          failed: true,
        };
        savedStates.set(attempt.attempt_id, failed);
        await shortState(storageId, () => failed);
      }
    }
    await pause(signal, 1500);
  }
}

export type ShortCodeGrant = {
  request: E2EEPairingRequest;
  attempt: ShortAttempt;
  secret: string;
  capability: string;
  deadline: number;
};
export async function matchShortCode(
  userId: string,
  agentId: string,
  input: string,
  worker: ShortCodeCrypto,
  signal: AbortSignal,
): Promise<ShortCodeGrant> {
  const code = normalizeShortCode(input);
  if (!(await loadRootKey(agentId)))
    throw new Error("This browser is not authorized");
  const requests = (await listE2EEPairingRequests(userId, agentId)).filter(
    (r) => r.protocol_version === "short-code-v2",
  );
  if (!requests.length) throw new Error("No device is waiting for access");
  if (requests.length > 3)
    throw new Error(
      "Too many pending devices. Cancel an unused request first.",
    );
  const tasks: Promise<ShortCodeGrant | undefined>[] = [];
  for (const request of requests) {
    const offset = request.server_time
      ? Date.parse(request.server_time) - Date.now()
      : 0;
    const created = Date.parse(request.created_at),
      expires = Math.min(
        Date.parse(request.expires_at),
        created + SHORT_PAIRING_LIFETIME_MS,
      );
    const generation = codeGeneration(created, Date.now() + offset);
    for (const number of [generation, generation - 1]) {
      signal.throwIfAborted();
      if (
        number < 0 ||
        number > 9 ||
        Date.now() + offset >= generationDeadline(created, expires, number)
      )
        continue;
      tasks.push(
        (async (): Promise<ShortCodeGrant | undefined> => {
          const login = await worker.call("startCodeLogin", code);
          const capability = encodePairingValue(
            crypto.getRandomValues(new Uint8Array(32)),
          );
          const id = `attempt_${crypto.randomUUID()}`;
          const path =
            shortPairingPath(userId, agentId, request.pairing_id) +
            `/attempts/${encodeURIComponent(id)}`;
          await reserveLocalAttempt(userId, agentId, id);
          let attempt: ShortAttempt;
          try {
            attempt = await relay<ShortAttempt>(
              shortPairingPath(userId, agentId, request.pairing_id) +
                "/attempts",
              capability,
              {
                attempt_id: id,
                generation: number,
                client_hello: login.message,
              },
              signal,
            );
          } catch (error) {
            if (error instanceof ApiError && error.status === 410)
              return undefined;
            throw error;
          }
          if (
            attempt.attempt_id !== id ||
            attempt.pairing_id !== request.pairing_id ||
            attempt.generation !== number ||
            attempt.client_hello !== login.message
          )
            throw new Error("Pairing request changed");
          const context = shortContext(userId, request, attempt);
          const waitUntil = Math.min(
            Date.now() + 15_000,
            Date.parse(attempt.expires_at) - offset,
          );
          while (attempt.stage < 1 && Date.now() < waitUntil) {
            await pause(signal);
            attempt = await relay<ShortAttempt>(
              path,
              capability,
              undefined,
              signal,
            );
          }
          if (!attempt.recipient_answer) return undefined;
          const verified = await worker.call(
            "finishCodeLogin",
            login.state,
            attempt.recipient_answer,
            code,
            context,
          );
          if (!verified) return undefined;
          attempt = await relay<ShortAttempt>(
            path,
            capability,
            { stage: 2, payload: verified.message },
            signal,
          );
          while (attempt.stage < 3 && Date.now() < waitUntil) {
            await pause(signal);
            attempt = await relay<ShortAttempt>(
              path,
              capability,
              undefined,
              signal,
            );
          }
          if (!attempt.secret_payload || !attempt.confirmation_expires_at)
            return undefined;
          const secret = await worker.call(
            "openPairingSecret",
            verified.key,
            JSON.parse(attempt.secret_payload),
            context,
          );
          const commitment = await pairingSecretCommitment(
            decodePairingValue(secret),
            {
              pairingId: request.pairing_id,
              agentId,
              deviceId: request.device_id,
              keyEpoch: request.key_epoch,
            },
            decodePairingValue(request.recipient_public_key),
          );
          if (encodePairingValue(commitment) !== request.secret_commitment)
            throw new Error("Pairing request changed");
          return {
            request,
            attempt,
            secret,
            capability,
            deadline: Math.min(
              Date.parse(attempt.confirmation_expires_at) - offset,
              confirmationDeadline(expires - offset, Date.now()),
            ),
          };
        })(),
      );
    }
  }
  const matches = (await Promise.all(tasks)).filter(
    (value): value is ShortCodeGrant => Boolean(value),
  );
  if (matches.length !== 1)
    throw new Error(
      matches.length
        ? "Code is ambiguous. Wait for a new code."
        : "Code not accepted. Keep the new device open and try its current code.",
    );
  if (
    !Number.isFinite(matches[0].deadline) ||
    matches[0].deadline <= Date.now()
  )
    throw new Error("Confirmation expired. Enter the current code again.");
  return matches[0];
}
export async function approveShortCode(userId: string, grant: ShortCodeGrant) {
  if (Date.now() >= grant.deadline) throw new Error("Confirmation expired");
  return approveBrowserPairing(userId, grant.request, grant.secret, {
    attemptId: grant.attempt.attempt_id,
    capability: grant.capability,
  });
}

export async function cancelShortPairing(
  userId: string,
  pending: PendingPairing,
) {
  if (!pending.shortCode || pending.shortCode.ownerUserId !== userId)
    throw new Error("Pairing not available");
  return relay(
    shortPairingPath(userId, pending.agentId, pending.pairingId) + "/end",
    pending.shortCode.capability,
    { reason: "cancelled" },
  );
}
export async function rejectShortCode(userId: string, grant: ShortCodeGrant) {
  return relay(
    shortPairingPath(userId, grant.request.agent_id, grant.request.pairing_id) +
      "/end",
    grant.capability,
    { reason: "rejected", attempt_id: grant.attempt.attempt_id },
  );
}
