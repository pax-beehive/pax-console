import { describe, expect, it } from "vitest";
import {
  createPairingSecret,
  generatePairingDeviceKey,
  pairingSecretCommitment,
  unwrapAgentRootKey,
  wrapAgentRootKey,
} from "./pairing";

describe("E2EE browser device pairing", () => {
  it("wraps one agent epoch root for exactly one browser device", async () => {
    const recipient = await generatePairingDeviceKey();
    const other = await generatePairingDeviceKey();
    const secret = createPairingSecret();
    const rootKey = Uint8Array.from({ length: 32 }, (_, index) => 31 - index);
    const context = {
      pairingId: "pair_1",
      agentId: "agent_1",
      deviceId: recipient.deviceId,
      keyEpoch: 1,
    };

    const commitment = await pairingSecretCommitment(
      secret,
      context,
      recipient.publicKey,
    );
    expect(commitment).toHaveLength(32);
    const wrapped = await wrapAgentRootKey(
      rootKey,
      recipient.publicKey,
      secret,
      context,
    );
    await expect(
      unwrapAgentRootKey(recipient.privateKey, secret, context, wrapped),
    ).resolves.toEqual(rootKey);
    await expect(
      unwrapAgentRootKey(other.privateKey, secret, context, wrapped),
    ).rejects.toThrow("unwrap");
  });

  it("binds the commitment to agent, epoch, device, and public key", async () => {
    const device = await generatePairingDeviceKey();
    const secret = Uint8Array.from({ length: 16 }, (_, index) => index);
    const base = {
      pairingId: "pair_1",
      agentId: "agent_1",
      deviceId: device.deviceId,
      keyEpoch: 1,
    };
    const first = await pairingSecretCommitment(secret, base, device.publicKey);
    const changed = await pairingSecretCommitment(
      secret,
      { ...base, keyEpoch: 2 },
      device.publicKey,
    );

    expect(changed).not.toEqual(first);
  });
});
