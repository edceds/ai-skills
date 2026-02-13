import { readFileSync, existsSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { loadSkill } from "./loader.js";
import type { SkillBundle, AnthropicSkillFile } from "./types.js";

const MIME: Record<string, string> = {
  ".md": "text/markdown",
  ".ts": "text/x-typescript",
  ".js": "application/javascript",
  ".py": "text/x-python",
  ".sh": "text/x-shellscript",
  ".json": "application/json",
  ".txt": "text/plain",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".csv": "text/csv",
};

function getMime(filepath: string): string {
  return MIME[extname(filepath)] ?? "application/octet-stream";
}

/** Bundle a skill directory into the format Anthropic's API expects */
export function bundleSkill(directory: string): SkillBundle {
  const skill = loadSkill(directory);
  const name = skill.metadata.name;

  const files: AnthropicSkillFile[] = [];

  // SKILL.md (required at root)
  const skillMdPath = join(directory, "SKILL.md");
  files.push({
    path: `${name}/SKILL.md`,
    content: readFileSync(skillMdPath, "utf-8"),
    mime: "text/markdown",
  });

  // All scripts
  for (const script of skill.scripts) {
    const fullPath = join(directory, script);
    files.push({
      path: `${name}/${script}`,
      content: readFileSync(fullPath, "utf-8"),
      mime: getMime(script),
    });
  }

  // All resources
  for (const res of skill.resources) {
    const fullPath = join(directory, res);
    if (existsSync(fullPath)) {
      files.push({
        path: `${name}/${res}`,
        content: readFileSync(fullPath, "utf-8"),
        mime: getMime(res),
      });
    }
  }

  return {
    display_title: skill.metadata.name.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" "),
    files,
  };
}

/**
 * Generate a curl command to upload a skill to Anthropic.
 * Useful for people who want to upload without the SDK.
 */
export function generateUploadCurl(bundle: SkillBundle, apiKey = "$ANTHROPIC_API_KEY"): string {
  const fileParts = bundle.files.map((f, i) =>
    `-F "files=@/dev/stdin;filename=${f.path};type=${f.mime}"`
  ).join(" \\\n  ");

  // More practical: just show the Python snippet since that's what Anthropic recommends
  return [
    `# Upload "${bundle.display_title}" to Anthropic`,
    `# Requires: pip install anthropic`,
    ``,
    `import anthropic`,
    `from anthropic.lib import files_from_dir`,
    ``,
    `client = anthropic.Anthropic(api_key="${apiKey}")`,
    ``,
    `skill = client.beta.skills.create(`,
    `    display_title="${bundle.display_title}",`,
    `    files=files_from_dir("/path/to/${bundle.files[0].path.split("/")[0]}"),`,
    `    betas=["skills-2025-10-02"],`,
    `)`,
    `print(f"Created: {skill.id}")`,
  ].join("\n");
}

/**
 * Generate the TypeScript/Node.js code to use a skill with Anthropic API.
 */
export function generateUsageSnippet(bundle: SkillBundle, skillId = "skill_YOUR_SKILL_ID"): string {
  return [
    `import Anthropic from "@anthropic-ai/sdk";`,
    ``,
    `const client = new Anthropic();`,
    ``,
    `const response = await client.beta.messages.create({`,
    `  model: "claude-sonnet-4-20250514",`,
    `  max_tokens: 4096,`,
    `  betas: ["code-execution-2025-08-25", "skills-2025-10-02"],`,
    `  container: {`,
    `    skills: [{ type: "custom", skill_id: "${skillId}", version: "latest" }],`,
    `  },`,
    `  messages: [{ role: "user", content: "Use ${bundle.display_title} to ..." }],`,
    `  tools: [{ type: "code_execution_20250825", name: "code_execution" }],`,
    `});`,
    ``,
    `console.log(response.content);`,
  ].join("\n");
}
