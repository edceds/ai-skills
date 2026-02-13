---
name: json-transformer
description: Validate JSON against schemas, transform JSON with mapping expressions, query nested JSON with dot-path syntax, flatten/unflatten objects, and diff two JSON values. Use when the user asks to transform, validate, query, compare, or restructure JSON data.
---

# JSON Transformer

Validate, transform, query, and diff JSON data. No external dependencies.

## Quick start

```bash
npx tsx scripts/transform.ts validate --file data.json --schema schema.json
npx tsx scripts/transform.ts query --file data.json --path "users[0].name"
npx tsx scripts/transform.ts flatten --stdin < nested.json
npx tsx scripts/transform.ts diff --file a.json --file2 b.json
npx tsx scripts/transform.ts pick --file data.json --fields "id,name,email"
```

## Operations

### validate
Check JSON against a simple schema. Schema format: `{ "field": "string|number|boolean|array|object", ... }`. Supports `"field?": "type"` for optional. Returns `{ valid: true/false, errors: [...] }`.

### query
Extract a value using dot-path notation: `users[0].address.city`. Returns the value or null.

### flatten
Flatten a nested object to dot-notation keys: `{ "a.b.c": 1 }`.

### unflatten
Reverse of flatten: `{ "a.b.c": 1 }` → `{ a: { b: { c: 1 } } }`.

### diff
Compare two JSON values. Returns additions, deletions, and changes.

### pick
Select a subset of fields from each object (or from a single object).

## Input
- `--file <path>` / `--stdin` for primary JSON
- `--file2 <path>` for diff second input
- `--schema <path>` for validate schema
- `--path <dot.path>` for query
- `--fields <comma-separated>` for pick

## Output
JSON to stdout.
