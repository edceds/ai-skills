---
name: email-composer
description: Generate professional emails from intent and bullet points — cold outreach, follow-ups, meeting recaps, escalations, thank-you notes, and more. Use when the user asks to write, draft, or compose an email.
---

# Email Composer

Generate structured, professional emails from minimal input. No external dependencies.

## Quick start

```bash
npx tsx scripts/compose.ts --type follow-up --to "Jane" --from "John" --points "discussed pricing,agreed on Q2 timeline,need budget approval"
npx tsx scripts/compose.ts --type cold-outreach --to "CEO" --from "Sales Rep" --company "Acme" --points "saw your talk at conf,our tool saves 40% on ops"
npx tsx scripts/compose.ts --stdin < brief.json
```

## Email types

- **follow-up** — after a meeting or conversation
- **cold-outreach** — first contact / sales
- **meeting-recap** — summarize what was discussed and action items
- **escalation** — raise an issue to management
- **thank-you** — gratitude after help, interview, deal
- **introduction** — introduce two people or yourself
- **reminder** — gentle nudge about a deadline or task
- **apology** — acknowledge a mistake professionally

## Input (CLI args or JSON via stdin)

- `--type <type>` — email type (required)
- `--to <name>` — recipient name
- `--from <name>` — sender name
- `--subject <text>` — override auto-generated subject
- `--company <name>` — company context
- `--points <comma-separated>` — key points to include
- `--tone formal|casual|friendly|urgent` — tone (default: formal)
- `--stdin` — read JSON `{ type, to, from, subject, company, points, tone }`

## Output

JSON: `{ subject, body, html }` — plain text body + HTML version.
