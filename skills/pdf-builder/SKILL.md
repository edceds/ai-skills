---
name: pdf-builder
description: Generate PDF documents from structured content — titles, paragraphs, tables, lists, headers/footers. Use when the user needs to create a PDF report, invoice, letter, or any printable document.
---

# PDF Builder

Generate valid PDF files from structured JSON input. Zero external dependencies — writes raw PDF format.

## Quick start

```bash
npx tsx scripts/build.ts --stdin < content.json
npx tsx scripts/build.ts --stdin --out report.pdf < content.json
echo '{"title":"Hello","body":["First paragraph.","Second paragraph."]}' | npx tsx scripts/build.ts --stdin
```

## Input format (JSON)

```json
{
  "title": "Quarterly Report",
  "author": "Finance Team",
  "date": "2025-01-15",
  "body": [
    "Executive summary paragraph here.",
    { "heading": "Revenue" },
    "Revenue grew 15% quarter over quarter.",
    { "table": { "headers": ["Region", "Q1", "Q2"], "rows": [["US", "1.2M", "1.4M"], ["EU", "800K", "920K"]] } },
    { "list": ["Item one", "Item two", "Item three"] }
  ],
  "footer": "Confidential — Page {page}"
}
```

## Options

- `--stdin` — read JSON from stdin (required)
- `--out <file>` — write PDF to file (default: outputs base64 to stdout)
- `--page-size letter|a4` — page size (default: letter)

## Output

- With `--out`: writes PDF file, prints `{ ok, file, size }` JSON
- Without `--out`: prints `{ base64, size, pages }` JSON
