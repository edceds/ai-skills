---
name: hash-generator
description: Compute cryptographic hashes (SHA-256, SHA-512, MD5, SHA-1) and HMAC signatures. Use when the user needs to hash data for verification, generate API signatures, compute checksums, or create HMAC authentication tokens.
---

# Hash Generator

Compute cryptographic hashes and HMAC signatures. Uses Node.js built-in crypto.

## Quick start

```bash
npx tsx scripts/generate.ts --data "hello world" --algorithm sha256
npx tsx scripts/generate.ts --data "message" --algorithm sha256 --hmac-key "secret"
npx tsx scripts/generate.ts --stdin <<< '{"data":"hello","algorithm":"sha512"}'
```

## Input format (JSON via --stdin)

```json
{
  "data": "hello world",
  "algorithm": "sha256",
  "encoding": "hex",
  "hmac_key": "optional-secret-key"
}
```

## Fields

- **data** (string, required) — input to hash
- **algorithm** ("sha256" | "sha512" | "md5" | "sha1", default: "sha256")
- **encoding** ("hex" | "base64", default: "hex") — output encoding
- **hmac_key** (string, optional) — if provided, computes HMAC instead of plain hash

## CLI options

- `--data <text>` — data to hash
- `--algorithm <algo>` — hash algorithm
- `--encoding <enc>` — output encoding
- `--hmac-key <key>` — HMAC secret key
- `--stdin` — read JSON from stdin

## Output

JSON: `{ hash, algorithm, encoding, hmac }` to stdout.
