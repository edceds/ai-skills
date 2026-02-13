# ai-skills

Production-ready [Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) for the Claude API. One function call per capability.

```typescript
import { skills } from "ai-skills";

// Parse an invoice
const invoice = skills.parseInvoice({ text: invoiceText });
// → { invoice_number, total, line_items, tax_rate, vendor, ... }

// Draft an email
const email = skills.composeEmail({
  type: "follow-up", to: "Jane", from: "John",
  points: ["discussed pricing", "agreed on Q2 timeline"],
});
// → { subject, body, html }

// Generate SQL from English
const query = skills.generateSql({
  schema: { users: { columns: { id: "serial", name: "varchar", age: "int" } } },
  query: "users older than 30 sorted by name",
});
// → { sql: "SELECT users.* FROM users WHERE users.age > 30 ORDER BY ...", ... }

// Mock an API response
const mock = skills.mockApiResponse({ endpoint: "/users", method: "GET", count: 5 });
// → { data: [...], meta: { total, page, per_page } }

// Generate a chart
const svg = skills.generateChart({ type: "bar", data: { Q1: 100, Q2: 200 }, title: "Revenue" });
// → "<svg>...</svg>"
```

## Install

```bash
npm install ai-skills
```

## Skills

| Function | What it does |
|----------|-------------|
| `skills.parseInvoice({ text })` | Extract structured data from invoices — line items, totals, tax, vendor, dates, payment terms |
| `skills.composeEmail({ type, to, from, points })` | Draft professional emails (8 types: follow-up, outreach, recap, escalation, thank-you, intro, reminder, apology) |
| `skills.generateSql({ schema, query })` | Natural language to SQL (SELECT, WHERE, GROUP BY, ORDER BY, LIMIT, multi-dialect) |
| `skills.createTable({ tables })` | Generate CREATE TABLE from compact definitions |
| `skills.mockApiResponse({ endpoint, method })` | Mock JSON responses with realistic data for any REST endpoint |
| `skills.mockOpenApi({ name, endpoints })` | Generate OpenAPI 3.0 specs |
| `skills.mockEndpoints({ resources })` | Generate CRUD endpoint definitions from resource names |
| `skills.generateChart({ type, data })` | Data to SVG charts — bar, line, pie, scatter |

All functions are synchronous, zero external dependencies, fully typed.

## Upload to Claude API

Every skill also works as an [Anthropic Agent Skill](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) — a directory with `SKILL.md` + scripts that Claude can use in its code execution container.

```bash
# Bundle a skill for upload
npx ai-skills bundle invoice-parser
```

This gives you the upload code:

```python
import anthropic
from anthropic.lib import files_from_dir

client = anthropic.Anthropic()
skill = client.beta.skills.create(
    display_title="Invoice Parser",
    files=files_from_dir("./skills/invoice-parser"),
    betas=["skills-2025-10-02"],
)
```

Then use it in your agent:

```typescript
const response = await anthropic.beta.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 4096,
  betas: ["code-execution-2025-08-25", "skills-2025-10-02"],
  container: {
    skills: [{ type: "custom", skill_id: "skill_...", version: "latest" }],
  },
  messages: [{ role: "user", content: "Parse this invoice and extract the totals" }],
  tools: [{ type: "code_execution_20250825", name: "code_execution" }],
});
```

## CLI

```bash
npx ai-skills list                    # List available skills
npx ai-skills info  <skill>           # Show skill details
npx ai-skills run   <skill> [args]    # Run a skill locally
npx ai-skills init  <name>            # Scaffold a new skill
npx ai-skills bundle <skill>          # Bundle for Anthropic upload
```

## Create your own skill

```bash
npx ai-skills init my-custom-skill
# Creates skills/my-custom-skill/SKILL.md + scripts/main.ts
```

Each skill is a directory:

```
my-skill/
├── SKILL.md          # YAML frontmatter (name, description) + instructions
└── scripts/
    └── main.ts       # Executable script Claude runs
```

## Roadmap

Planned skills:
- **contract-analyzer** — extract clauses, obligations, dates from legal docs
- **spreadsheet-builder** — generate Excel/CSV reports from structured data
- **calendar-scheduler** — parse availability, suggest meeting times, generate .ics
- **webhook-handler** — parse and route incoming webhook payloads (Stripe, GitHub, Slack)
- **pdf-report** — generate formatted PDF reports from data + templates

## License

MIT
