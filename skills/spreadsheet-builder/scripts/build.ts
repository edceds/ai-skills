import { readFileSync, writeFileSync } from "node:fs";

interface SheetDef {
  name?: string;
  headers: string[];
  rows: (string | number | null)[][];
  summary?: Record<string, "sum" | "avg" | "min" | "max" | "count">;
}

interface SpreadsheetInput {
  sheets?: SheetDef[];
  headers?: string[];
  rows?: (string | number | null)[][];
  summary?: Record<string, "sum" | "avg" | "min" | "max" | "count">;
}

// ─── CSV/TSV formatting (RFC 4180) ──────────────────────────────────────────

function escapeField(value: string | number | null, sep: string): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(sep) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function formatRow(values: (string | number | null)[], sep: string): string {
  return values.map((v) => escapeField(v, sep)).join(sep);
}

// ─── Formula processing ─────────────────────────────────────────────────────

function processFormulas(rows: (string | number | null)[][], startRow: number): (string | number | null)[][] {
  return rows.map((row, ri) => {
    const actualRow = startRow + ri;
    return row.map((cell) => {
      if (typeof cell === "string" && cell.startsWith("=")) {
        return cell.replace(/\{row\}/g, String(actualRow));
      }
      return cell;
    });
  });
}

// ─── Summary computation ────────────────────────────────────────────────────

function computeSummary(headers: string[], rows: (string | number | null)[][], summary: Record<string, string>): (string | number | null)[] {
  return headers.map((h) => {
    const fn = summary[h];
    if (!fn) return "";
    const colIdx = headers.indexOf(h);
    const nums = rows.map((r) => r[colIdx]).filter((v): v is number => typeof v === "number");

    switch (fn) {
      case "sum": return nums.reduce((a, b) => a + b, 0);
      case "avg": return nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : 0;
      case "min": return nums.length ? Math.min(...nums) : 0;
      case "max": return nums.length ? Math.max(...nums) : 0;
      case "count": return nums.length;
      default: return "";
    }
  });
}

// ─── Build spreadsheet ──────────────────────────────────────────────────────

function buildSpreadsheet(
  input: SpreadsheetInput,
  format: "csv" | "tsv",
  processFormulasFlag: boolean,
  bom: boolean,
): string {
  const sep = format === "tsv" ? "\t" : ",";
  const sheets: SheetDef[] = input.sheets ?? [{
    headers: input.headers ?? [],
    rows: input.rows ?? [],
    summary: input.summary,
  }];

  const sections: string[] = [];

  for (const sheet of sheets) {
    const lines: string[] = [];

    // Sheet header (for multi-sheet)
    if (sheets.length > 1 && sheet.name) {
      lines.push(escapeField(`# ${sheet.name}`, sep));
    }

    // Column headers
    lines.push(formatRow(sheet.headers, sep));

    // Data rows (formulas start at row 2 for spreadsheet apps: header=1)
    const startRow = 2;
    const dataRows = processFormulasFlag
      ? processFormulas(sheet.rows, startRow)
      : sheet.rows;

    for (const row of dataRows) {
      lines.push(formatRow(row, sep));
    }

    // Summary row
    if (sheet.summary && Object.keys(sheet.summary).length > 0) {
      const summaryRow = computeSummary(sheet.headers, sheet.rows, sheet.summary);
      lines.push(formatRow(summaryRow, sep));
    }

    sections.push(lines.join("\n"));
  }

  const content = sections.join("\n\n");
  return bom ? "\uFEFF" + content : content;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  if (!args.includes("--stdin")) {
    console.error("Usage: build.ts --stdin [--format csv|tsv] [--out file] [--formulas] [--bom]");
    process.exit(1);
  }

  const input: SpreadsheetInput = JSON.parse(readFileSync(0, "utf-8"));
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  const format = (get("--format") ?? "csv") as "csv" | "tsv";
  const processFormulasFlag = args.includes("--formulas");
  const bom = args.includes("--bom");

  const output = buildSpreadsheet(input, format, processFormulasFlag, bom);

  const out = get("--out");
  if (out) {
    writeFileSync(out, output, "utf-8");
    console.log(JSON.stringify({ ok: true, file: out, size: output.length }));
  } else {
    process.stdout.write(output + "\n");
  }
}

main();
