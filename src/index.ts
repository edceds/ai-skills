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

export interface VCardNameInput {
  given: string;
  family: string;
  prefix?: string;
  suffix?: string;
}

export interface VCardAddressInput {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface VCardInput {
  name: VCardNameInput;
  org?: string;
  title?: string;
  email?: string | string[];
  phone?: string | string[];
  address?: VCardAddressInput;
  url?: string;
  note?: string;
  photo_base64?: string;
}

export interface BarcodeInput {
  data: string;
  width?: number;
  height?: number;
  show_text?: boolean;
}

export interface WavInput {
  frequency: number;
  duration: number;
  sample_rate?: number;
  volume?: number;
  waveform?: "sine" | "square" | "sawtooth";
}

export interface WavOutput {
  base64: string;
  size: number;
  duration: number;
  frequency: number;
}

export interface HashInput {
  data: string;
  algorithm?: "sha256" | "sha512" | "md5" | "sha1";
  encoding?: "hex" | "base64";
  hmac_key?: string;
}

export interface HashOutput {
  hash: string;
  algorithm: string;
  encoding: string;
  hmac: boolean;
}

export interface ZipFileEntry {
  name: string;
  content: string;
}

export interface ZipInput {
  files: ZipFileEntry[];
}

export interface ZipOutput {
  base64: string;
  size: number;
  entries: number;
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

  generateVCard(input: VCardInput): string {
    return execRaw("vcard-generator", ["--stdin"], JSON.stringify(input));
  },

  generateBarcode(input: BarcodeInput): string {
    const args = ["--data", input.data];
    if (input.width) args.push("--width", String(input.width));
    if (input.height) args.push("--height", String(input.height));
    if (input.show_text === false) args.push("--no-text");
    return execRaw("barcode-generator", args);
  },

  generateWav(input: WavInput): WavOutput {
    return exec("wav-generator", ["--stdin"], JSON.stringify(input));
  },

  generateHash(input: HashInput): HashOutput {
    return exec("hash-generator", ["--stdin"], JSON.stringify(input));
  },

  createZip(input: ZipInput): ZipOutput {
    return exec("zip-archive", ["--stdin"], JSON.stringify(input));
  },
};
