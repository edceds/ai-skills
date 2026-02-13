---
name: data-generator
description: Generate realistic mock data including users, products, time series, and custom schemas. Use when the user needs sample data, test fixtures, fake records, or synthetic datasets for development and testing.
---

# Data Generator

Generate realistic mock/test data with deterministic seeding. No external dependencies.

## Quick start

```bash
npx tsx scripts/generate.ts users --count 10
npx tsx scripts/generate.ts products --count 5
npx tsx scripts/generate.ts timeseries --count 30 --start "2025-01-01" --interval day
npx tsx scripts/generate.ts custom --schema '{"name":"name","age":"int:18:65","email":"email","active":"bool"}'
npx tsx scripts/generate.ts csv-users --count 20
```

## Operations

### users
Generate user records: id, name, email, age, city, signup_date, active.

### products
Generate product records: id, name, category, price, stock, rating, sku.

### timeseries
Generate time-series data points: timestamp, value (with noise and optional trend).
- `--start <date>` — start date (default: today)
- `--interval hour|day|week|month` — interval between points (default: day)
- `--trend <float>` — upward/downward trend per point (default: 0)

### custom
Generate from a schema definition (JSON string):
- `"name"` — realistic name
- `"email"` — email address
- `"int:min:max"` — random integer
- `"float:min:max"` — random float
- `"bool"` — true/false
- `"date:from:to"` — date between range
- `"pick:a,b,c"` — pick from list
- `"uuid"` — UUIDv4
- `"text:N"` — N words of lorem ipsum

### csv-users
Same as `users` but output as CSV.

## Common options
- `--count N` — number of records (default 10)
- `--seed N` — reproducible RNG seed (default: random)
- `--out <file>` — write to file instead of stdout

## Output
JSON array to stdout (or CSV for csv-users).
