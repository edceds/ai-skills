---
name: qr-code
description: Generate QR codes as SVG from text, URLs, or data. Supports error correction levels, custom sizing, and colors. Use when the user needs a QR code for a link, text, WiFi config, vCard, or any data.
---

# QR Code Generator

Generate QR codes as self-contained SVG. Zero external dependencies — implements QR encoding from scratch.

## Quick start

```bash
npx tsx scripts/generate.ts --data "https://example.com"
npx tsx scripts/generate.ts --data "Hello World" --size 300 --ecl H
npx tsx scripts/generate.ts --data "WIFI:T:WPA;S:MyNetwork;P:secret;;" --out wifi-qr.svg
```

## Options

- `--data <text>` — content to encode (required)
- `--size <px>` — image width/height in pixels (default: 256)
- `--ecl L|M|Q|H` — error correction level (default: M)
- `--fg <hex>` — foreground color (default: #000000)
- `--bg <hex>` — background color (default: #ffffff)
- `--quiet <n>` — quiet zone modules (default: 4)
- `--out <file>` — write to file (default: stdout)

## Output

SVG markup to stdout (or file with `--out`).
