---
name: wav-generator
description: Generate WAV audio files with sine, square, or sawtooth waveforms. Produces valid PCM audio as base64. Use when the user needs a tone, beep, notification sound, or test audio signal.
---

# WAV Generator

Generate WAV audio files from parameters. Zero external dependencies — writes raw PCM WAV format.

## Quick start

```bash
npx tsx scripts/generate.ts --stdin <<< '{"frequency":440,"duration":1.0}'
npx tsx scripts/generate.ts --stdin <<< '{"frequency":880,"duration":0.5,"waveform":"square","volume":0.5}'
```

## Input format (JSON)

```json
{
  "frequency": 440,
  "duration": 1.0,
  "sample_rate": 44100,
  "volume": 0.8,
  "waveform": "sine"
}
```

## Fields

- **frequency** (number, required) — tone frequency in Hz (20–20000)
- **duration** (number, required) — duration in seconds
- **sample_rate** (number, default: 44100) — samples per second
- **volume** (number, default: 0.8) — amplitude 0.0–1.0
- **waveform** ("sine" | "square" | "sawtooth", default: "sine") — wave shape

## Options

- `--stdin` — read JSON from stdin (required)
- `--out <file>` — write WAV to file (default: outputs base64 JSON to stdout)

## Output

- With `--out`: writes .wav file, prints `{ ok, file, size }` JSON
- Without `--out`: prints `{ base64, size, duration, frequency }` JSON
