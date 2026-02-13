import { readFileSync, writeFileSync } from "node:fs";

interface WavInput {
  frequency: number;
  duration: number;
  sample_rate?: number;
  volume?: number;
  waveform?: "sine" | "square" | "sawtooth";
}

// ─── WAV file writer (PCM 16-bit mono) ──────────────────────────────────────

function generateSamples(freq: number, duration: number, sampleRate: number, volume: number, waveform: string): Int16Array {
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Int16Array(numSamples);
  const maxAmp = 32767 * volume;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const phase = (freq * t) % 1;
    let value: number;

    switch (waveform) {
      case "square":
        value = phase < 0.5 ? 1 : -1;
        break;
      case "sawtooth":
        value = 2 * phase - 1;
        break;
      default: // sine
        value = Math.sin(2 * Math.PI * freq * t);
    }

    samples[i] = Math.round(value * maxAmp);
  }

  // Fade in/out to avoid clicks (10ms)
  const fadeSamples = Math.min(Math.floor(sampleRate * 0.01), numSamples / 2);
  for (let i = 0; i < fadeSamples; i++) {
    const fade = i / fadeSamples;
    samples[i] = Math.round(samples[i] * fade);
    samples[numSamples - 1 - i] = Math.round(samples[numSamples - 1 - i] * fade);
  }

  return samples;
}

function buildWav(samples: Int16Array, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = samples.length * (bitsPerSample / 8);
  const fileSize = 36 + dataSize;

  const buffer = Buffer.alloc(44 + dataSize);
  let offset = 0;

  // RIFF header
  buffer.write("RIFF", offset); offset += 4;
  buffer.writeUInt32LE(fileSize, offset); offset += 4;
  buffer.write("WAVE", offset); offset += 4;

  // fmt chunk
  buffer.write("fmt ", offset); offset += 4;
  buffer.writeUInt32LE(16, offset); offset += 4;          // chunk size
  buffer.writeUInt16LE(1, offset); offset += 2;           // PCM format
  buffer.writeUInt16LE(numChannels, offset); offset += 2;
  buffer.writeUInt32LE(sampleRate, offset); offset += 4;
  buffer.writeUInt32LE(byteRate, offset); offset += 4;
  buffer.writeUInt16LE(blockAlign, offset); offset += 2;
  buffer.writeUInt16LE(bitsPerSample, offset); offset += 2;

  // data chunk
  buffer.write("data", offset); offset += 4;
  buffer.writeUInt32LE(dataSize, offset); offset += 4;

  // PCM samples
  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(samples[i], offset);
    offset += 2;
  }

  return buffer;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  if (!args.includes("--stdin")) {
    console.error("Usage: generate.ts --stdin [--out file.wav]");
    process.exit(1);
  }

  const input: WavInput = JSON.parse(readFileSync(0, "utf-8"));
  const freq = input.frequency;
  const duration = input.duration;
  const sampleRate = input.sample_rate ?? 44100;
  const volume = Math.max(0, Math.min(1, input.volume ?? 0.8));
  const waveform = input.waveform ?? "sine";

  if (freq < 20 || freq > 20000) { console.error("Frequency must be 20–20000 Hz"); process.exit(1); }
  if (duration <= 0 || duration > 30) { console.error("Duration must be 0–30 seconds"); process.exit(1); }

  const samples = generateSamples(freq, duration, sampleRate, volume, waveform);
  const wav = buildWav(samples, sampleRate);

  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  const out = get("--out");
  if (out) {
    writeFileSync(out, wav);
    console.log(JSON.stringify({ ok: true, file: out, size: wav.length }));
  } else {
    console.log(JSON.stringify({
      base64: wav.toString("base64"),
      size: wav.length,
      duration,
      frequency: freq,
    }));
  }
}

main();
