import { join } from "node:path";
import { loadSkill } from "./loader.js";
import { runScript } from "./runner.js";
import type { Skill } from "./types.js";

const SKILLS_DIR = join(__dirname, "..", "skills");

// ─── Skill input types ──────────────────────────────────────────────────────

export interface InvoiceParserInput {
  /** Invoice text content */
  text: string;
}

export interface InvoiceParserOutput {
  invoice_number: string | null;
  date: string | null;
  due_date: string | null;
  vendor: string | null;
  vendor_address: string | null;
  customer: string | null;
  customer_address: string | null;
  line_items: { description: string; quantity: number | null; unit_price: number | null; amount: number }[];
  subtotal: number | null;
  tax_rate: number | null;
  tax_amount: number | null;
  total: number | null;
  currency: string;
  payment_terms: string | null;
  notes: string | null;
}

export interface EmailComposerInput {
  type: "follow-up" | "cold-outreach" | "meeting-recap" | "escalation" | "thank-you" | "introduction" | "reminder" | "apology";
  to: string;
  from: string;
  subject?: string;
  company?: string;
  points: string[];
  tone?: "formal" | "casual" | "friendly" | "urgent";
}

export interface EmailComposerOutput {
  subject: string;
  body: string;
  html: string;
}

export interface SqlGeneratorInput {
  schema: Record<string, { columns: Record<string, string>; primary_key?: string; foreign_keys?: Record<string, string> }>;
  query: string;
  dialect?: "postgres" | "mysql" | "sqlite";
}

export interface SqlGeneratorOutput {
  sql: string;
  explanation: string;
  tables_used: string[];
  operation: string;
}

export interface SqlCreateTableInput {
  tables: string;
  dialect?: "postgres" | "mysql" | "sqlite";
}

export interface ApiMockResponseInput {
  endpoint: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  count?: number;
  seed?: number;
  status?: number;
}

export interface ApiMockOpenApiInput {
  name: string;
  endpoints: string;
  version?: string;
}

export interface ApiMockEndpointsInput {
  resources: string[];
}

export interface ChartInput {
  type: "bar" | "line" | "pie" | "scatter";
  data: Record<string, number> | number[][];
  title?: string;
  width?: number;
  height?: number;
  colors?: string[];
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function getSkill(name: string): Skill {
  // Try built-in first, then local ./skills
  try { return loadSkill(join(SKILLS_DIR, name)); } catch {}
  return loadSkill(join(process.cwd(), "skills", name));
}

function exec(skillName: string, args: string[], stdin?: string): any {
  const skill = getSkill(skillName);
  const script = skill.scripts[0];
  const result = runScript(skill, script, args, stdin);
  if (result.exitCode !== 0) {
    throw new Error(`Skill "${skillName}" failed (exit ${result.exitCode}): ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const skills = {

  /** Parse invoice/receipt text into structured data */
  parseInvoice(input: InvoiceParserInput): InvoiceParserOutput {
    return exec("invoice-parser", ["--stdin"], input.text);
  },

  /** Compose a professional email */
  composeEmail(input: EmailComposerInput): EmailComposerOutput {
    return exec("email-composer", ["--stdin"], JSON.stringify({
      type: input.type,
      to: input.to,
      from: input.from,
      subject: input.subject,
      company: input.company,
      points: input.points,
      tone: input.tone ?? "formal",
    }));
  },

  /** Generate SQL from natural language + schema */
  generateSql(input: SqlGeneratorInput): SqlGeneratorOutput {
    return exec("sql-generator", ["--stdin"], JSON.stringify({
      schema: input.schema,
      query: input.query,
      dialect: input.dialect ?? "postgres",
    }));
  },

  /** Generate CREATE TABLE SQL from compact definition */
  createTable(input: SqlCreateTableInput): SqlGeneratorOutput {
    const args = ["--create-schema", "--tables", input.tables];
    if (input.dialect) args.push("--dialect", input.dialect);
    return exec("sql-generator", args);
  },

  /** Generate a mock API response */
  mockApiResponse(input: ApiMockResponseInput): any {
    const args = ["response", "--endpoint", input.endpoint];
    if (input.method) args.push("--method", input.method);
    if (input.count) args.push("--count", String(input.count));
    if (input.seed !== undefined) args.push("--seed", String(input.seed));
    if (input.status) args.push("--status", String(input.status));
    return exec("api-mocker", args);
  },

  /** Generate an OpenAPI 3.0 spec */
  mockOpenApi(input: ApiMockOpenApiInput): any {
    const args = ["openapi", "--name", input.name, "--endpoints", input.endpoints];
    if (input.version) args.push("--version", input.version);
    return exec("api-mocker", args);
  },

  /** Generate CRUD endpoint definitions */
  mockEndpoints(input: ApiMockEndpointsInput): any {
    return exec("api-mocker", ["endpoints", "--resources", input.resources.join(",")]);
  },

  /** Generate an SVG chart. Returns raw SVG string. */
  generateChart(input: ChartInput): string {
    const skill = getSkill("chart-generator");
    const script = skill.scripts[0];
    const args = [input.type, "--stdin"];
    if (input.title) args.push("--title", input.title);
    if (input.width) args.push("--width", String(input.width));
    if (input.height) args.push("--height", String(input.height));
    if (input.colors) args.push("--colors", input.colors.join(","));

    const result = runScript(skill, script, args, JSON.stringify(input.data));
    if (result.exitCode !== 0) {
      throw new Error(`Skill "chart-generator" failed: ${result.stderr}`);
    }
    return result.stdout;
  },
};
