import { describe, expect, it } from "vitest";
import { audioLevel, concatPcm, PcmResampler } from "./pcm";

function ramp(length: number) {
  return Float32Array.from({ length }, (_, index) => Math.sin(index / 7) * 0.8);
}

describe("PcmResampler", () => {
  it("averages each window when downsampling and writes little-endian PCM", () => {
    const output = new PcmResampler(48_000, 16_000).process(
      new Float32Array(48).fill(0.5),
    );
    expect(output).toHaveLength(16);
    expect([...output].every((sample) => sample === 16_384)).toBe(true);
    const bytes = new Uint8Array(output.buffer);
    expect([bytes[0], bytes[1]]).toEqual([0x00, 0x40]);
  });

  it("gives the same result however the input is chunked", () => {
    const input = ramp(4_801);
    const whole = new PcmResampler(44_100, 16_000).process(input);
    const chunked = new PcmResampler(44_100, 16_000);
    const parts = [0, 127, 1_000, 1_001, 3_333, input.length];
    const pieces = parts
      .slice(1)
      .map((end, index) => chunked.process(input.slice(parts[index], end)));
    expect(concatPcm(pieces)).toEqual(whole);
  });

  it("interpolates when the provider rate is higher than the microphone rate", () => {
    const output = new PcmResampler(16_000, 24_000).process(
      Float32Array.from([0, 0.3, 0.6, 0.9]),
    );
    expect(output.length).toBeGreaterThanOrEqual(4);
    expect(output[0]).toBe(0);
    expect(output[1]).toBe(Math.round(0.2 * 0x7fff));
  });

  it("clamps samples outside the float range", () => {
    expect([
      ...new PcmResampler(16_000, 16_000).process(Float32Array.from([2, -2])),
    ]).toEqual([0x7fff, -0x8000]);
  });

  it("rejects invalid sample rates", () => {
    expect(() => new PcmResampler(0, 16_000)).toThrow();
  });
});

describe("audioLevel", () => {
  it("maps loudness into 0..1", () => {
    expect(audioLevel(new Float32Array(0))).toBe(0);
    expect(audioLevel(new Float32Array(128))).toBe(0);
    expect(audioLevel(new Float32Array(128).fill(1))).toBe(1);
  });
});
