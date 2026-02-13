import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { loadSkill, loadAllSkills } from "../src/loader.js";

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
  it("loads all 5 skills from the skills directory", () => {
    const skills = loadAllSkills(SKILLS_DIR);
    expect(skills.length).toBe(5);
    const names = skills.map((s) => s.metadata.name).sort();
    expect(names).toEqual(["csv-analytics", "data-generator", "json-transformer", "markdown-to-html", "text-processing"]);
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
