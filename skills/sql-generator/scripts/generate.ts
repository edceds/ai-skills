import { readFileSync } from "node:fs";

type Dialect = "postgres" | "mysql" | "sqlite";

interface SchemaTable {
  columns: Record<string, string>;
  primary_key?: string;
  foreign_keys?: Record<string, string>;
}

type Schema = Record<string, SchemaTable>;

interface QueryResult {
  sql: string;
  explanation: string;
  tables_used: string[];
  operation: string;
}

// --- Keywords → SQL mapping ---

const AGG_KEYWORDS: Record<string, string> = {
  "count": "COUNT",
  "total": "SUM",
  "sum": "SUM",
  "average": "AVG",
  "avg": "AVG",
  "mean": "AVG",
  "max": "MAX",
  "maximum": "MAX",
  "min": "MIN",
  "minimum": "MIN",
};

const ORDER_KEYWORDS: Record<string, string> = {
  "sorted by": "ORDER BY",
  "sort by": "ORDER BY",
  "order by": "ORDER BY",
  "ordered by": "ORDER BY",
  "ascending": "ASC",
  "descending": "DESC",
  "asc": "ASC",
  "desc": "DESC",
  "newest": "DESC",
  "oldest": "ASC",
  "highest": "DESC",
  "lowest": "ASC",
  "latest": "DESC",
  "earliest": "ASC",
};

const LIMIT_KEYWORDS = ["top", "first", "limit", "only"];

function findTable(schema: Schema, word: string): string | null {
  const lower = word.toLowerCase();
  // Exact match
  if (schema[lower]) return lower;
  // Plural/singular heuristics
  if (schema[lower + "s"]) return lower + "s";
  if (lower.endsWith("s") && schema[lower.slice(0, -1)]) return lower.slice(0, -1);
  // Partial match
  for (const table of Object.keys(schema)) {
    if (table.includes(lower) || lower.includes(table)) return table;
  }
  return null;
}

function findColumn(schema: Schema, tables: string[], word: string): { table: string; column: string } | null {
  const lower = word.toLowerCase().replace(/[^a-z0-9_]/g, "");
  for (const t of tables) {
    const cols = Object.keys(schema[t].columns);
    // Exact
    if (cols.includes(lower)) return { table: t, column: lower };
    // Underscore variations: "created at" → "created_at"
    const underscored = lower.replace(/\s+/g, "_");
    if (cols.includes(underscored)) return { table: t, column: underscored };
    // Partial
    for (const col of cols) {
      if (col.includes(lower) || lower.includes(col)) return { table: t, column: col };
    }
  }
  return null;
}

function detectTables(schema: Schema, query: string): string[] {
  const words = query.toLowerCase().split(/\s+/);
  const tables = new Set<string>();

  for (const word of words) {
    const t = findTable(schema, word);
    if (t) tables.add(t);
  }

  // If no tables found, use all
  if (tables.size === 0) return Object.keys(schema);

  // Add joined tables via foreign keys
  for (const t of [...tables]) {
    const fks = schema[t]?.foreign_keys ?? {};
    for (const ref of Object.values(fks)) {
      const refTable = ref.split(".")[0];
      if (schema[refTable]) tables.add(refTable);
    }
  }

  return [...tables];
}

function generateSelect(schema: Schema, query: string, dialect: Dialect): QueryResult {
  const lower = query.toLowerCase();
  const tables = detectTables(schema, query);
  const mainTable = tables[0];
  const parts: string[] = [];
  const explanations: string[] = [];

  // Detect aggregation
  let agg: string | null = null;
  let aggCol: string | null = null;
  for (const [keyword, fn] of Object.entries(AGG_KEYWORDS)) {
    if (lower.includes(keyword)) {
      agg = fn;
      // Find what column to aggregate
      const afterAgg = lower.split(keyword)[1] ?? "";
      const words = afterAgg.trim().split(/\s+/);
      for (const w of words) {
        const found = findColumn(schema, tables, w);
        if (found) { aggCol = `${found.table}.${found.column}`; break; }
      }
      if (!aggCol) {
        // Default: count(*)
        agg = "COUNT";
        aggCol = "*";
      }
      break;
    }
  }

  // Detect GROUP BY (look for "by <column>" patterns)
  let groupBy: string | null = null;
  const groupMatch = lower.match(/(?:group\s+by|by)\s+(\w+)/);
  if (groupMatch && agg) {
    const found = findColumn(schema, tables, groupMatch[1]);
    if (found) groupBy = `${found.table}.${found.column}`;
  }

  // SELECT clause
  if (agg && aggCol) {
    if (groupBy) {
      parts.push(`SELECT ${groupBy}, ${agg}(${aggCol}) AS ${agg.toLowerCase()}_result`);
    } else {
      parts.push(`SELECT ${agg}(${aggCol}) AS result`);
    }
    explanations.push(`${agg} aggregation on ${aggCol}`);
  } else {
    parts.push(`SELECT ${mainTable}.*`);
  }

  // FROM + JOINs
  parts.push(`FROM ${mainTable}`);
  for (let i = 1; i < tables.length; i++) {
    const t = tables[i];
    // Find FK relationship
    const mainFks = schema[mainTable]?.foreign_keys ?? {};
    const otherFks = schema[t]?.foreign_keys ?? {};
    let joinCond: string | null = null;

    for (const [col, ref] of Object.entries(mainFks)) {
      if (ref.startsWith(t + ".")) {
        joinCond = `${mainTable}.${col} = ${ref}`;
        break;
      }
    }
    if (!joinCond) {
      for (const [col, ref] of Object.entries(otherFks)) {
        if (ref.startsWith(mainTable + ".")) {
          joinCond = `${t}.${col} = ${ref}`;
          break;
        }
      }
    }
    if (joinCond) {
      parts.push(`JOIN ${t} ON ${joinCond}`);
      explanations.push(`joining ${t}`);
    }
  }

  // WHERE conditions
  const conditions: string[] = [];

  // Semantic synonyms: "older than" → age >, "newer than" → date >, etc.
  const SEMANTIC: { re: RegExp; column: string; op: string }[] = [
    { re: /older than\s+(\d+)/gi, column: "age", op: ">" },
    { re: /younger than\s+(\d+)/gi, column: "age", op: "<" },
    { re: /cheaper than\s+(\d+)/gi, column: "price", op: "<" },
    { re: /more expensive than\s+(\d+)/gi, column: "price", op: ">" },
  ];

  for (const { re, column, op } of SEMANTIC) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower)) !== null) {
      const col = findColumn(schema, tables, column);
      if (col) {
        conditions.push(`${col.table}.${col.column} ${op} ${m[1]}`);
        explanations.push(`where ${col.column} ${op} ${m[1]}`);
      }
    }
  }

  // Direct comparisons: "age > 30", "amount greater than 100"
  const compPatterns = [
    { re: /(\w+)\s*(?:>|greater than|more than|over|above)\s*(\d+)/gi, op: ">" },
    { re: /(\w+)\s*(?:<|less than|fewer than|under|below)\s*(\d+)/gi, op: "<" },
    { re: /(\w+)\s*(?:>=|at least)\s*(\d+)/gi, op: ">=" },
    { re: /(\w+)\s*(?:<=|at most)\s*(\d+)/gi, op: "<=" },
    { re: /(\w+)\s*(?:=|equals?|is)\s*(\d+)/gi, op: "=" },
  ];

  for (const { re, op } of compPatterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower)) !== null) {
      const col = findColumn(schema, tables, m[1]);
      if (col) {
        // Avoid duplicates from semantic patterns
        const cond = `${col.table}.${col.column} ${op} ${m[2]}`;
        if (!conditions.includes(cond)) {
          conditions.push(cond);
          explanations.push(`where ${col.column} ${op} ${m[2]}`);
        }
      }
    }
  }

  // String equality: "status is active", "where name = 'John'"
  const eqStrMatch = lower.match(/(\w+)\s+(?:is|=|equals?)\s+['"]?([a-z]+)['"]?/g);
  if (eqStrMatch) {
    for (const match of eqStrMatch) {
      const parts2 = match.match(/(\w+)\s+(?:is|=|equals?)\s+['"]?([a-z]+)['"]?/);
      if (parts2) {
        const col = findColumn(schema, tables, parts2[1]);
        const val = parts2[2];
        if (col && !["than", "by", "to", "the", "and", "or", "not", "null"].includes(val)) {
          conditions.push(`${col.table}.${col.column} = '${val}'`);
          explanations.push(`where ${col.column} = '${val}'`);
        }
      }
    }
  }

  // Date filters: "in 2024", "this year", "last month"
  const yearMatch = lower.match(/(?:in|for|during)\s+(\d{4})/);
  if (yearMatch) {
    // Find a date column
    for (const t of tables) {
      for (const [col, type] of Object.entries(schema[t].columns)) {
        if (type.includes("date") || type.includes("timestamp") || col.includes("date") || col.includes("created") || col.includes("time")) {
          if (dialect === "postgres") {
            conditions.push(`EXTRACT(YEAR FROM ${t}.${col}) = ${yearMatch[1]}`);
          } else if (dialect === "mysql") {
            conditions.push(`YEAR(${t}.${col}) = ${yearMatch[1]}`);
          } else {
            conditions.push(`strftime('%Y', ${t}.${col}) = '${yearMatch[1]}'`);
          }
          explanations.push(`in year ${yearMatch[1]}`);
          break;
        }
      }
      break;
    }
  }

  if (conditions.length > 0) {
    parts.push(`WHERE ${conditions.join(" AND ")}`);
  }

  // GROUP BY
  if (groupBy) {
    parts.push(`GROUP BY ${groupBy}`);
    explanations.push(`grouped by ${groupBy.split(".")[1]}`);

    // Detect month grouping
    if (lower.includes("month")) {
      for (const t of tables) {
        for (const [col, type] of Object.entries(schema[t].columns)) {
          if (type.includes("date") || type.includes("timestamp") || col.includes("date") || col.includes("created")) {
            const monthExpr = dialect === "postgres"
              ? `DATE_TRUNC('month', ${t}.${col})`
              : dialect === "mysql"
              ? `DATE_FORMAT(${t}.${col}, '%Y-%m')`
              : `strftime('%Y-%m', ${t}.${col})`;

            // Replace groupBy in SELECT and GROUP BY
            parts[0] = parts[0].replace(groupBy, `${monthExpr} AS month`);
            parts[parts.length - 1] = `GROUP BY ${monthExpr}`;
            break;
          }
        }
      }
    }
  }

  // ORDER BY
  let orderCol: string | null = null;
  let orderDir = "ASC";
  for (const [keyword, value] of Object.entries(ORDER_KEYWORDS)) {
    const idx = lower.indexOf(keyword);
    if (idx === -1) continue;
    if (value === "ORDER BY") {
      const after = lower.slice(idx + keyword.length).trim().split(/\s+/);
      for (const w of after) {
        if (ORDER_KEYWORDS[w]) { orderDir = ORDER_KEYWORDS[w]; continue; }
        const col = findColumn(schema, tables, w);
        if (col) { orderCol = `${col.table}.${col.column}`; break; }
      }
    } else {
      orderDir = value;
    }
  }
  if (orderCol) {
    parts.push(`ORDER BY ${orderCol} ${orderDir}`);
    explanations.push(`sorted by ${orderCol.split(".")[1]} ${orderDir}`);
  }

  // LIMIT
  for (const kw of LIMIT_KEYWORDS) {
    const limitMatch = lower.match(new RegExp(`${kw}\\s+(\\d+)`));
    if (limitMatch) {
      parts.push(`LIMIT ${limitMatch[1]}`);
      explanations.push(`limited to ${limitMatch[1]} results`);
      break;
    }
  }

  return {
    sql: parts.join("\n") + ";",
    explanation: explanations.length > 0 ? explanations.join(", ") : `Select all from ${mainTable}`,
    tables_used: tables,
    operation: "SELECT",
  };
}

function generateCreateTable(tables: string, dialect: Dialect): QueryResult {
  const defs = tables.split(";").filter(Boolean);
  const sqls: string[] = [];

  for (const def of defs) {
    const match = def.match(/(\w+)\((.+)\)/);
    if (!match) continue;
    const [, name, cols] = match;
    const columns = cols.split(",").map((c) => c.trim());

    const colDefs = columns.map((col) => {
      if (col === "id") {
        return dialect === "postgres" ? "id SERIAL PRIMARY KEY"
          : dialect === "mysql" ? "id INT AUTO_INCREMENT PRIMARY KEY"
          : "id INTEGER PRIMARY KEY AUTOINCREMENT";
      }
      if (col.includes("_id")) return `${col} INT NOT NULL`;
      if (col.includes("email")) return `${col} VARCHAR(255)`;
      if (col.includes("name") || col.includes("title") || col.includes("status")) return `${col} VARCHAR(255)`;
      if (col.includes("amount") || col.includes("price") || col.includes("total")) return `${col} DECIMAL(10,2)`;
      if (col.includes("count") || col.includes("quantity") || col.includes("age")) return `${col} INT`;
      if (col.includes("date") || col.includes("created") || col.includes("updated") || col.includes("_at")) return `${col} TIMESTAMP DEFAULT NOW()`;
      if (col.includes("active") || col.includes("is_")) return `${col} BOOLEAN DEFAULT FALSE`;
      if (col.includes("description") || col.includes("body") || col.includes("content")) return `${col} TEXT`;
      return `${col} VARCHAR(255)`;
    });

    sqls.push(`CREATE TABLE ${name} (\n  ${colDefs.join(",\n  ")}\n);`);
  }

  return {
    sql: sqls.join("\n\n"),
    explanation: `Create ${defs.length} table(s)`,
    tables_used: defs.map((d) => d.match(/(\w+)\(/)?.[1] ?? ""),
    operation: "CREATE TABLE",
  };
}

// --- CLI ---
function main() {
  const args = process.argv.slice(2);

  // Create schema mode
  if (args.includes("--create-schema")) {
    const tablesIdx = args.indexOf("--tables");
    if (tablesIdx === -1 || !args[tablesIdx + 1]) {
      console.error("--create-schema requires --tables");
      process.exit(1);
    }
    const dialectIdx = args.indexOf("--dialect");
    const dialect = (dialectIdx !== -1 ? args[dialectIdx + 1] : "postgres") as Dialect;
    console.log(JSON.stringify(generateCreateTable(args[tablesIdx + 1], dialect), null, 2));
    return;
  }

  // Query mode
  let schema: Schema;
  let query: string;
  let dialect: Dialect = "postgres";

  if (args.includes("--stdin")) {
    const raw = JSON.parse(readFileSync(0, "utf-8"));
    schema = raw.schema;
    query = raw.query;
    dialect = raw.dialect ?? "postgres";
  } else {
    const schemaIdx = args.indexOf("--schema");
    if (schemaIdx === -1 || !args[schemaIdx + 1]) {
      console.error("Usage: generate.ts --schema <file> --query <text>");
      process.exit(1);
    }
    schema = JSON.parse(readFileSync(args[schemaIdx + 1], "utf-8"));

    const queryIdx = args.indexOf("--query");
    if (queryIdx === -1 || !args[queryIdx + 1]) {
      console.error("--query is required");
      process.exit(1);
    }
    query = args[queryIdx + 1];

    const dialectIdx = args.indexOf("--dialect");
    if (dialectIdx !== -1) dialect = args[dialectIdx + 1] as Dialect;
  }

  console.log(JSON.stringify(generateSelect(schema, query, dialect), null, 2));
}

main();
