"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/inline-error";
import {
  openNodeDaemonSecretChannel,
  pushNodeDaemonSecretChannel,
} from "@/features/api/resources";
import { NodeDaemonSecretChannel } from "@/features/api/types";
import {
  expiresAtToUnixSeconds,
  sealSecretForChannel,
} from "@/features/secret-push/crypto";

type NodeSecretChannelPushProps = {
  nodeId: string;
  userId: string;
};

type PushOutcome =
  | { kind: "delivered"; fileRef: string; expiresAt: string }
  | { kind: "error"; message: string };

type SecretChannelAck = {
  ok?: boolean;
  error?: { code?: string; message?: string };
  result?: {
    secret_channel_push?: { file_ref?: string; expires_at?: string };
  };
};

// This panel is independent from the E2EE pairing UI (features/e2ee): there
// is no session, no device pairing, no key epoch. Every send opens a fresh,
// single-use channel with paxd, encrypts once in this browser, and never
// keeps the plaintext around longer than the single mutation call below.
export function NodeSecretChannelPush({
  nodeId,
  userId,
}: NodeSecretChannelPushProps) {
  const [value, setValue] = useState("");
  const [outcome, setOutcome] = useState<PushOutcome>();

  const push = useMutation({
    mutationFn: (secretValue: string) =>
      deliverSecret(userId, nodeId, secretValue),
    onSuccess: (result) => setOutcome(result),
    onError: (error: Error) =>
      setOutcome({ kind: "error", message: error.message }),
    onSettled: () => setValue(""),
  });

  return (
    <section className="grid min-w-0 gap-3 rounded-lg border border-hairline bg-surface-1 p-3">
      <h2 className="text-base font-medium">Send a secret to this node</h2>
      <p className="text-xs text-ink-tertiary">
        Encrypted in this browser against a one-time key paxd generates on
        the fly. pax-manager only ever relays ciphertext; paxd decrypts it
        locally and drops it into a short-lived file for a local program to
        pick up.
      </p>
      <div className="flex min-w-0 gap-2">
        <input
          autoComplete="off"
          className="min-h-9 min-w-0 flex-1 rounded-lg border border-hairline bg-surface-1 px-3 text-sm text-ink outline-none placeholder:text-ink-tertiary focus:border-hairline-strong"
          disabled={push.isPending}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Secret value"
          type="password"
          value={value}
        />
        <Button
          disabled={!value || push.isPending}
          onClick={() => push.mutate(value)}
          size="md"
          type="button"
          variant="primary"
        >
          {push.isPending ? "Sending..." : "Send"}
        </Button>
      </div>
      {outcome?.kind === "delivered" && (
        <p className="text-xs text-ink-tertiary">
          Delivered to <span className="font-mono">{outcome.fileRef}</span>{" "}
          (expires {outcome.expiresAt}).
        </p>
      )}
      {outcome?.kind === "error" && (
        <InlineError error={new Error(outcome.message)} />
      )}
    </section>
  );
}

async function deliverSecret(
  userId: string,
  nodeId: string,
  secretValue: string,
): Promise<PushOutcome> {
  let ack = await sealAndPush(userId, nodeId, secretValue);
  if (ack.error?.code === "expired") {
    // The channel timed out before this push arrived; a fresh channel is
    // always safe to retry against, since nothing about the previous one
    // was ever consumed.
    ack = await sealAndPush(userId, nodeId, secretValue);
  }
  return interpretAck(ack);
}

async function sealAndPush(
  userId: string,
  nodeId: string,
  secretValue: string,
): Promise<SecretChannelAck> {
  const channel = await openChannel(userId, nodeId);
  const sealed = await sealSecretForChannel(channel.public_key, secretValue, {
    nodeId,
    channelId: channel.channel_id,
    commandId: crypto.randomUUID(),
    expiresAtUnix: expiresAtToUnixSeconds(channel.expires_at),
  });
  const response = await pushNodeDaemonSecretChannel(userId, nodeId, {
    channel_id: channel.channel_id,
    sender_public_key: sealed.sender_public_key,
    nonce: sealed.nonce,
    ciphertext: sealed.ciphertext,
  });
  return (response.command_ack ?? {}) as SecretChannelAck;
}

async function openChannel(
  userId: string,
  nodeId: string,
): Promise<NodeDaemonSecretChannel> {
  const result = await openNodeDaemonSecretChannel(userId, nodeId);
  if (result.error || !result.secret_channel_open) {
    throw new Error(result.error?.message ?? "Failed to open secret channel");
  }
  return result.secret_channel_open;
}

function interpretAck(ack: SecretChannelAck): PushOutcome {
  const applied = ack.ok ? ack.result?.secret_channel_push : undefined;
  if (applied) {
    return {
      kind: "delivered",
      fileRef: applied.file_ref ?? "unknown",
      expiresAt: applied.expires_at ?? "unknown",
    };
  }
  return {
    kind: "error",
    message: ack.error?.message ?? "paxd rejected the secret",
  };
}
