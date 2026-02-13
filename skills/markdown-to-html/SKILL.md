---
name: markdown-to-html
description: Convert Markdown text to beautifully styled HTML documents with syntax highlighting support, table formatting, and responsive layout. Use when the user asks to convert markdown to HTML, generate an HTML page, or create a styled document from text.
---

# Markdown to HTML

Convert Markdown to standalone, styled HTML documents. No external dependencies.

## Quick start

```bash
npx tsx scripts/convert.ts --file input.md --out output.html
npx tsx scripts/convert.ts --stdin < input.md
echo "# Hello" | npx tsx scripts/convert.ts --stdin --title "My Page"
```

## Options

- `--file <path>` — read Markdown from file
- `--stdin` — read Markdown from stdin
- `--out <path>` — write HTML to file (default: stdout)
- `--title <title>` — set page title (default: extracted from first `#` heading)
- `--theme light|dark` — color theme (default: light)

## Supported Markdown

- Headings (`#` through `######`)
- Bold, italic, strikethrough, inline code
- Code blocks with language labels (` ``` `)
- Ordered and unordered lists (including nested)
- Links and images
- Blockquotes
- Horizontal rules
- Tables (GFM-style `| col | col |`)

## Output

Standalone HTML with embedded CSS. No external resources needed.
