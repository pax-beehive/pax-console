/**
 * Converts microphone float samples to 16-bit little-endian mono PCM at the
 * rate the voice provider expects. Downsampling averages each output window,
 * which doubles as a cheap low-pass filter against aliasing; upsampling
 * interpolates linearly. Window positions come from absolute sample counts,
 * so results do not depend on how the input is chunked.
 */
export class PcmResampler {
  private pending: Float32Array = new Float32Array(0);
  // Absolute input index of pending[0].
  private offset = 0;
  private produced = 0;

  constructor(
    private readonly inputRate: number,
    private readonly outputRate: number,
  ) {
    if (!(inputRate > 0) || !(outputRate > 0)) {
      throw new Error("Sample rates must be positive");
    }
  }

  process(input: Float32Array): Int16Array {
    const samples = concat(this.pending, input);
    const output: number[] = [];
    const downsampling = this.inputRate >= this.outputRate;
    for (;;) {
      const position = this.inputPosition(this.produced);
      const index = Math.floor(position) - this.offset;
      if (downsampling) {
        const end =
          Math.floor(this.inputPosition(this.produced + 1)) - this.offset;
        if (end > samples.length) break;
        let sum = 0;
        for (let cursor = index; cursor < end; cursor++) sum += samples[cursor];
        output.push(sum / (end - index));
      } else {
        if (index + 1 >= samples.length) break;
        const fraction = position - Math.floor(position);
        output.push(
          samples[index] + (samples[index + 1] - samples[index]) * fraction,
        );
      }
      this.produced++;
    }
    const keep = Math.floor(this.inputPosition(this.produced)) - this.offset;
    this.pending = samples.slice(keep);
    this.offset += keep;
    return toPcm16(output);
  }

  // Exact for integer rates: an integer quotient is computed exactly, and a
  // fractional one is never close enough to an integer to floor wrongly.
  private inputPosition(outputIndex: number) {
    return (outputIndex * this.inputRate) / this.outputRate;
  }
}

function concat(head: Float32Array, tail: Float32Array) {
  if (head.length === 0) return tail;
  const joined = new Float32Array(head.length + tail.length);
  joined.set(head);
  joined.set(tail, head.length);
  return joined;
}

function toPcm16(samples: readonly number[]) {
  const output = new Int16Array(samples.length);
  // Write through a DataView so the bytes are little-endian on any host.
  const view = new DataView(output.buffer);
  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(
      index * 2,
      Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff),
      true,
    );
  });
  return output;
}

/** Root-mean-square loudness scaled to 0..1 for a level meter. */
export function audioLevel(samples: Float32Array) {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.min(1, Math.sqrt(sum / samples.length) * 4);
}

/** Joins PCM chunks into one buffer for a single WebSocket frame. */
export function concatPcm(chunks: readonly Int16Array[]) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const joined = new Int16Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}
