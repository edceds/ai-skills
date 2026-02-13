import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { Skill, SkillMetadata } from "./types.js";

/** Parse YAML frontmatter from SKILL.md content */
export function parseFrontmatter(content: string): {
  metadata: SkillMetadata;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error("SKILL.md missing YAML frontmatter (--- delimiters)");

  const yaml = match[1];
  const body = match[2];

  const name = yaml.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const description = yaml.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "";

  if (!name) throw new Error("SKILL.md frontmatter missing 'name'");
  if (!description) throw new Error("SKILL.md frontmatter missing 'description'");

  return { metadata: { name, description }, body };
}

/** Recursively list files in a directory */
function listFiles(dir: string, base: string = dir): string[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(full, base));
    } else {
      files.push(relative(base, full));
    }
  }
  return files;
}

/** Load a single skill from its directory */
export function loadSkill(directory: string): Skill {
  const skillMd = join(directory, "SKILL.md");
  if (!existsSync(skillMd)) {
    throw new Error(`No SKILL.md found in ${directory}`);
  }

  const content = readFileSync(skillMd, "utf-8");
  const { metadata, body } = parseFrontmatter(content);

  const allFiles = listFiles(directory);
  const scripts = allFiles.filter(
    (f) => f.startsWith("scripts/") && (f.endsWith(".ts") || f.endsWith(".py") || f.endsWith(".sh"))
  );
  const resources = allFiles.filter(
    (f) => f !== "SKILL.md" && !f.startsWith("scripts/")
  );

  return { metadata, instructions: body, directory, scripts, resources };
}

/** Load all skills from a parent directory */
export function loadAllSkills(skillsDir: string): Skill[] {
  if (!existsSync(skillsDir)) return [];
  const entries = readdirSync(skillsDir, { withFileTypes: true });
  const skills: Skill[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(skillsDir, entry.name);
    if (existsSync(join(dir, "SKILL.md"))) {
      skills.push(loadSkill(dir));
    }
  }
  return skills;
}
