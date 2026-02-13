import { join } from "node:path";
import { loadSkill } from "./loader.js";
import { runScript } from "./runner.js";
import type { Skill } from "./types.js";

const SKILLS_DIR = join(__dirname, "..", "skills");

// ─── Input/Output types ─────────────────────────────────────────────────────

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

// ─── Internal ────────────────────────────────────────────────────────────────

function getSkill(name: string): Skill {
  try { return loadSkill(join(SKILLS_DIR, name)); } catch {}
  return loadSkill(join(process.cwd(), "skills", name));
}

function exec(skillName: string, args: string[], stdin?: string): any {
  const skill = getSkill(skillName);
  const result = runScript(skill, skill.scripts[0], args, stdin);
  if (result.exitCode !== 0) {
    throw new Error(`Skill "${skillName}" failed (exit ${result.exitCode}): ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function execRaw(skillName: string, args: string[], stdin?: string): string {
  const skill = getSkill(skillName);
  const result = runScript(skill, skill.scripts[0], args, stdin);
  if (result.exitCode !== 0) {
    throw new Error(`Skill "${skillName}" failed (exit ${result.exitCode}): ${result.stderr}`);
  }
  return result.stdout;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const skills = {

  /** Generate an SVG chart (bar, line, pie, scatter). Returns SVG string. */
  generateChart(input: ChartInput): string {
    const args = [input.type, "--stdin"];
    if (input.title) args.push("--title", input.title);
    if (input.width) args.push("--width", String(input.width));
    if (input.height) args.push("--height", String(input.height));
    if (input.colors) args.push("--colors", input.colors.join(","));
    return execRaw("chart-generator", args, JSON.stringify(input.data));
  },

  /** Generate a QR code as SVG. Returns SVG string. */
  generateQrCode(input: QrCodeInput): string {
    const args = ["--data", input.data];
    if (input.size) args.push("--size", String(input.size));
    if (input.ecl) args.push("--ecl", input.ecl);
    if (input.fg) args.push("--fg", input.fg);
    if (input.bg) args.push("--bg", input.bg);
    return execRaw("qr-code", args);
  },

  /** Generate a PDF document. Returns { base64, size, pages }. */
  buildPdf(input: PdfInput): PdfOutput {
    const { pageSize, ...doc } = input;
    const args = ["--stdin"];
    if (pageSize) args.push("--page-size", pageSize);
    return exec("pdf-builder", args, JSON.stringify(doc));
  },

  /** Generate a CSV/TSV spreadsheet. Returns the file content as string. */
  buildSpreadsheet(input: SpreadsheetInput): string {
    const { format, formulas, bom, ...data } = input;
    const args = ["--stdin"];
    if (format) args.push("--format", format);
    if (formulas) args.push("--formulas");
    if (bom) args.push("--bom");
    return execRaw("spreadsheet-builder", args, JSON.stringify(data));
  },

  /** Generate an iCalendar (.ics) file. Returns .ics content as string. */
  generateIcal(input: IcalInput): string {
    return execRaw("ical-generator", ["--stdin"], JSON.stringify(input));
  },
};
