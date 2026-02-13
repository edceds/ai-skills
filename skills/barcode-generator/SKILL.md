---
name: barcode-generator
description: Generate Code128 1D barcodes as SVG. Pixel-precise bar/space encoding with check digit computation. Use when the user needs a barcode for inventory, shipping labels, product IDs, or any scannable 1D code.
---

# Barcode Generator

Generate Code128 1D barcodes as self-contained SVG. Zero external dependencies — implements Code128 encoding from scratch.

## Quick start

```bash
npx tsx scripts/generate.ts --data "ABC-12345"
npx tsx scripts/generate.ts --data "Hello World" --width 400 --height 100
```

## Options

- `--data <text>` — content to encode (required)
- `--width <px>` — image width (default: 300)
- `--height <px>` — bar height (default: 80)
- `--show-text` — render the data text below the barcode (default: true)
- `--no-text` — hide the text label
- `--out <file>` — write to file (default: stdout)

## Output

SVG markup to stdout (or file with `--out`).
