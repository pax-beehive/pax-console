import { describe, expect, it } from "vitest";
import {
  codeGeneration,
  generationDeadline,
  confirmationDeadline,
  normalizeShortCode,
} from "./short-code-policy";

describe("short-code timing contract", () => {
  it("Given a minute boundary When rotating Then the previous generation has exactly thirty seconds grace", () => {
    expect(codeGeneration(1000, 60_999)).toBe(0);
    expect(codeGeneration(1000, 61_000)).toBe(1);
    expect(generationDeadline(1000, 601000, 0)).toBe(91000);
    expect(generationDeadline(1000, 601000, 9)).toBe(601000);
    expect(generationDeadline(1000, 9_999_999, 9)).toBe(601000);
    expect(() => generationDeadline(1000, Number.NaN, 0)).toThrow();
    expect(() => generationDeadline(1000, 601000, 10)).toThrow();
    expect(() => codeGeneration(1000, 999)).toThrow();
  });
  it("Given a matched request When confirming Then rotation cannot extend its thirty-second lease", () => {
    expect(confirmationDeadline(600000, 59000)).toBe(89000);
    expect(confirmationDeadline(600000, 590000)).toBe(600000);
  });
  it("accepts human spacing but rejects partial and nonnumeric codes", () => {
    expect(normalizeShortCode(" 0123-4567 ")).toBe("01234567");
    for (const input of [
      "1234567",
      "123456789",
      "12e34567",
      "１２３４５６７８",
    ]) {
      expect(() => normalizeShortCode(input)).toThrow();
    }
  });
});
