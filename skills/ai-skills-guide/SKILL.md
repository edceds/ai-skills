---
name: ai-skills-guide
description: Run any ai-skills skill (QR codes, PDFs, spreadsheets, charts, calendars, vCards, barcodes, WAV audio, hashes, ZIP archives) with a single command. Routes to the right skill automatically.
---

# ai-skills guide

Entry point for the ai-skills project. Run any skill with one command using JSON input.

## Run any skill

```bash
npx tsx scripts/run.ts <skill-name> '<json-input>'
npx tsx scripts/run.ts <skill-name> --stdin   # read JSON from stdin
npx tsx scripts/run.ts list                   # list all skills
```

## Available skills and their JSON input

### qr-code → SVG

```bash
npx tsx scripts/run.ts qr-code '{"data":"https://example.com","size":256,"ecl":"M"}'
```

Input: `data` (required), `size` (px), `ecl` (L/M/Q/H), `fg` (hex), `bg` (hex).
Output: SVG to stdout.

### pdf-builder → PDF

```bash
npx tsx scripts/run.ts pdf-builder '{"title":"Report","body":["Paragraph."]}'
```

Input: `title`, `author`, `date`, `body` (array of strings, `{"heading":"..."}`, `{"table":{"headers":[...],"rows":[...]}}`, `{"list":[...]}`), `footer`, `pageSize` (letter/a4).
Output: `{"base64":"...","size":1234,"pages":1}`.

### spreadsheet-builder → CSV/TSV

```bash
npx tsx scripts/run.ts spreadsheet-builder '{"headers":["Name","Age"],"rows":[["Alice",30]]}'
```

Input: `headers`, `rows`, `summary` (column → sum/avg/min/max/count), `format` (csv/tsv), `formulas` (bool), `bom` (bool).
Output: CSV/TSV to stdout.

### chart-generator → SVG

```bash
npx tsx scripts/run.ts chart-generator '{"type":"bar","data":{"Q1":100,"Q2":200},"title":"Revenue"}'
```

Input: `type` (bar/line/pie/scatter), `data`, `title`, `width`, `height`, `colors`.
Output: SVG to stdout.

### ical-generator → .ics

```bash
npx tsx scripts/run.ts ical-generator '{"events":[{"summary":"Meeting","start":"2025-03-15T14:00:00","end":"2025-03-15T15:00:00"}]}'
```

Input: `events` (array with `summary`, `start`, `end`, optional: `description`, `location`, `timezone`, `organizer`, `attendees`, `alarm`, `rrule`, `status`, `url`), `calendar_name`, `method`.
Output: .ics text to stdout.

### vcard-generator → .vcf

```bash
npx tsx scripts/run.ts vcard-generator '{"name":{"given":"Alice","family":"Smith"},"email":"alice@example.com"}'
```

Input: `name` ({given, family, prefix?, suffix?}), `org`, `title`, `email`, `phone`, `address` ({street, city, state, zip, country}), `url`, `note`.
Output: .vcf text to stdout.

### barcode-generator → SVG

```bash
npx tsx scripts/run.ts barcode-generator '{"data":"ABC-12345"}'
```

Input: `data` (required), `width` (px), `height` (px), `show_text` (bool).
Output: SVG to stdout.

### wav-generator → WAV

```bash
npx tsx scripts/run.ts wav-generator '{"frequency":440,"duration":1.0}'
```

Input: `frequency` (Hz), `duration` (seconds), `sample_rate`, `volume` (0–1), `waveform` (sine/square/sawtooth).
Output: `{"base64":"...","size":...,"duration":...,"frequency":...}`.

### hash-generator → hash string

```bash
npx tsx scripts/run.ts hash-generator '{"data":"hello world","algorithm":"sha256"}'
```

Input: `data` (required), `algorithm` (sha256/sha512/md5/sha1), `encoding` (hex/base64), `hmac_key`.
Output: `{"hash":"...","algorithm":"...","encoding":"...","hmac":false}`.

### zip-archive → ZIP

```bash
npx tsx scripts/run.ts zip-archive '{"files":[{"name":"hello.txt","content":"Hello world"}]}'
```

Input: `files` (array of {name, content}).
Output: `{"base64":"...","size":...,"entries":...}`.
