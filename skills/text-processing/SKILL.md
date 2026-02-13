---
name: text-processing
description: Analyze text for readability scores (Flesch-Kincaid, Coleman-Liau), extract keywords by TF frequency, compute word/sentence/paragraph counts, generate word frequency tables, and produce extractive summaries. Use when the user asks to analyze, summarize, or extract information from plain text.
---

# Text Processing

Analyze and process plain text. No external dependencies.

## Quick start

```bash
npx tsx scripts/process.ts stats --file essay.txt
npx tsx scripts/process.ts keywords --stdin < article.txt --top 10
npx tsx scripts/process.ts readability --file report.txt
npx tsx scripts/process.ts frequency --file book.txt --top 20
npx tsx scripts/process.ts summarize --file article.txt --sentences 3
```

## Operations

### stats
Basic text statistics: characters, words, sentences, paragraphs, avg words/sentence, avg chars/word.

### keywords
Extract top keywords by term frequency, ignoring stop words. `--top N` to limit (default 10).

### readability
Compute readability scores:
- **Flesch-Kincaid Grade Level** — estimated US school grade
- **Coleman-Liau Index** — character-based grade level
- **Automated Readability Index (ARI)**
Returns scores and a human-readable interpretation.

### frequency
Word frequency table (word → count). `--top N` to limit.

### summarize
Extractive summarization: ranks sentences by word importance, returns top N. `--sentences N` (default 3).

## Input
- `--file <path>` or `--stdin`

## Output
JSON to stdout.
