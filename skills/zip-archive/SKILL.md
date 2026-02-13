---
name: zip-archive
description: Create ZIP archive files from a list of entries. Produces valid ZIP format with CRC32 checksums. Use when the user needs to bundle multiple files into a downloadable archive.
---

# ZIP Archive

Create ZIP archives from file entries. Zero external dependencies — implements ZIP format and CRC32 from scratch.

## Quick start

```bash
npx tsx scripts/generate.ts --stdin <<< '{"files":[{"name":"hello.txt","content":"Hello world"},{"name":"data.csv","content":"a,b\n1,2"}]}'
```

## Input format (JSON)

```json
{
  "files": [
    { "name": "readme.txt", "content": "This is a readme file." },
    { "name": "data/report.csv", "content": "Name,Score\nAlice,95\nBob,87" },
    { "name": "config.json", "content": "{\"version\": 1}" }
  ]
}
```

## Fields

- **files** (array, required) — array of file entries:
  - **name** (string, required) — file path within the archive
  - **content** (string, required) — file content (text)

## Options

- `--stdin` — read JSON from stdin (required)
- `--out <file>` — write ZIP to file (default: outputs base64 JSON to stdout)

## Output

- With `--out`: writes .zip file, prints `{ ok, file, size, entries }` JSON
- Without `--out`: prints `{ base64, size, entries }` JSON
