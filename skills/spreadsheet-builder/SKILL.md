---
name: spreadsheet-builder
description: Generate properly formatted CSV and TSV files with correct escaping, formulas, multi-sheet support, and typed columns. Use when the user needs a spreadsheet, data export, or tabular file output.
---

# Spreadsheet Builder

Generate CSV/TSV files with correct escaping, formulas, and structure. Zero external dependencies.

## Quick start

```bash
echo '{"headers":["Name","Age","Score"],"rows":[["Alice",30,95],["Bob",25,87]]}' | npx tsx scripts/build.ts --stdin
npx tsx scripts/build.ts --stdin --format tsv --out report.tsv < data.json
npx tsx scripts/build.ts --stdin --formulas --out report.csv < data.json
```

## Input format (JSON)

```json
{
  "sheets": [
    {
      "name": "Sales",
      "headers": ["Region", "Q1", "Q2", "Q3", "Q4", "Total"],
      "rows": [
        ["US", 100, 120, 130, 110, "=SUM(B{row}:E{row})"],
        ["EU", 80, 90, 95, 85, "=SUM(B{row}:E{row})"]
      ],
      "summary": { "Q1": "sum", "Q2": "sum", "Total": "sum" }
    }
  ]
}
```

Single-sheet shorthand (omit `sheets` wrapper):
```json
{ "headers": ["Name", "Age"], "rows": [["Alice", 30], ["Bob", 25]] }
```

## Options

- `--stdin` — read JSON from stdin (required)
- `--format csv|tsv` — output format (default: csv)
- `--out <file>` — write to file (default: stdout)
- `--formulas` — process `=SUM`, `=AVERAGE`, `{row}` placeholders
- `--bom` — prepend UTF-8 BOM (helps Excel open CSV correctly)

## Features

- Proper RFC 4180 CSV escaping (quotes fields containing commas, quotes, newlines)
- Formula support: `=SUM(B{row}:E{row})` with `{row}` replaced by actual row number
- Summary rows: `"sum"`, `"avg"`, `"min"`, `"max"`, `"count"` computed from column data
- Multi-sheet: outputs multiple sections separated by blank lines with sheet name headers

## Output

CSV/TSV text to stdout, or file with `--out`.
