---
name: ai-skills-guide
description: Run any ai-skills skill (QR codes, PDFs, spreadsheets, charts, calendars) with a single command. Use when the user needs to generate a QR code, PDF, spreadsheet, chart, or calendar file — route to the right skill automatically.
---

# ai-skills guide

This skill is the entry point for the ai-skills project. It lets you run any skill with one command using JSON input.

## Quick start

```bash
npx tsx scripts/run.ts qr-code '{"data":"https://example.com"}'
npx tsx scripts/run.ts list
```

## Run any skill

Pass the skill name and a JSON object:

```bash
npx tsx scripts/run.ts <skill-name> '<json-input>'
npx tsx scripts/run.ts <skill-name> --stdin   # read JSON from stdin
```

## Available skills and their JSON input

### qr-code → SVG

```bash
npx tsx scripts/run.ts qr-code '{"data":"https://example.com","size":256,"ecl":"M"}'
```

Input: `data` (required), `size` (px), `ecl` (L/M/Q/H), `fg` (hex), `bg` (hex), `out` (file path).
Output: SVG to stdout.

### pdf-builder → PDF

```bash
npx tsx scripts/run.ts pdf-builder '{"title":"Report","body":["Paragraph.","Second paragraph."]}'
```

Input: `title`, `author`, `date`, `body` (array of strings, `{"heading":"..."}`, `{"table":{"headers":[...],"rows":[...]}}`, `{"list":[...]}`), `footer` (`{page}` placeholder), `pageSize` (letter/a4), `out` (file path).
Output: `{"base64":"...","size":1234,"pages":1}` to stdout. With `out`: writes PDF file.

### spreadsheet-builder → CSV/TSV

```bash
npx tsx scripts/run.ts spreadsheet-builder '{"headers":["Name","Age"],"rows":[["Alice",30],["Bob",25]]}'
```

Input: `headers` (string[]), `rows` ((string|number|null)[][]), `summary` (column → sum/avg/min/max/count), `format` (csv/tsv), `formulas` (bool), `bom` (bool), `out` (file path).
Output: CSV/TSV to stdout.

### chart-generator → SVG

```bash
npx tsx scripts/run.ts chart-generator '{"type":"bar","data":{"Q1":100,"Q2":200},"title":"Revenue"}'
```

Input: `type` (bar/line/pie/scatter), `data` (object for bar/pie, number[][] for line/scatter), `title`, `width` (px), `height` (px), `colors` (hex[]), `out` (file path).
Output: SVG to stdout.

### ical-generator → .ics

```bash
npx tsx scripts/run.ts ical-generator '{"events":[{"summary":"Meeting","start":"2025-03-15T14:00:00","end":"2025-03-15T15:00:00"}]}'
```

Input: `events` (array with `summary`, `start`, `end`, `description`, `location`, `timezone`, `organizer` {name,email}, `attendees` [{name,email,rsvp}], `alarm` {minutes_before}, `rrule`, `status`, `url`), `calendar_name`, `method`, `out` (file path).
Output: .ics text to stdout.

## Saving to file

Any skill supports `"out":"filename.ext"` in the JSON to write output to a file instead of stdout:

```bash
npx tsx scripts/run.ts qr-code '{"data":"hello","out":"qr.svg"}'
npx tsx scripts/run.ts pdf-builder '{"title":"Report","body":["Hello."],"out":"report.pdf"}'
```
