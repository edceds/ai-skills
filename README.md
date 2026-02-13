# ai-skills

Artifact-producing skills for AI agents. 10 tools that generate files LLMs cannot produce from their token stream: QR codes, PDFs, spreadsheets, calendars, charts, vCards, barcodes, WAV audio, cryptographic hashes, and ZIP archives. Zero external dependencies.

## Connect an agent (MCP)

Add to any MCP-compatible agent (Claude Desktop, Cursor, Cline, etc.):

```json
{ "command": "npx", "args": ["ai-skills"] }
```

The agent gets 10 tools and uses them automatically:

`generate_qr_code` `build_pdf` `build_spreadsheet` `generate_ical` `generate_chart` `generate_vcard` `generate_barcode` `generate_wav` `generate_hash` `create_zip`

## Import as library

```typescript
import { skills } from "ai-skills";

skills.generateQrCode({ data: "https://example.com" })
skills.buildPdf({ title: "Report", body: ["Hello."] })
skills.buildSpreadsheet({ headers: ["A"], rows: [["1"]] })
skills.generateIcal({ events: [{ summary: "Meeting", start: "2025-03-15T14:00:00", end: "2025-03-15T15:00:00" }] })
skills.generateChart({ type: "bar", data: { Q1: 100, Q2: 200 } })
skills.generateVCard({ name: { given: "Alice", family: "Smith" }, email: "alice@example.com" })
skills.generateBarcode({ data: "ABC-12345" })
skills.generateWav({ frequency: 440, duration: 1.0 })
skills.generateHash({ data: "hello world" })
skills.createZip({ files: [{ name: "readme.txt", content: "Hello" }] })
```

## Add a skill

Drop a folder into `skills/` with a `SKILL.md` and a `scripts/` directory. The MCP server and library API pick it up automatically. See any existing skill for the format.

## The rule

**A skill belongs here iff it produces output an AI model cannot reliably generate from its token stream.**

Binary/structured formats (PDF, ZIP, WAV), visual output (SVG charts, QR codes, barcodes), strict-spec formats (iCal, vCard), deterministic computation (cryptographic hashes, CRC32). If the model can do it by responding with text, it's not a skill.

## Skills

| Function | Output | Why |
|----------|--------|-----|
| `generateQrCode({ data })` | SVG | Pixel-precise 2D barcode encoding |
| `buildPdf({ title, body })` | PDF (base64) | Binary format with xref tables |
| `buildSpreadsheet({ headers, rows })` | CSV/TSV | RFC 4180 escaping + formula computation |
| `generateIcal({ events })` | .ics | RFC 5545 (recurrence, VALARM, TZID) |
| `generateChart({ type, data })` | SVG | Data visualization rendering |
| `generateVCard({ name })` | .vcf | RFC 6350 (line folding, structured fields) |
| `generateBarcode({ data })` | SVG | Code128 symbology + check digit |
| `generateWav({ frequency, duration })` | WAV (base64) | Binary PCM audio with headers |
| `generateHash({ data })` | hash string | Deterministic cryptographic computation |
| `createZip({ files })` | ZIP (base64) | Binary archive with CRC32 |

## Agent discovery

- [llms.txt](llms.txt) — summary for agent discovery
- [llms-full.txt](llms-full.txt) — full API reference

## License

MIT
