import { readFileSync } from "node:fs";

// --- Helpers ---
function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function readStdin(): any {
  return JSON.parse(readFileSync(0, "utf-8"));
}

// --- Query ---
function queryPath(obj: any, path: string): any {
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let current = obj;
  for (const part of parts) {
    if (current == null) return null;
    current = current[part];
  }
  return current ?? null;
}

// --- Flatten ---
function flatten(obj: any, prefix = ""): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flatten(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

// --- Unflatten ---
function unflatten(obj: Record<string, any>): any {
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const parts = key.split(".");
    let current = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) current[part] = {};
      current = current[part];
    }
    current[parts[parts.length - 1]] = value;
  }
  return result;
}

// --- Validate ---
function validate(data: any, schema: Record<string, string>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const [key, expectedType] of Object.entries(schema)) {
    const optional = key.endsWith("?");
    const fieldName = optional ? key.slice(0, -1) : key;
    const value = data[fieldName];

    if (value === undefined || value === null) {
      if (!optional) errors.push(`Missing required field: ${fieldName}`);
      continue;
    }

    const actualType = Array.isArray(value) ? "array" : typeof value;
    if (actualType !== expectedType) {
      errors.push(`Field "${fieldName}": expected ${expectedType}, got ${actualType}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

// --- Diff ---
function diff(a: any, b: any, path = ""): { additions: string[]; deletions: string[]; changes: { path: string; from: any; to: any }[] } {
  const result = { additions: [] as string[], deletions: [] as string[], changes: [] as { path: string; from: any; to: any }[] };

  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null || Array.isArray(a) || Array.isArray(b)) {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      result.changes.push({ path: path || "(root)", from: a, to: b });
    }
    return result;
  }

  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of allKeys) {
    const fullPath = path ? `${path}.${key}` : key;
    if (!(key in a)) {
      result.additions.push(fullPath);
    } else if (!(key in b)) {
      result.deletions.push(fullPath);
    } else {
      const sub = diff(a[key], b[key], fullPath);
      result.additions.push(...sub.additions);
      result.deletions.push(...sub.deletions);
      result.changes.push(...sub.changes);
    }
  }
  return result;
}

// --- Pick ---
function pick(data: any, fields: string[]): any {
  if (Array.isArray(data)) {
    return data.map((item: any) => pickOne(item, fields));
  }
  return pickOne(data, fields);
}

function pickOne(obj: any, fields: string[]): any {
  const result: any = {};
  for (const field of fields) {
    result[field] = queryPath(obj, field);
  }
  return result;
}

// --- CLI ---
function main() {
  const args = process.argv.slice(2);
  const op = args[0];
  const ops = ["validate", "query", "flatten", "unflatten", "diff", "pick"];
  if (!op || !ops.includes(op)) {
    console.error(`Usage: transform.ts <${ops.join("|")}> [options]`);
    process.exit(1);
  }

  function getInput(): any {
    const fileIdx = args.indexOf("--file");
    if (fileIdx !== -1 && args[fileIdx + 1]) return readJson(args[fileIdx + 1]);
    if (args.includes("--stdin")) return readStdin();
    console.error("Provide --file <path> or --stdin");
    process.exit(1);
  }

  switch (op) {
    case "validate": {
      const data = getInput();
      const schemaIdx = args.indexOf("--schema");
      if (schemaIdx === -1 || !args[schemaIdx + 1]) {
        console.error("validate requires --schema <path>");
        process.exit(1);
      }
      const schema = readJson(args[schemaIdx + 1]);
      console.log(JSON.stringify(validate(data, schema), null, 2));
      break;
    }
    case "query": {
      const data = getInput();
      const pathIdx = args.indexOf("--path");
      if (pathIdx === -1 || !args[pathIdx + 1]) {
        console.error("query requires --path <dot.path>");
        process.exit(1);
      }
      console.log(JSON.stringify(queryPath(data, args[pathIdx + 1]), null, 2));
      break;
    }
    case "flatten": {
      console.log(JSON.stringify(flatten(getInput()), null, 2));
      break;
    }
    case "unflatten": {
      console.log(JSON.stringify(unflatten(getInput()), null, 2));
      break;
    }
    case "diff": {
      const fileIdx = args.indexOf("--file");
      const file2Idx = args.indexOf("--file2");
      if (fileIdx === -1 || file2Idx === -1 || !args[fileIdx + 1] || !args[file2Idx + 1]) {
        console.error("diff requires --file <a.json> --file2 <b.json>");
        process.exit(1);
      }
      const a = readJson(args[fileIdx + 1]);
      const b = readJson(args[file2Idx + 1]);
      console.log(JSON.stringify(diff(a, b), null, 2));
      break;
    }
    case "pick": {
      const data = getInput();
      const fieldsIdx = args.indexOf("--fields");
      if (fieldsIdx === -1 || !args[fieldsIdx + 1]) {
        console.error("pick requires --fields <comma-separated>");
        process.exit(1);
      }
      const fields = args[fieldsIdx + 1].split(",").map((f) => f.trim());
      console.log(JSON.stringify(pick(data, fields), null, 2));
      break;
    }
  }
}

main();
