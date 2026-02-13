---
name: chart-generator
description: Generate SVG charts from data — bar charts, line charts, pie charts, and scatter plots. Use when the user asks to visualize data, create a chart, plot values, or generate a graph.
---

# Chart Generator

Generate self-contained SVG charts from data. No external dependencies.

## Quick start

```bash
npx tsx scripts/chart.ts bar --data '{"Q1":100,"Q2":150,"Q3":200,"Q4":180}' --title "Revenue by Quarter"
npx tsx scripts/chart.ts line --data '[[1,10],[2,25],[3,18],[4,32],[5,28]]' --title "Growth"
npx tsx scripts/chart.ts pie --data '{"Chrome":65,"Firefox":15,"Safari":12,"Other":8}'
npx tsx scripts/chart.ts scatter --data '[[1,2],[3,4],[5,1],[7,8],[9,6]]'
npx tsx scripts/chart.ts bar --stdin < data.json --out chart.svg
```

## Chart types

### bar
Vertical bar chart. Data: `{ "label": value, ... }`

### line
Line chart with data points. Data: `[[x, y], ...]`

### pie
Pie/donut chart with percentages. Data: `{ "label": value, ... }`

### scatter
Scatter plot. Data: `[[x, y], ...]`

## Options

- `--data <json>` — inline data
- `--stdin` — read JSON data from stdin
- `--title <text>` — chart title
- `--width <px>` — width (default: 600)
- `--height <px>` — height (default: 400)
- `--colors <hex,hex,...>` — custom color palette
- `--out <file>` — write to file (default: stdout)

## Output
SVG markup to stdout (or file).
