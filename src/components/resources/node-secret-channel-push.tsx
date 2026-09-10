"use client";

import { useState } from "react";
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
// single-use channel with paxd and encrypts once in this browser.
//
// Deliberately does NOT use useMutation/TanStack Query for the send action,
// unlike its sibling panels: TanStack retains a completed mutation (and the
// mutationFn closure that produced it, including anything that closure
// captured) in its MutationCache for the mutation's gcTime, not just for the
// duration of the call. A closure capturing the plaintext secret would keep
// it reachable well after the input was cleared. Plain useState plus a
// directly-invoked async handler means the only reference to the plaintext
// is a local variable inside handleSend, eligible for GC once that async
// function returns.
export function NodeSecretChannelPush({
  nodeId,
  userId,
}: NodeSecretChannelPushProps) {
  const [value, setValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [outcome, setOutcome] = useState<PushOutcome>();

  async function handleSend() {
    const secretValue = value;
    setValue("");
    setOutcome(undefined);
    setIsSending(true);
    try {
      setOutcome(await deliverSecret(userId, nodeId, secretValue));
    } catch (error) {
      setOutcome({ kind: "error", message: (error as Error).message });
    } finally {
      setIsSending(false);
    }
  }

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
          disabled={isSending}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Secret value"
          type="password"
          value={value}
        />
        <Button
          disabled={!value || isSending}
          onClick={() => void handleSend()}
          size="md"
          type="button"
          variant="primary"
        >
          {isSending ? "Sending..." : "Send"}
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
  const ack = await sealAndPush(userId, nodeId, secretValue);
  if (ack.error?.code === "expired") {
    // paxd also reports unknown channels as expired after losing in-memory
    // state. A new channel could repeat an already-applied delivery.
    return {
      kind: "error",
      message:
        "Secret channel expired or is no longer known. Check the node before manually retrying; an earlier delivery may have completed.",
    };
  }
  return interpretAck(ack);
}

async function sealAndPush(
  userId: string,
  nodeId: string,
  secretValue: string,
): Promise<SecretChannelAck> {
  const channel = await openChannel(userId, nodeId);
  // command_id is bound into the AES-GCM additional data (see crypto.ts), so
  // it must be the exact same value sent in the push request body — paxd
  // reconstructs the AAD from the command_id it actually received, not from
  // whatever the browser used while sealing.
  const commandId = crypto.randomUUID();
  const sealed = await sealSecretForChannel(channel.public_key, secretValue, {
    // channel.node_id is whatever paxd bound into this channel's AAD; it is
    // not necessarily the same as the page's own nodeId (paxd may use an
    // internal identifier, e.g. its boot ID). Always echo the value the
    // open response carried — never substitute the page's nodeId here.
    nodeId: channel.node_id,
    channelId: channel.channel_id,
    commandId,
    expiresAtUnix: expiresAtToUnixSeconds(channel.expires_at),
  });
  const response = await pushNodeDaemonSecretChannel(userId, nodeId, {
    command_id: commandId,
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
