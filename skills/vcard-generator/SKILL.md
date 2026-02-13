---
name: vcard-generator
description: Generate vCard 4.0 (.vcf) contact files with proper RFC 6350 encoding, line folding, and structured fields. Use when the user needs to create a contact card, business card, or address book entry.
---

# vCard Generator

Generate RFC 6350-compliant vCard 4.0 (.vcf) files. Zero external dependencies.

## Quick start

```bash
npx tsx scripts/generate.ts --stdin <<< '{"name":{"given":"Alice","family":"Smith"},"email":"alice@example.com"}'
```

## Input format (JSON)

```json
{
  "name": { "given": "Alice", "family": "Smith", "prefix": "Dr.", "suffix": "PhD" },
  "org": "Acme Corp",
  "title": "Senior Engineer",
  "email": "alice@example.com",
  "phone": "+1-555-0100",
  "address": {
    "street": "123 Main St",
    "city": "Springfield",
    "state": "IL",
    "zip": "62701",
    "country": "US"
  },
  "url": "https://alice.example.com",
  "note": "Met at conference 2025",
  "photo_base64": "<base64-encoded JPEG>"
}
```

## Fields

- **name** — `{ given, family, prefix?, suffix? }` (required)
- **org** — organization name
- **title** — job title
- **email** — email address (string or array)
- **phone** — phone number (string or array)
- **address** — `{ street, city, state, zip, country }`
- **url** — website URL
- **note** — freeform text
- **photo_base64** — base64-encoded JPEG/PNG for embedded photo

## Options

- `--stdin` — read JSON from stdin (required)
- `--out <file>` — write to file (default: stdout)

## Output

vCard 4.0 text (.vcf) to stdout.
