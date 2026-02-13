# ai-skills

[Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) that produce artifacts AI models can't generate from text alone.

```typescript
import { skills } from "ai-skills";

const qr = skills.generateQrCode({ data: "https://example.com" });       // → SVG
const pdf = skills.buildPdf({ title: "Report", body: ["Hello."] });       // → { base64, pages }
const csv = skills.buildSpreadsheet({ headers: ["A"], rows: [["1"]] });   // → CSV string
const ics = skills.generateIcal({ events: [{ summary: "Meeting",
              start: "2025-03-15T14:00:00", end: "2025-03-15T15:00:00" }] }); // → .ics string
const svg = skills.generateChart({ type: "bar", data: { Q1: 100, Q2: 200 } }); // → SVG
```

## The rule

**A skill belongs here if and only if it produces an output that an AI model cannot reliably generate from its text/token stream.**

This means:

| Belongs here | Does NOT belong here |
|-------------|---------------------|
| Binary/structured file formats (PDF, XLSX) | Text analysis (summarization, sentiment) |
| Visual output (SVG charts, QR codes, barcodes) | Text generation (emails, SQL, code) |
| Strict-spec formats where one wrong byte = broken (iCal, vCard) | JSON/text transformation (parsing, querying) |
| Deterministic computation baked into a format (CSV formulas) | Anything the model already does well natively |

If Claude can do it by just responding with text, it's not a skill — it's a prompt.

## Skills

| Function | Artifact | Why models can't |
|----------|---------|-----------------|
| `skills.generateQrCode({ data })` | SVG | Pixel-precise 2D barcode encoding |
| `skills.buildPdf({ title, body })` | PDF (base64) | Binary format with object trees and xref tables |
| `skills.buildSpreadsheet({ headers, rows })` | CSV/TSV | RFC 4180 escaping + formula computation |
| `skills.generateIcal({ events })` | .ics | RFC 5545 spec (recurrence rules, VALARM, TZID) |
| `skills.generateChart({ type, data })` | SVG | Visual rendering of data |

All: synchronous, fully typed, zero external dependencies.

## Install

```bash
npm install ai-skills
```

## API reference

### `skills.generateQrCode(input)`

```typescript
skills.generateQrCode({ data: "https://example.com", size: 256, ecl: "M", fg: "#000", bg: "#fff" })
```

Returns SVG string. Options: `data` (required), `size` (px), `ecl` (L/M/Q/H), `fg`/`bg` (hex).

### `skills.buildPdf(input)`

```typescript
skills.buildPdf({
  title: "Report", author: "Finance", date: "2025-01-15",
  body: ["Paragraph.", { heading: "Section" }, { list: ["A", "B"] },
         { table: { headers: ["X", "Y"], rows: [["1", "2"]] } }],
  footer: "Page {page}", pageSize: "letter",
})
// → { base64: "...", size: 1234, pages: 1 }
```

### `skills.buildSpreadsheet(input)`

```typescript
skills.buildSpreadsheet({
  headers: ["Name", "Q1", "Q2", "Total"],
  rows: [["Alice", 100, 120, "=SUM(B{row}:C{row})"]],
  summary: { Total: "sum" },
  format: "csv", formulas: true, bom: true,
})
```

Returns CSV/TSV string. Supports `format` (csv/tsv), `formulas` ({row} placeholders), `summary` (sum/avg/min/max/count), `bom` (Excel UTF-8).

### `skills.generateIcal(input)`

```typescript
skills.generateIcal({
  events: [{
    summary: "Standup", start: "2025-03-01T09:00:00", end: "2025-03-01T09:15:00",
    timezone: "America/New_York", rrule: "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR",
    organizer: { name: "Alice", email: "alice@co.com" },
    attendees: [{ name: "Bob", email: "bob@co.com", rsvp: true }],
    alarm: { minutes_before: 15 }, status: "CONFIRMED",
  }],
  calendar_name: "Work", method: "REQUEST",
})
```

Returns .ics string. Full RFC 5545: recurrence, timezones, attendees, alarms.

### `skills.generateChart(input)`

```typescript
skills.generateChart({ type: "pie", data: { Chrome: 65, Firefox: 15, Other: 20 }, title: "Share" })
```

Returns SVG string. Types: `bar`/`pie` (key-value object), `line`/`scatter` (number[][] pairs). Options: `title`, `width`, `height`, `colors`.

## Upload to Claude API

Every skill ships as an [Anthropic Agent Skill](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) directory (`SKILL.md` + `scripts/`). Bundle and upload:

```bash
npx ai-skills bundle qr-code
```

## CLI

```bash
npx ai-skills list                          # List skills
npx ai-skills run qr-code --data "hello"    # Run locally
npx ai-skills init my-skill                 # Scaffold new skill
npx ai-skills bundle pdf-builder            # Bundle for Anthropic
```

## Roadmap

### File formats
- **xlsx-builder** — native Excel (.xlsx) with sheets, styling, formulas
- **docx-builder** — Word documents with headings, tables, images
- **zip-archiver** — create .zip archives from multiple files/buffers

### Visual output
- **barcode-generator** — Code128, EAN-13, UPC-A, DataMatrix as SVG
- **svg-to-png** — rasterize SVG to PNG via Canvas
- **diagram-generator** — flowcharts, sequence diagrams, ER diagrams as SVG

### Strict-spec formats
- **vcard-generator** — vCard 3.0/4.0 contact cards
- **rss-builder** — valid RSS/Atom feeds
- **sitemap-builder** — XML sitemaps with proper escaping and schema

### Deterministic computation
- **hash-generator** — SHA-256, HMAC, bcrypt, UUID generation
- **color-converter** — HEX/RGB/HSL/CMYK with exact values, palette generation

## License

MIT
