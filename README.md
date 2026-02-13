# ai-skills

Artifacts AI models can't produce from text alone: QR codes, PDFs, spreadsheets, charts, calendars.

**This is an [Anthropic Agent Skill](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview).** The agent reads [SKILL.md](SKILL.md), follows the instructions, runs the scripts. That's the entire interface.

```bash
npx tsx scripts/run.ts qr-code '{"data":"https://example.com"}'
npx tsx scripts/run.ts pdf-builder '{"title":"Report","body":["Hello."]}'
npx tsx scripts/run.ts spreadsheet-builder '{"headers":["A","B"],"rows":[["1","2"]]}'
npx tsx scripts/run.ts chart-generator '{"type":"bar","data":{"Q1":100,"Q2":200}}'
npx tsx scripts/run.ts ical-generator '{"events":[{"summary":"Meet","start":"2025-03-15T14:00:00","end":"2025-03-15T15:00:00"}]}'
```

See [SKILL.md](SKILL.md) for full input/output reference.

## License

MIT
