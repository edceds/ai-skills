import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { existsSync, rmSync } from "node:fs";
import { loadSkill, loadAllSkills } from "../src/loader.js";
import { bundleSkill, generateUploadCurl, generateUsageSnippet } from "../src/bundle.js";

const SKILLS_DIR = join(__dirname, "..", "skills");
const FIXTURES = join(__dirname, "fixtures");

function run(skillDir: string, script: string, args: string[], stdin?: string): string {
  const fullScript = join(skillDir, script);
  return execFileSync("npx", ["tsx", fullScript, ...args], {
    cwd: skillDir, encoding: "utf-8", timeout: 30_000, input: stdin, maxBuffer: 10 * 1024 * 1024,
  });
}

function runJson(skillDir: string, script: string, args: string[], stdin?: string): any {
  return JSON.parse(run(skillDir, script, args, stdin));
}

// ─── Skill Loader ────────────────────────────────────────────────────────────

describe("Skill Loader", () => {
  it("loads all 5 skills from the skills directory", () => {
    const skills = loadAllSkills(SKILLS_DIR);
    expect(skills.length).toBe(5);
    const names = skills.map((s) => s.metadata.name).sort();
    expect(names).toEqual(["api-mocker", "chart-generator", "email-composer", "invoice-parser", "sql-generator"]);
  });

  it("each skill has valid metadata, instructions, and at least one script", () => {
    const skills = loadAllSkills(SKILLS_DIR);
    for (const skill of skills) {
      expect(skill.metadata.name).toBeTruthy();
      expect(skill.metadata.description.length).toBeGreaterThan(20);
      expect(skill.instructions.length).toBeGreaterThan(50);
      expect(skill.scripts.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ─── Invoice Parser ─────────────────────────────────────────────────────────

describe("Skill: invoice-parser", () => {
  const dir = join(SKILLS_DIR, "invoice-parser");

  it("extracts structured fields from invoice text", () => {
    const result = runJson(dir, "scripts/parse.ts", ["--file", join(FIXTURES, "invoice.txt")]);
    expect(result.invoice_number).toBe("INV-2024-0892");
    expect(result.date).toContain("01/15/2024");
    expect(result.due_date).toContain("02/15/2024");
    expect(result.vendor).toBeTruthy();
    expect(result.customer).toContain("Widget");
    expect(result.currency).toBe("USD");
    expect(result.total).toBe(9737.88);
    expect(result.subtotal).toBe(8975);
    expect(result.tax_rate).toBe(8.5);
    expect(result.payment_terms).toContain("Net 30");
  });

  it("extracts line items with quantity and amounts", () => {
    const result = runJson(dir, "scripts/parse.ts", ["--file", join(FIXTURES, "invoice.txt")]);
    expect(result.line_items.length).toBeGreaterThanOrEqual(2);
    const web = result.line_items.find((li: any) => li.description.includes("Web Development"));
    expect(web).toBeDefined();
    expect(web.quantity).toBe(40);
    expect(web.amount).toBe(6000);
  });

  it("handles stdin input", () => {
    const text = "Invoice #ABC-123\nDate: 2024-03-15\nTotal: $500.00\nPayment Terms: Due on receipt";
    const result = runJson(dir, "scripts/parse.ts", ["--stdin"], text);
    expect(result.invoice_number).toBe("ABC-123");
    expect(result.total).toBe(500);
  });
});

// ─── Email Composer ─────────────────────────────────────────────────────────

describe("Skill: email-composer", () => {
  const dir = join(SKILLS_DIR, "email-composer");

  it("composes a follow-up email with subject, body, and html", () => {
    const result = runJson(dir, "scripts/compose.ts", [
      "--type", "follow-up", "--to", "Jane", "--from", "John",
      "--points", "discussed pricing,agreed on timeline",
    ]);
    expect(result.subject).toContain("Following up");
    expect(result.body).toContain("Dear Jane,");
    expect(result.body).toContain("discussed pricing");
    expect(result.body).toContain("John");
    expect(result.html).toContain("<div");
  });

  it("composes a cold outreach with company context", () => {
    const result = runJson(dir, "scripts/compose.ts", [
      "--type", "cold-outreach", "--to", "CEO", "--from", "Alice",
      "--company", "TechCorp", "--points", "saves 40% on operations,used by Fortune 500",
      "--tone", "friendly",
    ]);
    expect(result.subject).toContain("TechCorp");
    expect(result.body).toContain("TechCorp");
    expect(result.body).toContain("saves 40%");
  });

  it("supports all 8 email types without errors", () => {
    const types = ["follow-up", "cold-outreach", "meeting-recap", "escalation", "thank-you", "introduction", "reminder", "apology"];
    for (const type of types) {
      const result = runJson(dir, "scripts/compose.ts", [
        "--type", type, "--to", "Bob", "--from", "Alice", "--points", "test point",
      ]);
      expect(result.subject).toBeTruthy();
      expect(result.body.length).toBeGreaterThan(50);
    }
  });

  it("reads from stdin JSON", () => {
    const input = JSON.stringify({ type: "reminder", to: "Team", from: "Manager", points: ["Q2 report due Friday"], tone: "casual" });
    const result = runJson(dir, "scripts/compose.ts", ["--stdin"], input);
    expect(result.subject).toContain("reminder");
    expect(result.body).toContain("Hi Team,");
    expect(result.body).toContain("Q2 report due Friday");
  });
});

// ─── SQL Generator ──────────────────────────────────────────────────────────

describe("Skill: sql-generator", () => {
  const dir = join(SKILLS_DIR, "sql-generator");
  const schemaPath = join(FIXTURES, "db-schema.json");

  it("generates SELECT with WHERE from natural language", () => {
    const result = runJson(dir, "scripts/generate.ts", [
      "--schema", schemaPath, "--query", "find all users older than 30",
    ]);
    expect(result.sql).toContain("SELECT");
    expect(result.sql).toContain("users");
    expect(result.sql).toContain("> 30");
    expect(result.operation).toBe("SELECT");
    expect(result.tables_used).toContain("users");
  });

  it("generates aggregation with GROUP BY", () => {
    const result = runJson(dir, "scripts/generate.ts", [
      "--schema", schemaPath, "--query", "total amount by status for orders",
    ]);
    expect(result.sql).toContain("SUM");
    expect(result.sql).toContain("GROUP BY");
    expect(result.tables_used).toContain("orders");
  });

  it("generates ORDER BY + LIMIT", () => {
    const result = runJson(dir, "scripts/generate.ts", [
      "--schema", schemaPath, "--query", "top 10 users sorted by name descending",
    ]);
    expect(result.sql).toContain("ORDER BY");
    expect(result.sql).toContain("LIMIT 10");
  });

  it("generates CREATE TABLE from compact definition", () => {
    const result = runJson(dir, "scripts/generate.ts", [
      "--create-schema", "--tables", "users(id,name,email,age,created_at);products(id,name,price,stock)",
    ]);
    expect(result.sql).toContain("CREATE TABLE users");
    expect(result.sql).toContain("CREATE TABLE products");
    expect(result.sql).toContain("SERIAL PRIMARY KEY");
    expect(result.sql).toContain("DECIMAL");
    expect(result.operation).toBe("CREATE TABLE");
  });

  it("handles stdin JSON input", () => {
    const input = JSON.stringify({
      schema: { products: { columns: { id: "serial", name: "varchar", price: "decimal" } } },
      query: "all products",
    });
    const result = runJson(dir, "scripts/generate.ts", ["--stdin"], input);
    expect(result.sql).toContain("SELECT");
    expect(result.sql).toContain("products");
  });
});

// ─── API Mocker ─────────────────────────────────────────────────────────────

describe("Skill: api-mocker", () => {
  const dir = join(SKILLS_DIR, "api-mocker");

  it("generates mock list response for GET /users", () => {
    const result = runJson(dir, "scripts/mock.ts", [
      "response", "--endpoint", "/users", "--method", "GET", "--count", "3", "--seed", "42",
    ]);
    expect(result.data).toBeDefined();
    expect(result.data.length).toBe(3);
    expect(result.data[0].name).toBeTruthy();
    expect(result.data[0].email).toContain("@");
    expect(result.meta.total).toBeGreaterThanOrEqual(3);
  });

  it("generates single resource for GET /users/1", () => {
    const result = runJson(dir, "scripts/mock.ts", [
      "response", "--endpoint", "/users/1", "--method", "GET", "--seed", "10",
    ]);
    expect(result.id).toBeTruthy();
    expect(result.name).toBeTruthy();
    expect(result.data).toBeUndefined();
  });

  it("generates error responses for 4xx/5xx", () => {
    const r404 = runJson(dir, "scripts/mock.ts", ["response", "--endpoint", "/x", "--status", "404"]);
    expect(r404.status).toBe(404);
    expect(r404.error).toBe("Not Found");

    const r500 = runJson(dir, "scripts/mock.ts", ["response", "--endpoint", "/x", "--status", "500"]);
    expect(r500.status).toBe(500);
  });

  it("generates POST response (created)", () => {
    const result = runJson(dir, "scripts/mock.ts", [
      "response", "--endpoint", "/products", "--method", "POST", "--seed", "7",
    ]);
    expect(result.id).toBeTruthy();
    expect(result.message).toContain("created");
  });

  it("generates OpenAPI 3.0 spec", () => {
    const result = runJson(dir, "scripts/mock.ts", [
      "openapi", "--name", "Test API", "--endpoints", "/users:GET,POST;/users/{id}:GET,PUT,DELETE",
    ]);
    expect(result.openapi).toBe("3.0.3");
    expect(result.info.title).toBe("Test API");
    expect(result.paths["/users"]).toBeDefined();
    expect(result.paths["/users"].get).toBeDefined();
    expect(result.paths["/users"].post).toBeDefined();
    expect(result.paths["/users/{id}"].delete).toBeDefined();
    expect(result.paths["/users/{id}"].get.parameters[0].name).toBe("id");
  });

  it("generates CRUD endpoint definitions for resources", () => {
    const result = runJson(dir, "scripts/mock.ts", ["endpoints", "--resources", "users,orders"]);
    expect(result.endpoints.length).toBe(10);
    expect(result.endpoints.some((e: any) => e.path === "/users" && e.method === "GET")).toBe(true);
    expect(result.endpoints.some((e: any) => e.path === "/orders/{id}" && e.method === "DELETE")).toBe(true);
  });

  it("seeded responses are deterministic", () => {
    const a = runJson(dir, "scripts/mock.ts", ["response", "--endpoint", "/users", "--count", "2", "--seed", "99"]);
    const b = runJson(dir, "scripts/mock.ts", ["response", "--endpoint", "/users", "--count", "2", "--seed", "99"]);
    expect(a).toEqual(b);
  });
});

// ─── Chart Generator ────────────────────────────────────────────────────────

describe("Skill: chart-generator", () => {
  const dir = join(SKILLS_DIR, "chart-generator");

  it("generates bar chart SVG with labels and values", () => {
    const svg = run(dir, "scripts/chart.ts", [
      "bar", "--data", '{"Q1":100,"Q2":150,"Q3":200,"Q4":180}', "--title", "Revenue",
    ]);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("Revenue");
    expect(svg).toContain("<rect");
    expect(svg).toContain("Q1");
  });

  it("generates line chart SVG with polyline and dots", () => {
    const svg = run(dir, "scripts/chart.ts", [
      "line", "--data", "[[1,10],[2,25],[3,18],[4,32]]", "--title", "Growth",
    ]);
    expect(svg).toContain("<svg");
    expect(svg).toContain("<polyline");
    expect(svg).toContain("<circle");
    expect(svg).toContain("Growth");
  });

  it("generates pie chart SVG with slices and legend", () => {
    const svg = run(dir, "scripts/chart.ts", [
      "pie", "--data", '{"Chrome":65,"Firefox":15,"Safari":12,"Other":8}',
    ]);
    expect(svg).toContain("<svg");
    expect(svg).toContain("<path");
    expect(svg).toContain("Chrome");
    expect(svg).toContain("65%");
  });

  it("generates scatter plot SVG", () => {
    const svg = run(dir, "scripts/chart.ts", [
      "scatter", "--data", "[[1,2],[3,4],[5,1],[7,8]]",
    ]);
    expect(svg).toContain("<svg");
    expect(svg).toContain("<circle");
  });

  it("reads data from stdin", () => {
    const data = JSON.stringify({ "A": 10, "B": 20, "C": 30 });
    const svg = run(dir, "scripts/chart.ts", ["bar", "--stdin"], data);
    expect(svg).toContain("<svg");
    expect(svg).toContain("A");
  });

  it("respects custom width and height", () => {
    const svg = run(dir, "scripts/chart.ts", [
      "bar", "--data", '{"X":1}', "--width", "800", "--height", "500",
    ]);
    expect(svg).toContain('width="800"');
    expect(svg).toContain('height="500"');
  });
});

// ─── Bundle ─────────────────────────────────────────────────────────────────

describe("Bundle", () => {
  it("bundles a skill with correct file structure", () => {
    const bundle = bundleSkill(join(SKILLS_DIR, "invoice-parser"));
    expect(bundle.display_title).toBe("Invoice Parser");
    expect(bundle.files.length).toBeGreaterThanOrEqual(2);
    expect(bundle.files[0].path).toBe("invoice-parser/SKILL.md");
    expect(bundle.files[0].mime).toBe("text/markdown");
  });

  it("generates Anthropic upload snippet", () => {
    const bundle = bundleSkill(join(SKILLS_DIR, "sql-generator"));
    const snippet = generateUploadCurl(bundle);
    expect(snippet).toContain("anthropic");
    expect(snippet).toContain("skills.create");
  });

  it("generates usage snippet", () => {
    const bundle = bundleSkill(join(SKILLS_DIR, "chart-generator"));
    const snippet = generateUsageSnippet(bundle);
    expect(snippet).toContain("@anthropic-ai/sdk");
    expect(snippet).toContain("skills-2025-10-02");
  });

  it("bundles all 5 skills without errors", () => {
    const skills = loadAllSkills(SKILLS_DIR);
    for (const skill of skills) {
      const bundle = bundleSkill(skill.directory);
      expect(bundle.files.length).toBeGreaterThanOrEqual(2);
      expect(bundle.files[0].path).toContain("SKILL.md");
    }
  });
});

// ─── CLI ────────────────────────────────────────────────────────────────────

describe("CLI", () => {
  const cli = join(__dirname, "..", "src", "cli.ts");

  function runCli(args: string[]): string {
    return execFileSync("npx", ["tsx", cli, ...args], {
      cwd: join(__dirname, ".."), encoding: "utf-8", timeout: 30_000,
    });
  }

  it("--help shows usage", () => {
    const out = runCli(["--help"]);
    expect(out).toContain("ai-skills");
    expect(out).toContain("list");
    expect(out).toContain("run");
    expect(out).toContain("init");
    expect(out).toContain("bundle");
  });

  it("list shows all 5 built-in skills", () => {
    const out = runCli(["list"]);
    expect(out).toContain("invoice-parser");
    expect(out).toContain("email-composer");
    expect(out).toContain("sql-generator");
    expect(out).toContain("api-mocker");
    expect(out).toContain("chart-generator");
  });

  it("info shows skill details", () => {
    const out = runCli(["info", "invoice-parser"]);
    expect(out).toContain("invoice-parser");
    expect(out).toContain("scripts/parse.ts");
  });

  it("run executes a skill script", () => {
    const out = runCli(["run", "api-mocker", "endpoints", "--resources", "users"]);
    const data = JSON.parse(out);
    expect(data.endpoints.length).toBe(5);
  });

  it("init scaffolds a new skill", () => {
    const testSkillDir = join(__dirname, "..", "skills", "test-scaffold-tmp");
    try {
      const out = runCli(["init", "test-scaffold-tmp"]);
      expect(out).toContain("Created");
      expect(existsSync(join(testSkillDir, "SKILL.md"))).toBe(true);
      expect(existsSync(join(testSkillDir, "scripts", "main.ts"))).toBe(true);
      const skill = loadSkill(testSkillDir);
      expect(skill.metadata.name).toBe("test-scaffold-tmp");
    } finally {
      if (existsSync(testSkillDir)) rmSync(testSkillDir, { recursive: true });
    }
  });

  it("bundle shows file listing and upload snippet", () => {
    const out = runCli(["bundle", "email-composer"]);
    expect(out).toContain("Email Composer");
    expect(out).toContain("SKILL.md");
    expect(out).toContain("skills.create");
  });
});
