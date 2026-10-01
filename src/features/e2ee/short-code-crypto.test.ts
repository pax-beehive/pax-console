// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  registerCode,
  startCodeLogin,
  answerCodeLogin,
  finishCodeLogin,
  finishCodeAnswer,
  sealPairingSecret,
  openPairingSecret,
} from "./short-code-crypto";

const context = JSON.stringify([
  "pax/short-code/v2",
  "user",
  "agent",
  "pair",
  "recipient-public-key",
  1,
  0,
]);
describe("browser-only PAKE", () => {
  it("Given the correct code When both browsers confirm Then only they can transfer the legacy secret", async () => {
    const registration = await registerCode("01234567", context);
    const login = await startCodeLogin("01234567");
    const answer = await answerCodeLogin(registration, login.message, context);
    const client = await finishCodeLogin(
      login.state,
      answer.message,
      "01234567",
      context,
    );
    expect(client).toBeDefined();
    const serverKey = await finishCodeAnswer(answer.state, client!.message);
    expect(client!.key).toBe(serverKey);
    const payload = await sealPairingSecret(
      serverKey,
      "high-entropy-secret",
      context + ":attempt-1",
    );
    expect(
      await openPairingSecret(client!.key, payload, context + ":attempt-1"),
    ).toBe("high-entropy-secret");
    await expect(
      openPairingSecret(client!.key, payload, context + ":attempt-2"),
    ).rejects.toThrow();
    expect(
      JSON.stringify({
        login: login.message,
        answer: answer.message,
        finish: client!.message,
        payload,
      }),
    ).not.toContain("01234567");
  }, 20000);
  it("Given a wrong code or substituted context When finishing Then no shared key is returned", async () => {
    const registration = await registerCode("01234567", context);
    for (const [password, binding] of [
      ["87654321", context],
      ["01234567", context + "attacker"],
    ]) {
      const login = await startCodeLogin(password);
      const answer = await answerCodeLogin(
        registration,
        login.message,
        context,
      );
      expect(
        await finishCodeLogin(login.state, answer.message, password, binding),
      ).toBeUndefined();
    }
  }, 20000);
});
