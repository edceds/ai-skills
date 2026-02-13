---
name: invoice-parser
description: Extract structured data from invoice and receipt text — line items, totals, tax, dates, vendor info, payment terms. Use when the user provides invoice text, receipt content, or asks to parse financial documents into structured data.
---

# Invoice Parser

Extract structured fields from raw invoice/receipt text. No external dependencies.

## Quick start

```bash
npx tsx scripts/parse.ts --file invoice.txt
npx tsx scripts/parse.ts --stdin < receipt.txt
echo "Invoice #1234 from Acme Corp..." | npx tsx scripts/parse.ts --stdin
```

## What it extracts

- **invoice_number** — invoice/receipt ID
- **date** — issue date
- **due_date** — payment due date
- **vendor** — company/seller name
- **vendor_address** — seller address
- **customer** — buyer name
- **customer_address** — buyer address
- **line_items** — array of `{ description, quantity, unit_price, amount }`
- **subtotal** — sum before tax
- **tax_rate** — tax percentage
- **tax_amount** — tax value
- **total** — final amount
- **currency** — detected currency (USD, EUR, GBP, etc.)
- **payment_terms** — Net 30, Due on receipt, etc.
- **notes** — any additional notes

## Input
- `--file <path>` or `--stdin`

## Output
JSON to stdout with all extracted fields. Missing fields are null.
