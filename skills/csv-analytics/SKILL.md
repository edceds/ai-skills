---
name: csv-analytics
description: Parse CSV data, compute column statistics (mean, median, min, max, stddev), filter rows by conditions, and aggregate/group data. Use when the user asks to analyze, summarize, or filter tabular/CSV data.
---

# CSV Analytics

Analyze CSV data without external dependencies.

## Quick start

Run the analytics script with a CSV file path and an operation:

```bash
npx tsx scripts/analyze.ts stats --file data.csv
npx tsx scripts/analyze.ts stats --stdin < data.csv
npx tsx scripts/analyze.ts filter --file data.csv --where "age>30"
npx tsx scripts/analyze.ts aggregate --file data.csv --group-by department --agg "salary:mean"
```

## Operations

### stats
Compute per-column statistics: count, nulls, unique, min, max, mean, median, stddev (for numeric columns).

### filter
Filter rows using `--where` conditions. Supports `>`, `<`, `>=`, `<=`, `==`, `!=`.
Multiple conditions: `--where "age>30" --where "dept==engineering"`.

### aggregate
Group rows by a column (`--group-by`) and compute aggregations (`--agg "column:fn"`).
Supported functions: count, sum, mean, min, max.

## Input
- `--file path.csv` — read from a file
- `--stdin` — read CSV from stdin (pipe or heredoc)

## Output
JSON to stdout. Errors go to stderr.
