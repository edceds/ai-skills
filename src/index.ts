import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative, extname } from "node:path";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SkillMetadata {
  name: string;
  description: string;
}

export interface Skill {
  metadata: SkillMetadata;
  instructions: string;
  directory: string;
  scripts: string[];
  resources: string[];
}

export interface ScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface AnthropicSkillFile {
  path: string;
  content: string;
  mime: string;
}

export interface SkillBundle {
  display_title: string;
  files: AnthropicSkillFile[];
}

export interface ChartInput {
  type: "bar" | "line" | "pie" | "scatter";
  data: Record<string, number> | number[][];
  title?: string;
  width?: number;
  height?: number;
  colors?: string[];
}

export interface QrCodeInput {
  data: string;
  size?: number;
  ecl?: "L" | "M" | "Q" | "H";
  fg?: string;
  bg?: string;
}

export type PdfBlock =
  | string
  | { heading: string }
  | { table: { headers: string[]; rows: string[][] } }
  | { list: string[] };

export interface PdfInput {
  title?: string;
  author?: string;
  date?: string;
  body: PdfBlock[];
  footer?: string;
  pageSize?: "letter" | "a4";
}

export interface PdfOutput {
  base64: string;
  size: number;
  pages: number;
}

export interface SpreadsheetSheet {
  name?: string;
  headers: string[];
  rows: (string | number | null)[][];
  summary?: Record<string, "sum" | "avg" | "min" | "max" | "count">;
}

export interface SpreadsheetInput {
  sheets?: SpreadsheetSheet[];
  headers?: string[];
  rows?: (string | number | null)[][];
  summary?: Record<string, "sum" | "avg" | "min" | "max" | "count">;
  format?: "csv" | "tsv";
  formulas?: boolean;
  bom?: boolean;
}

export interface IcalAttendee {
  name: string;
  email: string;
  rsvp?: boolean;
}

export interface IcalEvent {
  summary: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  timezone?: string;
  organizer?: { name: string; email: string };
  attendees?: IcalAttendee[];
  alarm?: { minutes_before: number };
  rrule?: string;
  status?: "CONFIRMED" | "TENTATIVE" | "CANCELLED";
  url?: string;
}

export interface IcalInput {
  events: IcalEvent[];
  calendar_name?: string;
  method?: string;
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export function parseFrontmatter(content: string): { metadata: SkillMetadata; body: string } {
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

function listFiles(dir: string, base: string = dir): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(full, base));
    else files.push(relative(base, full));
  }
  return files;
}

export function loadSkill(directory: string): Skill {
  const skillMd = join(directory, "SKILL.md");
  if (!existsSync(skillMd)) throw new Error(`No SKILL.md found in ${directory}`);

  const content = readFileSync(skillMd, "utf-8");
  const { metadata, body } = parseFrontmatter(content);
  const allFiles = listFiles(directory);

  return {
    metadata,
    instructions: body,
    directory,
    scripts: allFiles.filter((f) => f.startsWith("scripts/") && (f.endsWith(".ts") || f.endsWith(".py") || f.endsWith(".sh"))),
    resources: allFiles.filter((f) => f !== "SKILL.md" && !f.startsWith("scripts/")),
  };
}

export function loadAllSkills(skillsDir: string): Skill[] {
  if (!existsSync(skillsDir)) return [];
  const skills: Skill[] = [];
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(skillsDir, entry.name);
    if (existsSync(join(dir, "SKILL.md"))) skills.push(loadSkill(dir));
  }
  return skills;
}

// ─── Runner ──────────────────────────────────────────────────────────────────

export function runScript(skill: Skill, scriptPath: string, args: string[] = [], stdin?: string): ScriptResult {
  const fullPath = join(skill.directory, scriptPath);

  let cmd: string;
  let cmdArgs: string[];
  if (scriptPath.endsWith(".ts")) { cmd = "npx"; cmdArgs = ["tsx", fullPath, ...args]; }
  else if (scriptPath.endsWith(".py")) { cmd = "python3"; cmdArgs = [fullPath, ...args]; }
  else { cmd = "bash"; cmdArgs = [fullPath, ...args]; }

  try {
    const stdout = execFileSync(cmd, cmdArgs, {
      cwd: skill.directory, encoding: "utf-8", timeout: 30_000, input: stdin, maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: any) {
    return { stdout: err.stdout ?? "", stderr: err.stderr ?? err.message, exitCode: err.status ?? 1 };
  }
}

// ─── Skills API ──────────────────────────────────────────────────────────────

const SKILLS_DIR = join(__dirname, "..", "skills");

function getSkill(name: string): Skill {
  try { return loadSkill(join(SKILLS_DIR, name)); } catch {}
  return loadSkill(join(process.cwd(), "skills", name));
}

function exec(skillName: string, args: string[], stdin?: string): any {
  const skill = getSkill(skillName);
  const result = runScript(skill, skill.scripts[0], args, stdin);
  if (result.exitCode !== 0) throw new Error(`Skill "${skillName}" failed (exit ${result.exitCode}): ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function execRaw(skillName: string, args: string[], stdin?: string): string {
  const skill = getSkill(skillName);
  const result = runScript(skill, skill.scripts[0], args, stdin);
  if (result.exitCode !== 0) throw new Error(`Skill "${skillName}" failed (exit ${result.exitCode}): ${result.stderr}`);
  return result.stdout;
}

export const skills = {
  generateChart(input: ChartInput): string {
    const args = [input.type, "--stdin"];
    if (input.title) args.push("--title", input.title);
    if (input.width) args.push("--width", String(input.width));
    if (input.height) args.push("--height", String(input.height));
    if (input.colors) args.push("--colors", input.colors.join(","));
    return execRaw("chart-generator", args, JSON.stringify(input.data));
  },

  generateQrCode(input: QrCodeInput): string {
    const args = ["--data", input.data];
    if (input.size) args.push("--size", String(input.size));
    if (input.ecl) args.push("--ecl", input.ecl);
    if (input.fg) args.push("--fg", input.fg);
    if (input.bg) args.push("--bg", input.bg);
    return execRaw("qr-code", args);
  },

  buildPdf(input: PdfInput): PdfOutput {
    const { pageSize, ...doc } = input;
    const args = ["--stdin"];
    if (pageSize) args.push("--page-size", pageSize);
    return exec("pdf-builder", args, JSON.stringify(doc));
  },

  buildSpreadsheet(input: SpreadsheetInput): string {
    const { format, formulas, bom, ...data } = input;
    const args = ["--stdin"];
    if (format) args.push("--format", format);
    if (formulas) args.push("--formulas");
    if (bom) args.push("--bom");
    return execRaw("spreadsheet-builder", args, JSON.stringify(data));
  },

  generateIcal(input: IcalInput): string {
    return execRaw("ical-generator", ["--stdin"], JSON.stringify(input));
  },
};

// ─── Bundle ──────────────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  ".md": "text/markdown", ".ts": "text/x-typescript", ".js": "application/javascript",
  ".py": "text/x-python", ".sh": "text/x-shellscript", ".json": "application/json",
  ".txt": "text/plain", ".yaml": "text/yaml", ".yml": "text/yaml", ".csv": "text/csv",
};

function titleCase(name: string): string {
  return name.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

export function bundleSkill(directory: string): SkillBundle {
  const skill = loadSkill(directory);
  const name = skill.metadata.name;
  const files: AnthropicSkillFile[] = [];

  files.push({ path: `${name}/SKILL.md`, content: readFileSync(join(directory, "SKILL.md"), "utf-8"), mime: "text/markdown" });
  for (const script of skill.scripts) {
    files.push({ path: `${name}/${script}`, content: readFileSync(join(directory, script), "utf-8"), mime: MIME[extname(script)] ?? "application/octet-stream" });
  }
  for (const res of skill.resources) {
    const full = join(directory, res);
    if (existsSync(full)) files.push({ path: `${name}/${res}`, content: readFileSync(full, "utf-8"), mime: MIME[extname(res)] ?? "application/octet-stream" });
  }

  return { display_title: titleCase(name), files };
}

export function generateUploadCurl(bundle: SkillBundle, apiKey = "$ANTHROPIC_API_KEY"): string {
  return [
    `# Upload "${bundle.display_title}" to Anthropic`,
    `# Requires: pip install anthropic`,
    ``, `import anthropic`, `from anthropic.lib import files_from_dir`, ``,
    `client = anthropic.Anthropic(api_key="${apiKey}")`, ``,
    `skill = client.beta.skills.create(`,
    `    display_title="${bundle.display_title}",`,
    `    files=files_from_dir("/path/to/${bundle.files[0].path.split("/")[0]}"),`,
    `    betas=["skills-2025-10-02"],`,
    `)`, `print(f"Created: {skill.id}")`,
  ].join("\n");
}

export function generateUsageSnippet(bundle: SkillBundle, skillId = "skill_YOUR_SKILL_ID"): string {
  return [
    `import Anthropic from "@anthropic-ai/sdk";`, ``,
    `const client = new Anthropic();`, ``,
    `const response = await client.beta.messages.create({`,
    `  model: "claude-sonnet-4-20250514",`,
    `  max_tokens: 4096,`,
    `  betas: ["code-execution-2025-08-25", "skills-2025-10-02"],`,
    `  container: {`,
    `    skills: [{ type: "custom", skill_id: "${skillId}", version: "latest" }],`,
    `  },`,
    `  messages: [{ role: "user", content: "Use ${bundle.display_title} to ..." }],`,
    `  tools: [{ type: "code_execution_20250825", name: "code_execution" }],`,
    `});`, ``, `console.log(response.content);`,
  ].join("\n");
}

// MCP server: import { createMcpServer } from "ai-skills/mcp"
