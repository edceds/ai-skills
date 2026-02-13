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
  const result = execFileSync("npx", ["tsx", fullScript, ...args], {
    cwd: skillDir,
    encoding: "utf-8",
    timeout: 30_000,
    input: stdin,
    maxBuffer: 10 * 1024 * 1024,
  });
  return result;
}

function runJson(skillDir: string, script: string, args: string[], stdin?: string): any {
  return JSON.parse(run(skillDir, script, args, stdin));
}

// ─── Skill Loader ────────────────────────────────────────────────────────────

describe("Skill Loader", () => {
  it("loads all 10 skills from the skills directory", () => {
    const skills = loadAllSkills(SKILLS_DIR);
    expect(skills.length).toBe(10);
    const names = skills.map((s) => s.metadata.name).sort();
    expect(names).toEqual([
      "api-mocker", "chart-generator", "csv-analytics", "data-generator",
      "email-composer", "invoice-parser", "json-transformer", "markdown-to-html",
      "sql-generator", "text-processing",
    ]);
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

  it("single skill load works", () => {
    const skill = loadSkill(join(SKILLS_DIR, "csv-analytics"));
    expect(skill.metadata.name).toBe("csv-analytics");
    expect(skill.scripts).toContain("scripts/analyze.ts");
  });
});

// ─── Skill 1: CSV Analytics ─────────────────────────────────────────────────

describe("Skill: csv-analytics", () => {
  const dir = join(SKILLS_DIR, "csv-analytics");

  it("stats: computes column statistics from a CSV file", () => {
    const result = runJson(dir, "scripts/analyze.ts", ["stats", "--file", join(FIXTURES, "sample.csv")]);
    expect(result.name).toBeDefined();
    expect(result.name.count).toBe(8);
    expect(result.name.unique).toBe(8);
    expect(result.age.mean).toBeCloseTo(36.25, 1);
    expect(result.age.min).toBe(28);
    expect(result.age.max).toBe(52);
    expect(result.salary.mean).toBeCloseTo(81375, 0);
  });

  it("stats: reads CSV from stdin", () => {
    const csv = "x,y\n1,10\n2,20\n3,30\n";
    const result = runJson(dir, "scripts/analyze.ts", ["stats", "--stdin"], csv);
    expect(result.x.mean).toBe(2);
    expect(result.y.mean).toBe(20);
    expect(result.y.median).toBe(20);
  });

  it("filter: filters rows by numeric condition", () => {
    const result = runJson(dir, "scripts/analyze.ts", [
      "filter", "--file", join(FIXTURES, "sample.csv"), "--where", "age>35",
    ]);
    expect(result.count).toBe(3);
    expect(result.rows.every((r: any) => Number(r.age) > 35)).toBe(true);
  });

  it("filter: filters rows by string equality", () => {
    const result = runJson(dir, "scripts/analyze.ts", [
      "filter", "--file", join(FIXTURES, "sample.csv"), "--where", "department==engineering",
    ]);
    expect(result.count).toBe(4);
    expect(result.rows.every((r: any) => r.department === "engineering")).toBe(true);
  });

  it("filter: multiple conditions (AND)", () => {
    const result = runJson(dir, "scripts/analyze.ts", [
      "filter", "--file", join(FIXTURES, "sample.csv"),
      "--where", "department==engineering",
      "--where", "age<30",
    ]);
    expect(result.count).toBe(2);
  });

  it("aggregate: group by department, compute mean salary", () => {
    const result = runJson(dir, "scripts/analyze.ts", [
      "aggregate", "--file", join(FIXTURES, "sample.csv"),
      "--group-by", "department",
      "--agg", "salary:mean",
    ]);
    expect(result.length).toBe(3);
    const eng = result.find((r: any) => r.department === "engineering");
    expect(eng).toBeDefined();
    expect(eng.salary_mean).toBeCloseTo(91500, 0);
  });

  it("aggregate: group by + sum", () => {
    const result = runJson(dir, "scripts/analyze.ts", [
      "aggregate", "--file", join(FIXTURES, "sample.csv"),
      "--group-by", "department",
      "--agg", "salary:sum",
    ]);
    const sales = result.find((r: any) => r.department === "sales");
    expect(sales.salary_sum).toBe(135000);
  });
});

// ─── Skill 2: Markdown to HTML ──────────────────────────────────────────────

describe("Skill: markdown-to-html", () => {
  const dir = join(SKILLS_DIR, "markdown-to-html");

  it("converts markdown file to HTML with headings, lists, code", () => {
    const html = run(dir, "scripts/convert.ts", ["--file", join(FIXTURES, "sample.md")]);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<h1>Hello World</h1>");
    expect(html).toContain("<h2>Features</h2>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<li>Item one</li>");
    expect(html).toContain("<code>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>Name</th>");
    expect(html).toContain("<td>Alice</td>");
    expect(html).toContain("<hr>");
    expect(html).toContain('<a href="https://example.com">this link</a>');
    expect(html).toContain("<del>strikethrough</del>");
  });

  it("reads from stdin", () => {
    const html = run(dir, "scripts/convert.ts", ["--stdin", "--title", "Test"], "# Hi\n\nParagraph here.\n");
    expect(html).toContain("<title>Test</title>");
    expect(html).toContain("<h1>Hi</h1>");
    expect(html).toContain("<p>Paragraph here.</p>");
  });

  it("supports dark theme", () => {
    const html = run(dir, "scripts/convert.ts", ["--stdin", "--theme", "dark"], "# Dark\n");
    expect(html).toContain("#1a1a2e"); // dark bg color
  });

  it("extracts title from first heading when not provided", () => {
    const html = run(dir, "scripts/convert.ts", ["--stdin"], "# My Page Title\n\nContent.\n");
    expect(html).toContain("<title>My Page Title</title>");
  });

  it("handles code blocks with language labels", () => {
    const md = "```python\nprint('hello')\n```\n";
    const html = run(dir, "scripts/convert.ts", ["--stdin"], md);
    expect(html).toContain('data-lang="python"');
    expect(html).toContain("print(&#x27;hello&#x27;)".replace(/&#x27;/g, "'") || html).toBeTruthy();
  });
});

// ─── Skill 3: JSON Transformer ──────────────────────────────────────────────

describe("Skill: json-transformer", () => {
  const dir = join(SKILLS_DIR, "json-transformer");

  it("query: extracts nested value by dot-path", () => {
    const result = runJson(dir, "scripts/transform.ts", [
      "query", "--file", join(FIXTURES, "data.json"), "--path", "users[0].name",
    ]);
    expect(result).toBe("Alice");
  });

  it("query: extracts deeply nested value", () => {
    const result = runJson(dir, "scripts/transform.ts", [
      "query", "--file", join(FIXTURES, "data.json"), "--path", "users[1].address.city",
    ]);
    expect(result).toBe("LA");
  });

  it("query: returns null for missing path", () => {
    const result = runJson(dir, "scripts/transform.ts", [
      "query", "--file", join(FIXTURES, "data.json"), "--path", "users[99].name",
    ]);
    expect(result).toBeNull();
  });

  it("flatten: flattens nested object", () => {
    const input = JSON.stringify({ a: { b: { c: 1 }, d: 2 }, e: 3 });
    const result = runJson(dir, "scripts/transform.ts", ["flatten", "--stdin"], input);
    expect(result).toEqual({ "a.b.c": 1, "a.d": 2, "e": 3 });
  });

  it("unflatten: restores nested object", () => {
    const input = JSON.stringify({ "a.b.c": 1, "a.d": 2, "e": 3 });
    const result = runJson(dir, "scripts/transform.ts", ["unflatten", "--stdin"], input);
    expect(result).toEqual({ a: { b: { c: 1 }, d: 2 }, e: 3 });
  });

  it("validate: valid data passes schema", () => {
    const data = JSON.stringify({ name: "Alice", age: 30, email: "a@b.com" });
    const result = runJson(dir, "scripts/transform.ts", [
      "validate", "--stdin", "--schema", join(FIXTURES, "schema.json"),
    ], data);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("validate: invalid data reports errors", () => {
    const data = JSON.stringify({ name: 123, email: "a@b.com" });
    const result = runJson(dir, "scripts/transform.ts", [
      "validate", "--stdin", "--schema", join(FIXTURES, "schema.json"),
    ], data);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e: string) => e.includes("name"))).toBe(true);
    expect(result.errors.some((e: string) => e.includes("age") || e.includes("Missing"))).toBe(true);
  });

  it("diff: detects additions, deletions, and changes", () => {
    const result = runJson(dir, "scripts/transform.ts", [
      "diff", "--file", join(FIXTURES, "data.json"), "--file2", join(FIXTURES, "data2.json"),
    ]);
    expect(result.additions.length).toBeGreaterThan(0); // tags was added
    expect(result.changes.length).toBeGreaterThan(0); // meta.version changed, meta.count changed
  });

  it("pick: selects subset of fields", () => {
    const data = JSON.stringify([
      { id: 1, name: "Alice", age: 30, email: "a@b.com" },
      { id: 2, name: "Bob", age: 25, email: "b@c.com" },
    ]);
    const result = runJson(dir, "scripts/transform.ts", [
      "pick", "--stdin", "--fields", "name,email",
    ], data);
    expect(result).toEqual([
      { name: "Alice", email: "a@b.com" },
      { name: "Bob", email: "b@c.com" },
    ]);
  });
});

// ─── Skill 4: Text Processing ───────────────────────────────────────────────

describe("Skill: text-processing", () => {
  const dir = join(SKILLS_DIR, "text-processing");
  const articlePath = join(FIXTURES, "article.txt");

  it("stats: computes word, sentence, paragraph counts", () => {
    const result = runJson(dir, "scripts/process.ts", ["stats", "--file", articlePath]);
    expect(result.words).toBeGreaterThan(100);
    expect(result.sentences).toBeGreaterThan(10);
    expect(result.paragraphs).toBe(4);
    expect(result.avg_words_per_sentence).toBeGreaterThan(5);
    expect(result.avg_chars_per_word).toBeGreaterThan(3);
  });

  it("keywords: extracts top keywords by frequency", () => {
    const result = runJson(dir, "scripts/process.ts", ["keywords", "--file", articlePath, "--top", "5"]);
    expect(result.length).toBe(5);
    expect(result[0].word).toBeTruthy();
    expect(result[0].count).toBeGreaterThan(1);
    expect(result[0].tf).toBeGreaterThan(0);
    // "fox" or "foxes" should be prominent
    const topWords = result.map((r: any) => r.word);
    expect(topWords.some((w: string) => w.includes("fox"))).toBe(true);
  });

  it("readability: returns grade-level scores", () => {
    const result = runJson(dir, "scripts/process.ts", ["readability", "--file", articlePath]);
    expect(result.flesch_kincaid_grade).toBeDefined();
    expect(result.coleman_liau_index).toBeDefined();
    expect(result.automated_readability_index).toBeDefined();
    expect(result.interpretation).toBeTruthy();
    expect(result.total_syllables).toBeGreaterThan(50);
  });

  it("frequency: returns word frequency table", () => {
    const result = runJson(dir, "scripts/process.ts", ["frequency", "--file", articlePath, "--top", "3"]);
    expect(result.length).toBe(3);
    expect(result[0].count).toBeGreaterThanOrEqual(result[1].count);
  });

  it("summarize: returns extractive summary", () => {
    const result = runJson(dir, "scripts/process.ts", ["summarize", "--file", articlePath, "--sentences", "2"]);
    expect(result.sentences.length).toBe(2);
    expect(result.summary.length).toBeGreaterThan(20);
    // Summary should be subsets of original
    expect(result.sentences.every((s: string) => s.length > 10)).toBe(true);
  });

  it("stats: reads from stdin", () => {
    const text = "Hello world. This is a simple test. Three sentences here.";
    const result = runJson(dir, "scripts/process.ts", ["stats", "--stdin"], text);
    expect(result.words).toBe(10);
    expect(result.sentences).toBe(3);
  });
});

// ─── Skill 5: Data Generator ────────────────────────────────────────────────

describe("Skill: data-generator", () => {
  const dir = join(SKILLS_DIR, "data-generator");

  it("users: generates N user records with correct fields", () => {
    const result = runJson(dir, "scripts/generate.ts", ["users", "--count", "5", "--seed", "42"]);
    expect(result.length).toBe(5);
    for (const user of result) {
      expect(user.id).toBeDefined();
      expect(user.name).toBeTruthy();
      expect(user.email).toContain("@");
      expect(user.age).toBeGreaterThanOrEqual(18);
      expect(user.age).toBeLessThanOrEqual(75);
      expect(user.city).toBeTruthy();
      expect(user.signup_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof user.active).toBe("boolean");
    }
  });

  it("users: seeded output is deterministic", () => {
    const a = runJson(dir, "scripts/generate.ts", ["users", "--count", "3", "--seed", "123"]);
    const b = runJson(dir, "scripts/generate.ts", ["users", "--count", "3", "--seed", "123"]);
    expect(a).toEqual(b);
  });

  it("products: generates product records", () => {
    const result = runJson(dir, "scripts/generate.ts", ["products", "--count", "4", "--seed", "99"]);
    expect(result.length).toBe(4);
    for (const p of result) {
      expect(p.name).toBeTruthy();
      expect(p.category).toBeTruthy();
      expect(p.price).toBeGreaterThan(0);
      expect(p.stock).toBeGreaterThanOrEqual(0);
      expect(p.rating).toBeGreaterThanOrEqual(1);
      expect(p.rating).toBeLessThanOrEqual(5);
      expect(p.sku).toMatch(/^SKU-\d+$/);
    }
  });

  it("timeseries: generates ascending timestamps with optional trend", () => {
    const result = runJson(dir, "scripts/generate.ts", [
      "timeseries", "--count", "7", "--seed", "1", "--start", "2025-01-01", "--interval", "day", "--trend", "2",
    ]);
    expect(result.length).toBe(7);
    for (let i = 1; i < result.length; i++) {
      expect(new Date(result[i].timestamp).getTime()).toBeGreaterThan(new Date(result[i - 1].timestamp).getTime());
    }
    // With trend=2, last values should generally be higher than first
    expect(result[6].value).toBeGreaterThan(result[0].value);
  });

  it("custom: generates data from schema spec", () => {
    const schema = JSON.stringify({
      name: "name",
      score: "int:1:100",
      rating: "float:0:5",
      active: "bool",
      role: "pick:admin,user,viewer",
    });
    const result = runJson(dir, "scripts/generate.ts", ["custom", "--count", "10", "--seed", "7", "--schema", schema]);
    expect(result.length).toBe(10);
    for (const row of result) {
      expect(row.name).toBeTruthy();
      expect(row.score).toBeGreaterThanOrEqual(1);
      expect(row.score).toBeLessThanOrEqual(100);
      expect(row.rating).toBeGreaterThanOrEqual(0);
      expect(row.rating).toBeLessThanOrEqual(5);
      expect(typeof row.active).toBe("boolean");
      expect(["admin", "user", "viewer"]).toContain(row.role);
    }
  });

  it("csv-users: generates CSV output", () => {
    const csvOut = run(dir, "scripts/generate.ts", ["csv-users", "--count", "3", "--seed", "55"]);
    const lines = csvOut.trim().split("\n");
    expect(lines.length).toBe(4); // header + 3 rows
    expect(lines[0]).toContain("name");
    expect(lines[0]).toContain("email");
    expect(lines[0]).toContain("age");
  });
});

// ─── Skill 6: Invoice Parser ────────────────────────────────────────────────

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

  it("extracts line items", () => {
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

// ─── Skill 7: Email Composer ────────────────────────────────────────────────

describe("Skill: email-composer", () => {
  const dir = join(SKILLS_DIR, "email-composer");

  it("composes a follow-up email with subject and body", () => {
    const result = runJson(dir, "scripts/compose.ts", [
      "--type", "follow-up",
      "--to", "Jane",
      "--from", "John",
      "--points", "discussed pricing,agreed on timeline",
    ]);
    expect(result.subject).toContain("Following up");
    expect(result.body).toContain("Dear Jane,");
    expect(result.body).toContain("discussed pricing");
    expect(result.body).toContain("John");
    expect(result.html).toContain("<div");
  });

  it("composes a cold outreach email", () => {
    const result = runJson(dir, "scripts/compose.ts", [
      "--type", "cold-outreach",
      "--to", "CEO",
      "--from", "Alice",
      "--company", "TechCorp",
      "--points", "saves 40% on operations,used by Fortune 500",
      "--tone", "friendly",
    ]);
    expect(result.subject).toContain("TechCorp");
    expect(result.body).toContain("TechCorp");
    expect(result.body).toContain("saves 40%");
  });

  it("supports all email types", () => {
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

// ─── Skill 8: SQL Generator ────────────────────────────────────────────────

describe("Skill: sql-generator", () => {
  const dir = join(SKILLS_DIR, "sql-generator");
  const schemaPath = join(FIXTURES, "db-schema.json");

  it("generates SELECT query from natural language", () => {
    const result = runJson(dir, "scripts/generate.ts", [
      "--schema", schemaPath, "--query", "find all users older than 30",
    ]);
    expect(result.sql).toContain("SELECT");
    expect(result.sql).toContain("users");
    expect(result.sql).toContain("> 30");
    expect(result.operation).toBe("SELECT");
    expect(result.tables_used).toContain("users");
  });

  it("generates aggregation query", () => {
    const result = runJson(dir, "scripts/generate.ts", [
      "--schema", schemaPath, "--query", "total amount by status for orders",
    ]);
    expect(result.sql).toContain("SUM");
    expect(result.sql).toContain("GROUP BY");
    expect(result.tables_used).toContain("orders");
  });

  it("generates sorted/limited query", () => {
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

// ─── Skill 9: API Mocker ───────────────────────────────────────────────────

describe("Skill: api-mocker", () => {
  const dir = join(SKILLS_DIR, "api-mocker");

  it("generates mock list response for /users GET", () => {
    const result = runJson(dir, "scripts/mock.ts", [
      "response", "--endpoint", "/users", "--method", "GET", "--count", "3", "--seed", "42",
    ]);
    expect(result.data).toBeDefined();
    expect(result.data.length).toBe(3);
    expect(result.data[0].name).toBeTruthy();
    expect(result.data[0].email).toContain("@");
    expect(result.meta.total).toBeGreaterThanOrEqual(3);
  });

  it("generates mock single resource for /users/1 GET", () => {
    const result = runJson(dir, "scripts/mock.ts", [
      "response", "--endpoint", "/users/1", "--method", "GET", "--seed", "10",
    ]);
    expect(result.id).toBeTruthy();
    expect(result.name).toBeTruthy();
    expect(result.data).toBeUndefined(); // not a list
  });

  it("generates error responses for 4xx/5xx", () => {
    const r404 = runJson(dir, "scripts/mock.ts", ["response", "--endpoint", "/x", "--status", "404"]);
    expect(r404.status).toBe(404);
    expect(r404.error).toBe("Not Found");

    const r500 = runJson(dir, "scripts/mock.ts", ["response", "--endpoint", "/x", "--status", "500"]);
    expect(r500.status).toBe(500);
  });

  it("generates mock POST response (created)", () => {
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
    expect(result.paths["/users/{id}"].get).toBeDefined();
    expect(result.paths["/users/{id}"].delete).toBeDefined();
    expect(result.paths["/users/{id}"].get.parameters[0].name).toBe("id");
  });

  it("generates CRUD endpoint definitions", () => {
    const result = runJson(dir, "scripts/mock.ts", [
      "endpoints", "--resources", "users,orders",
    ]);
    expect(result.endpoints.length).toBe(10); // 5 per resource
    expect(result.endpoints.some((e: any) => e.path === "/users" && e.method === "GET")).toBe(true);
    expect(result.endpoints.some((e: any) => e.path === "/orders/{id}" && e.method === "DELETE")).toBe(true);
  });

  it("seeded responses are deterministic", () => {
    const a = runJson(dir, "scripts/mock.ts", ["response", "--endpoint", "/users", "--count", "2", "--seed", "99"]);
    const b = runJson(dir, "scripts/mock.ts", ["response", "--endpoint", "/users", "--count", "2", "--seed", "99"]);
    expect(a).toEqual(b);
  });
});

// ─── Skill 10: Chart Generator ─────────────────────────────────────────────

describe("Skill: chart-generator", () => {
  const dir = join(SKILLS_DIR, "chart-generator");

  it("generates a bar chart SVG", () => {
    const svg = run(dir, "scripts/chart.ts", [
      "bar", "--data", '{"Q1":100,"Q2":150,"Q3":200,"Q4":180}', "--title", "Revenue",
    ]);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("Revenue");
    expect(svg).toContain("<rect"); // bars
    expect(svg).toContain("Q1");
  });

  it("generates a line chart SVG", () => {
    const svg = run(dir, "scripts/chart.ts", [
      "line", "--data", "[[1,10],[2,25],[3,18],[4,32]]", "--title", "Growth",
    ]);
    expect(svg).toContain("<svg");
    expect(svg).toContain("<polyline");
    expect(svg).toContain("<circle");
    expect(svg).toContain("Growth");
  });

  it("generates a pie chart SVG with legend", () => {
    const svg = run(dir, "scripts/chart.ts", [
      "pie", "--data", '{"Chrome":65,"Firefox":15,"Safari":12,"Other":8}',
    ]);
    expect(svg).toContain("<svg");
    expect(svg).toContain("<path"); // slices
    expect(svg).toContain("Chrome");
    expect(svg).toContain("65%");
  });

  it("generates a scatter plot SVG", () => {
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

  it("respects custom width/height", () => {
    const svg = run(dir, "scripts/chart.ts", [
      "bar", "--data", '{"X":1}', "--width", "800", "--height", "500",
    ]);
    expect(svg).toContain('width="800"');
    expect(svg).toContain('height="500"');
  });
});

// ─── Bundle & CLI ───────────────────────────────────────────────────────────

describe("Bundle", () => {
  it("bundles a skill with correct file structure", () => {
    const bundle = bundleSkill(join(SKILLS_DIR, "csv-analytics"));
    expect(bundle.display_title).toBe("Csv Analytics");
    expect(bundle.files.length).toBeGreaterThanOrEqual(2); // SKILL.md + at least 1 script
    expect(bundle.files[0].path).toBe("csv-analytics/SKILL.md");
    expect(bundle.files[0].mime).toBe("text/markdown");
    expect(bundle.files[0].content).toContain("---");
    const scriptFile = bundle.files.find((f) => f.path.includes("scripts/"));
    expect(scriptFile).toBeDefined();
    expect(scriptFile!.mime).toBe("text/x-typescript");
  });

  it("generates Anthropic upload snippet", () => {
    const bundle = bundleSkill(join(SKILLS_DIR, "json-transformer"));
    const snippet = generateUploadCurl(bundle);
    expect(snippet).toContain("anthropic");
    expect(snippet).toContain("skills.create");
    expect(snippet).toContain("Json Transformer");
  });

  it("generates usage snippet with skill ID placeholder", () => {
    const bundle = bundleSkill(join(SKILLS_DIR, "text-processing"));
    const snippet = generateUsageSnippet(bundle);
    expect(snippet).toContain("@anthropic-ai/sdk");
    expect(snippet).toContain("skills-2025-10-02");
    expect(snippet).toContain("code_execution");
  });

  it("bundles all 10 skills without errors", () => {
    const skills = loadAllSkills(SKILLS_DIR);
    for (const skill of skills) {
      const bundle = bundleSkill(skill.directory);
      expect(bundle.files.length).toBeGreaterThanOrEqual(2);
      expect(bundle.files[0].path).toContain("SKILL.md");
    }
  });
});

describe("CLI", () => {
  const cli = join(__dirname, "..", "src", "cli.ts");

  function runCli(args: string[]): string {
    return execFileSync("npx", ["tsx", cli, ...args], {
      cwd: join(__dirname, ".."),
      encoding: "utf-8",
      timeout: 30_000,
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

  it("list shows all 10 built-in skills", () => {
    const out = runCli(["list"]);
    expect(out).toContain("csv-analytics");
    expect(out).toContain("markdown-to-html");
    expect(out).toContain("json-transformer");
    expect(out).toContain("text-processing");
    expect(out).toContain("data-generator");
    expect(out).toContain("invoice-parser");
    expect(out).toContain("email-composer");
    expect(out).toContain("sql-generator");
    expect(out).toContain("api-mocker");
    expect(out).toContain("chart-generator");
  });

  it("info shows skill details", () => {
    const out = runCli(["info", "csv-analytics"]);
    expect(out).toContain("csv-analytics");
    expect(out).toContain("scripts/analyze.ts");
    expect(out).toContain("Quick start");
  });

  it("run executes a skill script", () => {
    const out = runCli(["run", "data-generator", "users", "--count", "2", "--seed", "42"]);
    const data = JSON.parse(out);
    expect(data.length).toBe(2);
    expect(data[0].name).toBeTruthy();
  });

  it("init scaffolds a new skill", () => {
    const testSkillDir = join(__dirname, "..", "skills", "test-scaffold-tmp");
    try {
      const out = runCli(["init", "test-scaffold-tmp"]);
      expect(out).toContain("Created");
      expect(existsSync(join(testSkillDir, "SKILL.md"))).toBe(true);
      expect(existsSync(join(testSkillDir, "scripts", "main.ts"))).toBe(true);

      // The scaffolded skill should be loadable
      const skill = loadSkill(testSkillDir);
      expect(skill.metadata.name).toBe("test-scaffold-tmp");
    } finally {
      if (existsSync(testSkillDir)) rmSync(testSkillDir, { recursive: true });
    }
  });

  it("bundle shows file listing and upload snippet", () => {
    const out = runCli(["bundle", "csv-analytics"]);
    expect(out).toContain("Csv Analytics");
    expect(out).toContain("SKILL.md");
    expect(out).toContain("anthropic");
    expect(out).toContain("skills.create");
  });
});
