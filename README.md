# ai-skills

[Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) that produce artifacts AI models can't generate from text alone — file formats, visual output, strict specs. One function call each.

```typescript
import { skills } from "ai-skills";

// Generate a QR code → SVG
const qr = skills.generateQrCode({ data: "https://example.com" });

// Generate a PDF document → base64
const pdf = skills.buildPdf({
  title: "Q1 Report",
  body: ["Revenue grew 15%.", { table: { headers: ["Region", "Rev"], rows: [["US", "1.2M"]] } }],
});

// Generate a spreadsheet → CSV text
const csv = skills.buildSpreadsheet({
  headers: ["Name", "Q1", "Q2", "Total"],
  rows: [["Alice", 100, 120, "=SUM(B{row}:C{row})"]],
  formulas: true,
});

// Generate calendar events → .ics text
const ics = skills.generateIcal({
  events: [{ summary: "Kickoff", start: "2025-03-15T14:00:00", end: "2025-03-15T15:00:00",
             attendees: [{ name: "Bob", email: "bob@co.com", rsvp: true }] }],
});

// Generate a chart → SVG
const chart = skills.generateChart({ type: "bar", data: { Q1: 100, Q2: 200 }, title: "Revenue" });
```

## Why these skills

AI models generate text. They can't produce QR codes, PDFs, valid .ics files, or properly escaped CSVs. These skills fill that gap — each one outputs a format the model physically cannot generate from its token stream.

| Skill | What models can't do | What this produces |
|-------|---------------------|-------------------|
| `generateQrCode` | Models can't draw pixel-precise 2D barcodes | Scannable QR code as SVG |
| `buildPdf` | Models can't produce binary PDF format | Valid PDF with text, tables, lists, headers |
| `buildSpreadsheet` | Models mess up CSV escaping, can't compute formulas | RFC 4180 CSV/TSV with formulas and summary rows |
| `generateIcal` | Models frequently get the iCal spec wrong | RFC 5545 .ics with recurrence, attendees, alarms |
| `generateChart` | Models can't output images | SVG bar, line, pie, scatter charts |

All functions are synchronous, fully typed, zero external dependencies.

## Install

```bash
npm install ai-skills
```

## API

### `skills.generateQrCode(input)`

```typescript
skills.generateQrCode({ data: "https://example.com", size: 256, ecl: "M" })
// → SVG string
```

Options: `data` (required), `size` (px, default 256), `ecl` (L/M/Q/H), `fg`/`bg` (hex colors).

### `skills.buildPdf(input)`

```typescript
skills.buildPdf({
  title: "Report", author: "Finance", date: "2025-01-15",
  body: ["Paragraph.", { heading: "Section" }, { list: ["A", "B"] },
         { table: { headers: ["X", "Y"], rows: [["1", "2"]] } }],
  footer: "Page {page}",
})
// → { base64: "...", size: 1234, pages: 1 }
```

### `skills.buildSpreadsheet(input)`

```typescript
skills.buildSpreadsheet({
  headers: ["Name", "Score"],
  rows: [["Alice", 95], ["Bob", 87]],
  summary: { Score: "avg" },
  format: "csv",  // or "tsv"
  formulas: true,  // process =SUM, {row} placeholders
  bom: true,       // UTF-8 BOM for Excel
})
// → CSV string
```

### `skills.generateIcal(input)`

```typescript
skills.generateIcal({
  events: [{
    summary: "Standup", start: "2025-03-01T09:00:00", end: "2025-03-01T09:15:00",
    timezone: "America/New_York",
    rrule: "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR",
    organizer: { name: "Alice", email: "alice@co.com" },
    attendees: [{ name: "Bob", email: "bob@co.com", rsvp: true }],
    alarm: { minutes_before: 15 },
  }],
  calendar_name: "Work", method: "REQUEST",
})
// → .ics string
```

### `skills.generateChart(input)`

```typescript
skills.generateChart({ type: "pie", data: { Chrome: 65, Firefox: 15, Safari: 12, Other: 8 } })
// → SVG string
```

Types: `bar` (key-value), `line` (xy pairs), `pie` (key-value), `scatter` (xy pairs).
Options: `title`, `width`, `height`, `colors`.

## Upload to Claude API

Every skill also works as an [Anthropic Agent Skill](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) for Claude's code execution container:

```bash
npx ai-skills bundle qr-code  # shows upload code
```

## CLI

```bash
npx ai-skills list                          # List skills
npx ai-skills run qr-code --data "hello"    # Run locally
npx ai-skills init my-skill                 # Scaffold new skill
npx ai-skills bundle pdf-builder            # Bundle for Anthropic
```

## Roadmap

- **barcode-generator** — Code128, EAN-13, UPC-A barcodes as SVG
- **xlsx-builder** — native Excel files with multiple sheets and styling
- **vcard-generator** — vCard 3.0/4.0 contact cards
- **svg-to-png** — rasterize SVG to PNG using Canvas

## License

MIT
