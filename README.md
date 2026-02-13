# ai-skills

Artifact-producing [Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) for things AI models can't generate from their token stream: QR codes, PDFs, spreadsheets, calendars, charts. Zero external dependencies.

> Anthropic has built-in skills for `xlsx`, `pptx`, `pdf`, `docx`. This repo covers what they don't: QR encoding, iCalendar (RFC 5545), CSV/TSV with formulas, and SVG chart rendering. All skills also work via MCP or as an npm library — outside Anthropic's container.

## Use it

**From this repo** — run a skill right now:

```bash
npx tsx src/cli.ts run qr-code --data "https://example.com"
npx tsx src/cli.ts list    # see all skills
```

Or import from source:

```typescript
import { skills } from "./src/index.ts";
skills.generateQrCode({ data: "https://example.com" })  // → SVG
```

**Agent reads your link** — share `https://github.com/edceds/ai-skills` in a chat. The agent reads [`llms.txt`](llms.txt) and knows every skill, inputs, and how to call it. Follows [llmstxt.org](https://llmstxt.org/).

**MCP server** — add to Claude Desktop, Cursor, or any MCP-compatible agent:

```json
{ "command": "npx", "args": ["ai-skills", "serve"] }
```

The agent gets 5 tools (`generate_qr_code`, `build_pdf`, `build_spreadsheet`, `generate_ical`, `generate_chart`) and uses them automatically.

**npm library**:

```bash
npm install ai-skills
```

```typescript
import { skills } from "ai-skills";

skills.generateQrCode({ data: "https://example.com" })           // → SVG
skills.buildPdf({ title: "Report", body: ["Hello."] })           // → { base64, size, pages }
skills.buildSpreadsheet({ headers: ["A"], rows: [["1"]] })       // → CSV string
skills.generateIcal({ events: [{ summary: "Meeting",
  start: "2025-03-15T14:00:00", end: "2025-03-15T15:00:00" }] }) // → .ics string
skills.generateChart({ type: "bar", data: { Q1: 100, Q2: 200 } }) // → SVG
```

**Anthropic Skills API** — bundle and upload to use with Claude API containers:

```bash
npx ai-skills bundle qr-code    # generates upload code
```

## Skills

| Function | Output | Why models can't |
|----------|--------|-----------------|
| `generateQrCode({ data })` | SVG | Pixel-precise 2D barcode encoding |
| `buildPdf({ title, body })` | PDF (base64) | Binary format with xref tables |
| `buildSpreadsheet({ headers, rows })` | CSV/TSV | RFC 4180 escaping + formula computation |
| `generateIcal({ events })` | .ics | RFC 5545 (recurrence, VALARM, TZID) |
| `generateChart({ type, data })` | SVG | Data visualization rendering |

## API

### `skills.generateQrCode(input)`

`data` (required), `size` (px, default 256), `ecl` (L/M/Q/H), `fg`/`bg` (hex). Returns SVG string.

### `skills.buildPdf(input)`

`title`, `author`, `date`, `body` (array of strings, `{ heading }`, `{ table }`, `{ list }`), `footer` (`{page}` placeholder), `pageSize` (letter/a4). Returns `{ base64, size, pages }`.

### `skills.buildSpreadsheet(input)`

`headers`, `rows`, `summary` (column → sum/avg/min/max/count), `format` (csv/tsv), `formulas` (bool), `bom` (bool). Returns CSV/TSV string.

### `skills.generateIcal(input)`

`events` (array: `summary`, `start`, `end`, `timezone`, `rrule`, `organizer`, `attendees`, `alarm`, `status`, `url`), `calendar_name`, `method`. Returns .ics string.

### `skills.generateChart(input)`

`type` (bar/line/pie/scatter), `data` (object for bar/pie, number[][] for line/scatter), `title`, `width`, `height`, `colors`. Returns SVG string.

## CLI

```bash
npx ai-skills serve                          # Start MCP server
npx ai-skills list                           # List skills
npx ai-skills run qr-code --data "hello"     # Run locally
npx ai-skills init my-skill                  # Scaffold new skill
npx ai-skills bundle pdf-builder             # Bundle for Anthropic
```

## The rule

**A skill belongs here iff it produces output an AI model cannot reliably generate from its token stream.**

Binary/structured formats (PDF, XLSX), visual output (SVG charts, QR codes), strict-spec formats where one wrong byte breaks it (iCal, vCard), deterministic computation baked into a format (CSV formulas). If the model can do it by responding with text, it's not a skill.

## License

MIT
