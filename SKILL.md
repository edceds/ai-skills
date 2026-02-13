---
name: ai-skills
description: Generate artifacts AI models can't produce from text alone — QR codes (SVG), PDFs, spreadsheets (CSV/TSV), charts (SVG), and iCalendar (.ics) files. Use when the user needs any of these file types.
---

# ai-skills

Run any skill with one command:

```bash
npx tsx scripts/run.ts <skill> '<json>'
```

## Skills

### qr-code → SVG

```bash
npx tsx scripts/run.ts qr-code '{"data":"https://example.com"}'
```

Input: `data` (required), `size` (px), `ecl` (L/M/Q/H), `fg` (hex), `bg` (hex).
Output: SVG to stdout.

### pdf-builder → PDF

```bash
npx tsx scripts/run.ts pdf-builder '{"title":"Report","body":["Hello world."]}'
```

Input: `title`, `author`, `date`, `body` (array of strings, `{"heading":"..."}`, `{"table":{"headers":[...],"rows":[...]}}`, `{"list":[...]}`), `footer` (`{page}` placeholder), `pageSize` (letter/a4).
Output: `{"base64":"...","size":1234,"pages":1}` JSON to stdout.

### spreadsheet-builder → CSV/TSV

```bash
npx tsx scripts/run.ts spreadsheet-builder '{"headers":["Name","Age"],"rows":[["Alice",30],["Bob",25]]}'
```

Input: `headers` (string[]), `rows` ((string|number|null)[][]), `summary` (column → sum/avg/min/max/count), `format` (csv/tsv), `formulas` (bool), `bom` (bool).
Output: CSV/TSV to stdout.

### chart-generator → SVG

```bash
npx tsx scripts/run.ts chart-generator '{"type":"bar","data":{"Q1":100,"Q2":200},"title":"Revenue"}'
```

Input: `type` (bar/line/pie/scatter), `data` (object for bar/pie, number[][] for line/scatter), `title`, `width` (px), `height` (px), `colors` (hex[]).
Output: SVG to stdout.

### ical-generator → .ics

```bash
npx tsx scripts/run.ts ical-generator '{"events":[{"summary":"Meeting","start":"2025-03-15T14:00:00","end":"2025-03-15T15:00:00"}]}'
```

Input: `events` (array with `summary`, `start`, `end`, `description`, `location`, `timezone`, `organizer` {name,email}, `attendees` [{name,email,rsvp}], `alarm` {minutes_before}, `rrule`, `status`, `url`), `calendar_name`, `method`.
Output: .ics text to stdout.

## Saving to file

Any skill supports `"out":"filename.ext"` in the JSON:

```bash
npx tsx scripts/run.ts qr-code '{"data":"hello","out":"qr.svg"}'
npx tsx scripts/run.ts pdf-builder '{"title":"Report","body":["Hello."],"out":"report.pdf"}'
```

## List skills

```bash
npx tsx scripts/run.ts list
```
