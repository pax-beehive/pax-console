/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NodeSecretChannelPush } from "./node-secret-channel-push";

// This suite models a "fake paxd" that mirrors the real daemon's actual
// wiring assumptions rather than the component's — in particular, paxd
// binds its own internal identifier (e.g. its boot ID) into the encryption
// context, which is NOT the same string as the page's `nodeId` prop. A test
// that used the same nodeId value on both the seal and the "open" side
// would not have caught the real production bug (the component using its
// own nodeId prop instead of echoing the one paxd actually returned).

const PAGE_NODE_ID = "node_1";
const PAXD_INTERNAL_NODE_ID = "boot_completely_different_from_page_node_id";

const mocks = vi.hoisted(() => ({
  openNodeDaemonSecretChannel: vi.fn(),
  pushNodeDaemonSecretChannel: vi.fn(),
}));

vi.mock("@/features/api/resources", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/api/resources")>();
  return {
    ...actual,
    openNodeDaemonSecretChannel: mocks.openNodeDaemonSecretChannel,
    pushNodeDaemonSecretChannel: mocks.pushNodeDaemonSecretChannel,
  };
});

async function decodeBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
function encodeBase64(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Mirrors paxd's OpenSecret/Consume exactly (see crypto.ts's header comment
 * on why the wire format must match paxd/internal/secretchannel/crypto.go
 * byte-for-byte). Used here as the decrypt side of the fake server. */
async function fakePaxdOpenSecret(
  recipientPrivateKey: CryptoKey,
  push: {
    sender_public_key: string;
    nonce: string;
    ciphertext: string;
    channel_id: string;
    command_id: string;
  },
  nodeId: string,
  expiresAtUnix: number,
) {
  const senderPublicKey = await crypto.subtle.importKey(
    "raw",
    (await decodeBase64(push.sender_public_key)).buffer as ArrayBuffer,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = await crypto.subtle.deriveBits(
    { name: "ECDH", public: senderPublicKey },
    recipientPrivateKey,
    256,
  );
  const hkdfKey = await crypto.subtle.importKey("raw", shared, "HKDF", false, [
    "deriveKey",
  ]);
  const aesKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: new TextEncoder().encode("pax/secret-channel/hkdf/v1"),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const aad = new TextEncoder().encode(
    JSON.stringify([
      1,
      "pax/secret-channel/temporary-file/v1",
      nodeId,
      push.channel_id,
      push.command_id,
      expiresAtUnix,
    ]),
  );
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: (await decodeBase64(push.nonce)).buffer as ArrayBuffer,
      additionalData: aad.buffer as ArrayBuffer,
      tagLength: 128,
    },
    aesKey,
    (await decodeBase64(push.ciphertext)).buffer as ArrayBuffer,
  );
  return new TextDecoder().decode(plaintext);
}

async function setUpFakePaxd() {
  const recipient = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;
  const publicKeyBytes = new Uint8Array(
    await crypto.subtle.exportKey("raw", recipient.publicKey),
  );
  const expiresAtIso = "2026-01-01T00:05:00Z";
  const expiresAtUnix = Math.floor(new Date(expiresAtIso).getTime() / 1000);

  mocks.openNodeDaemonSecretChannel.mockResolvedValue({
    type: "secret_channel.open",
    secret_channel_open: {
      channel_id: "chan_1",
      // Deliberately not PAGE_NODE_ID: this is what a real paxd (which
      // knows nothing about pax-manager's node IDs) actually does.
      node_id: PAXD_INTERNAL_NODE_ID,
      public_key: encodeBase64(publicKeyBytes),
      expires_at: expiresAtIso,
    },
  });

  mocks.pushNodeDaemonSecretChannel.mockImplementation(
    async (_userId: string, _nodeId: string, input: Record<string, string>) => {
      try {
        const plaintext = await fakePaxdOpenSecret(
          recipient.privateKey,
          input as never,
          PAXD_INTERNAL_NODE_ID,
          expiresAtUnix,
        );
        return {
          command_id: input.command_id,
          command_ack: {
            ok: true,
            status: "applied",
            result: {
              secret_channel_push: {
                file_ref: `file:/tmp/${plaintext.length}-bytes`,
                expires_at: expiresAtIso,
              },
            },
          },
        };
      } catch {
        return {
          command_id: input.command_id,
          command_ack: {
            ok: false,
            error: { code: "invalid_argument", message: "decrypt failed" },
          },
        };
      }
    },
  );
}

beforeEach(() => {
  mocks.openNodeDaemonSecretChannel.mockReset();
  mocks.pushNodeDaemonSecretChannel.mockReset();
});

afterEach(() => cleanup());

function renderPanel(
  onDelivered?: (receipt: { fileRef: string; expiresAt: string }) => void,
) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <NodeSecretChannelPush
        nodeId={PAGE_NODE_ID}
        userId="user_1"
        onDelivered={onDelivered}
      />
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

describe("NodeSecretChannelPush", () => {
  it("returns only the file receipt to the conversation, never the secret", async () => {
    await setUpFakePaxd();
    const onDelivered = vi.fn();
    renderPanel(onDelivered);
    await userEvent.type(
      screen.getByLabelText("Secret value"),
      "synthetic-password",
    );
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(onDelivered).toHaveBeenCalledTimes(1));
    const receipt = onDelivered.mock.calls[0][0];
    expect(receipt.fileRef).toMatch(/^file:/);
    expect(JSON.stringify(receipt)).not.toContain("synthetic-password");
    expect(screen.getByLabelText("Secret value")).toHaveValue("");
  });
  it("does not reopen or resend an expired channel and requires manual retry", async () => {
    await setUpFakePaxd();
    mocks.pushNodeDaemonSecretChannel.mockResolvedValue({
      command_ack: {
        ok: false,
        error: {
          code: "expired",
          message: "secret channel expired or unknown",
        },
      },
    });
    const { queryClient } = renderPanel();
    await userEvent.type(
      screen.getByPlaceholderText("Secret value"),
      "synthetic-secret",
    );
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText(/Check the node before manually retrying/),
    ).toBeInTheDocument();
    expect(mocks.openNodeDaemonSecretChannel).toHaveBeenCalledTimes(1);
    expect(mocks.pushNodeDaemonSecretChannel).toHaveBeenCalledTimes(1);
    expect(screen.getByPlaceholderText("Secret value")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  });

  it("delivers a secret end-to-end against a fake paxd with a different internal node_id", async () => {
    await setUpFakePaxd();
    const { queryClient } = renderPanel();

    await userEvent.type(
      screen.getByPlaceholderText("Secret value"),
      "sk-super-secret",
    );
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText(/Delivered to/)).toBeInTheDocument();

    // The command_id used to seal the payload must be the exact one sent
    // in the push request: fakePaxdOpenSecret only succeeds if the AAD it
    // reconstructs from `input.command_id` matches what the browser used.
    expect(mocks.pushNodeDaemonSecretChannel).toHaveBeenCalledTimes(1);
    const [, , pushedInput] = mocks.pushNodeDaemonSecretChannel.mock.calls[0];
    expect(pushedInput.command_id).toBeTruthy();

    // No TanStack Mutation should ever have been created for this action:
    // useMutation retains a completed mutation (and the mutationFn closure
    // that produced it, including anything it captured) in the
    // MutationCache for its gcTime, not just for the duration of the call.
    // A closure capturing the plaintext would keep it reachable long after
    // the input was cleared.
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);

    // The input field must be cleared.
    expect(screen.getByPlaceholderText("Secret value")).toHaveValue("");
  });

  it("shows an error if paxd rejects the payload (e.g. a real node_id mismatch)", async () => {
    await setUpFakePaxd();
    // Force a mismatch by having the mock ignore what setUpFakePaxd wired
    // and always fail, simulating a genuinely broken client.
    mocks.pushNodeDaemonSecretChannel.mockResolvedValue({
      command_id: "cmd_x",
      command_ack: {
        ok: false,
        error: {
          code: "invalid_argument",
          message: "unable to decrypt payload",
        },
      },
    });
    renderPanel();

    await userEvent.type(
      screen.getByPlaceholderText("Secret value"),
      "sk-super-secret",
    );
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(screen.getByText(/unable to decrypt payload/)).toBeInTheDocument(),
    );
  });
});
