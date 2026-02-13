import { readFileSync } from "node:fs";

// --- CSV Parser ---
function parseCsv(raw: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = raw.trim().split(/\r?\n/);
  if (lines.length === 0) throw new Error("Empty CSV");
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = values[i] ?? ""));
    return row;
  });
  return { headers, rows };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

// --- Stats ---
function isNumeric(v: string): boolean {
  return v !== "" && !isNaN(Number(v));
}

function computeStats(headers: string[], rows: Record<string, string>[]) {
  const stats: Record<string, any> = {};
  for (const col of headers) {
    const values = rows.map((r) => r[col]);
    const nonEmpty = values.filter((v) => v !== "");
    const nums = nonEmpty.filter(isNumeric).map(Number);
    const unique = new Set(nonEmpty);

    const colStats: Record<string, any> = {
      count: values.length,
      nulls: values.length - nonEmpty.length,
      unique: unique.size,
    };

    if (nums.length > 0) {
      nums.sort((a, b) => a - b);
      const sum = nums.reduce((a, b) => a + b, 0);
      const mean = sum / nums.length;
      const median =
        nums.length % 2 === 0
          ? (nums[nums.length / 2 - 1] + nums[nums.length / 2]) / 2
          : nums[Math.floor(nums.length / 2)];
      const variance = nums.reduce((acc, v) => acc + (v - mean) ** 2, 0) / nums.length;
      const stddev = Math.sqrt(variance);

      colStats.min = nums[0];
      colStats.max = nums[nums.length - 1];
      colStats.mean = Math.round(mean * 1000) / 1000;
      colStats.median = median;
      colStats.stddev = Math.round(stddev * 1000) / 1000;
    } else {
      colStats.type = "string";
      colStats.sample = [...unique].slice(0, 5);
    }
    stats[col] = colStats;
  }
  return stats;
}

// --- Filter ---
function parseCondition(cond: string): (row: Record<string, string>) => boolean {
  const ops = [">=", "<=", "!=", "==", ">", "<"] as const;
  for (const op of ops) {
    const idx = cond.indexOf(op);
    if (idx === -1) continue;
    const field = cond.slice(0, idx).trim();
    const value = cond.slice(idx + op.length).trim();
    return (row) => {
      const rv = row[field] ?? "";
      const numRv = Number(rv);
      const numVal = Number(value);
      const useNum = isNumeric(rv) && isNumeric(value);
      switch (op) {
        case ">":  return useNum ? numRv > numVal : rv > value;
        case "<":  return useNum ? numRv < numVal : rv < value;
        case ">=": return useNum ? numRv >= numVal : rv >= value;
        case "<=": return useNum ? numRv <= numVal : rv <= value;
        case "==": return rv === value;
        case "!=": return rv !== value;
      }
    };
  }
  throw new Error(`Invalid condition: ${cond}`);
}

function filterRows(rows: Record<string, string>[], conditions: string[]): Record<string, string>[] {
  const fns = conditions.map(parseCondition);
  return rows.filter((row) => fns.every((fn) => fn(row)));
}

// --- Aggregate ---
type AggFn = "count" | "sum" | "mean" | "min" | "max";

function aggregate(
  rows: Record<string, string>[],
  groupBy: string,
  aggs: { column: string; fn: AggFn }[]
) {
  const groups = new Map<string, Record<string, string>[]>();
  for (const row of rows) {
    const key = row[groupBy] ?? "(null)";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const result: Record<string, any>[] = [];
  for (const [key, groupRows] of groups) {
    const entry: Record<string, any> = { [groupBy]: key };
    for (const { column, fn } of aggs) {
      const vals = groupRows.map((r) => r[column]).filter(isNumeric).map(Number);
      switch (fn) {
        case "count": entry[`${column}_count`] = groupRows.length; break;
        case "sum":   entry[`${column}_sum`] = vals.reduce((a, b) => a + b, 0); break;
        case "mean":  entry[`${column}_mean`] = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 1000) / 1000 : null; break;
        case "min":   entry[`${column}_min`] = vals.length ? Math.min(...vals) : null; break;
        case "max":   entry[`${column}_max`] = vals.length ? Math.max(...vals) : null; break;
      }
    }
    result.push(entry);
  }
  return result;
}

// --- CLI ---
function main() {
  const args = process.argv.slice(2);
  const op = args[0];
  if (!op || !["stats", "filter", "aggregate"].includes(op)) {
    console.error("Usage: analyze.ts <stats|filter|aggregate> [options]");
    process.exit(1);
  }

  // Read input
  let csvText: string;
  const fileIdx = args.indexOf("--file");
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    csvText = readFileSync(args[fileIdx + 1], "utf-8");
  } else if (args.includes("--stdin")) {
    csvText = readFileSync(0, "utf-8");
  } else {
    console.error("Provide --file <path> or --stdin");
    process.exit(1);
  }

  const { headers, rows } = parseCsv(csvText);

  switch (op) {
    case "stats": {
      console.log(JSON.stringify(computeStats(headers, rows), null, 2));
      break;
    }
    case "filter": {
      const conditions: string[] = [];
      for (let i = 0; i < args.length; i++) {
        if (args[i] === "--where" && args[i + 1]) conditions.push(args[i + 1]);
      }
      if (conditions.length === 0) {
        console.error("filter requires at least one --where condition");
        process.exit(1);
      }
      const filtered = filterRows(rows, conditions);
      console.log(JSON.stringify({ count: filtered.length, rows: filtered }, null, 2));
      break;
    }
    case "aggregate": {
      const gbIdx = args.indexOf("--group-by");
      const groupBy = gbIdx !== -1 ? args[gbIdx + 1] : undefined;
      if (!groupBy) {
        console.error("aggregate requires --group-by <column>");
        process.exit(1);
      }
      const aggs: { column: string; fn: AggFn }[] = [];
      for (let i = 0; i < args.length; i++) {
        if (args[i] === "--agg" && args[i + 1]) {
          const [column, fn] = args[i + 1].split(":");
          aggs.push({ column, fn: fn as AggFn });
        }
      }
      if (aggs.length === 0) {
        console.error('aggregate requires --agg "column:fn"');
        process.exit(1);
      }
      console.log(JSON.stringify(aggregate(rows, groupBy, aggs), null, 2));
      break;
    }
  }
}

main();
