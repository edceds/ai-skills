# ai-skills

Production-ready [Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) for the Claude API. Each skill gives your agent a real business capability — parse invoices, draft emails, query databases, prototype APIs, generate charts.

```bash
npx ai-skills list
npx ai-skills run invoice-parser --file invoice.txt
npx ai-skills bundle email-composer
```

## Why this exists

AI agents are only as useful as the tasks they can actually do. Right now every team building on Claude is writing the same boilerplate skills from scratch — invoice parsing, email drafting, SQL generation. This package ships those skills ready to use: install, bundle, upload to Claude, done.

## Install

```bash
npm install ai-skills
```

Or run directly:

```bash
npx ai-skills --help
```

## Skills

| Skill | What your agent can do |
|-------|----------------------|
| **invoice-parser** | Extract structured data from invoices — line items, totals, tax, vendor, dates, payment terms |
| **email-composer** | Draft professional emails from intent + bullet points (8 types: follow-up, outreach, recap, escalation, thank-you, intro, reminder, apology) |
| **sql-generator** | Turn natural language into SQL queries given a database schema (SELECT, CREATE TABLE, aggregations, multi-dialect) |
| **api-mocker** | Generate mock API responses, OpenAPI 3.0 specs, and CRUD endpoint definitions from resource names |
| **chart-generator** | Turn data into SVG charts — bar, line, pie, scatter — self-contained, no external deps |

Each skill follows the [Anthropic Agent Skill format](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview): `SKILL.md` with YAML frontmatter + executable scripts in `scripts/`.

## CLI

```
ai-skills list                         List available skills
ai-skills info  <skill>                Show skill details + instructions
ai-skills run   <skill> [args...]      Run a skill locally
ai-skills init  <name>                 Scaffold a new skill
ai-skills bundle <skill> [--out dir]   Bundle for Anthropic upload
```

### Examples

```bash
# Parse an invoice into structured JSON
npx ai-skills run invoice-parser --file invoice.txt

# Draft a follow-up email
npx ai-skills run email-composer --type follow-up --to "Jane" --from "John" --points "pricing,timeline"

# Generate SQL from English
npx ai-skills run sql-generator --schema schema.json --query "users older than 30 sorted by name"

# Mock an API response
npx ai-skills run api-mocker response --endpoint "/users" --method GET --count 5

# Generate a bar chart
npx ai-skills run chart-generator bar --data '{"Q1":100,"Q2":150,"Q3":200}'
```

### Create your own skill

```bash
npx ai-skills init my-custom-skill
# Edit skills/my-custom-skill/SKILL.md + scripts/main.ts
npx ai-skills run my-custom-skill --help
npx ai-skills bundle my-custom-skill
```

## Upload to Claude

`ai-skills bundle <skill>` gives you the upload code:

```python
import anthropic
from anthropic.lib import files_from_dir

client = anthropic.Anthropic()
skill = client.beta.skills.create(
    display_title="Invoice Parser",
    files=files_from_dir("./skills/invoice-parser"),
    betas=["skills-2025-10-02"],
)
print(f"Created: {skill.id}")
```

Then use it in your agent:

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const response = await client.beta.messages.create({
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

## Programmatic API

```typescript
import { loadSkill, loadAllSkills, runScript, bundleSkill } from "ai-skills";

const skill = loadSkill("./skills/invoice-parser");
const result = runScript(skill, "scripts/parse.ts", ["--file", "invoice.txt"]);
console.log(JSON.parse(result.stdout));

const bundle = bundleSkill("./skills/invoice-parser");
// bundle.files → [{ path, content, mime }, ...]
```

## Roadmap

This is the starting point. The goal is a growing library of production-quality agent skills that cover the workflows businesses actually automate.

Planned next:
- **contract-analyzer** — extract clauses, obligations, dates from legal docs
- **spreadsheet-builder** — generate Excel/CSV reports from structured data
- **calendar-scheduler** — parse availability, suggest meeting times, generate .ics
- **webhook-handler** — parse and route incoming webhook payloads (Stripe, GitHub, Slack)
- **pdf-report** — generate formatted PDF reports from data + templates

Contributions welcome. Each skill is a standalone directory — fork, add yours, open a PR.

## License

MIT
