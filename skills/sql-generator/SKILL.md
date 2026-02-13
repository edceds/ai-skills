---
name: sql-generator
description: Generate SQL queries from natural language descriptions given a database schema. Supports SELECT, INSERT, UPDATE, DELETE, CREATE TABLE, and aggregations. Use when the user describes data they want to query, or provides a schema and asks for SQL.
---

# SQL Generator

Generate SQL from natural language + schema definition. No external dependencies.

## Quick start

```bash
npx tsx scripts/generate.ts --schema schema.json --query "find all users older than 30 sorted by name"
npx tsx scripts/generate.ts --schema schema.json --query "total revenue by month for 2024"
npx tsx scripts/generate.ts --stdin < request.json
npx tsx scripts/generate.ts --create-schema --tables "users(id,name,email,age,created_at);orders(id,user_id,amount,status,created_at)"
```

## Operations

### query (default)
Generate a SELECT query from natural language.

- `--schema <path>` — JSON schema file: `{ "table": { "columns": { "col": "type" } } }`
- `--query <text>` — natural language description
- `--dialect postgres|mysql|sqlite` — SQL dialect (default: postgres)

### create-schema
Generate CREATE TABLE statements from a compact table definition.

- `--tables <def>` — semicolon-separated: `table(col1,col2,...);table2(col1,...)`
- `--dialect postgres|mysql|sqlite`

### stdin
Pass JSON: `{ "schema": {...}, "query": "...", "dialect": "..." }`

## Schema format

```json
{
  "users": {
    "columns": { "id": "serial", "name": "varchar", "email": "varchar", "age": "int", "created_at": "timestamp" },
    "primary_key": "id"
  },
  "orders": {
    "columns": { "id": "serial", "user_id": "int", "amount": "decimal", "status": "varchar", "created_at": "timestamp" },
    "primary_key": "id",
    "foreign_keys": { "user_id": "users.id" }
  }
}
```

## Output
JSON: `{ sql, explanation, tables_used, operation }`
