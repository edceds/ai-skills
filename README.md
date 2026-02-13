# ai-skills

Ready-to-use [Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) for the Claude API. 5 built-in skills, a CLI to run/test/bundle them, and a scaffolder to create your own.

```bash
npx ai-skills list
npx ai-skills run csv-analytics stats --file data.csv
npx ai-skills bundle csv-analytics
```

## Install

```bash
npm install ai-skills
```

Or use directly with `npx`:

```bash
npx ai-skills --help
```

## Built-in Skills

| Skill | What it does |
|-------|-------------|
| **csv-analytics** | Parse CSV, compute stats (mean/median/stddev), filter rows, aggregate/group-by |
| **markdown-to-html** | Convert Markdown to styled standalone HTML (headings, tables, code blocks, themes) |
| **json-transformer** | Validate against schemas, query by dot-path, flatten/unflatten, diff, pick fields |
| **text-processing** | Readability scores (Flesch-Kincaid, Coleman-Liau, ARI), keywords, word frequency, extractive summarization |
| **data-generator** | Generate mock users, products, time series, or custom schemas with deterministic seeding |

Each skill follows the [Anthropic Agent Skill format](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview): a `SKILL.md` with YAML frontmatter + executable scripts.

## CLI

```
ai-skills list                         List available skills
ai-skills info  <skill>                Show skill metadata + instructions
ai-skills run   <skill> [args...]      Run a skill script locally
ai-skills init  <name>                 Scaffold a new skill
ai-skills bundle <skill> [--out dir]   Bundle for Anthropic API upload
```

### Run a skill locally

```bash
# CSV stats
npx ai-skills run csv-analytics stats --file sales.csv

# Generate 100 fake users
npx ai-skills run data-generator users --count 100 --seed 42

# Convert markdown to HTML
echo "# Hello" | npx ai-skills run markdown-to-html --stdin --theme dark

# Query nested JSON
npx ai-skills run json-transformer query --file data.json --path "users[0].address.city"

# Extract keywords
npx ai-skills run text-processing keywords --file article.txt --top 10
```

### Create your own skill

```bash
npx ai-skills init my-custom-skill
# Creates skills/my-custom-skill/SKILL.md + scripts/main.ts

# Edit, then test:
npx ai-skills run my-custom-skill --help

# Bundle for upload:
npx ai-skills bundle my-custom-skill
```

## Upload to Claude API

`ai-skills bundle <skill>` generates the upload code for you:

```python
import anthropic
from anthropic.lib import files_from_dir

client = anthropic.Anthropic()

skill = client.beta.skills.create(
    display_title="Csv Analytics",
    files=files_from_dir("./skills/csv-analytics"),
    betas=["skills-2025-10-02"],
)
print(f"Created: {skill.id}")
```

Then use it:

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
  messages: [{ role: "user", content: "Analyze this CSV and give me stats" }],
  tools: [{ type: "code_execution_20250825", name: "code_execution" }],
});
```

## Programmatic API

```typescript
import { loadSkill, loadAllSkills, runScript, bundleSkill } from "ai-skills";

// Load all built-in skills
const skills = loadAllSkills("./skills");

// Run a skill script
const skill = loadSkill("./skills/csv-analytics");
const result = runScript(skill, "scripts/analyze.ts", ["stats", "--file", "data.csv"]);
console.log(result.stdout);

// Bundle for Anthropic upload
const bundle = bundleSkill("./skills/csv-analytics");
console.log(bundle.files); // [{ path, content, mime }, ...]
```

## License

MIT
