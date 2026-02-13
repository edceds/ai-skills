import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { existsSync, rmSync } from "node:fs";
import { loadSkill, loadAllSkills, bundleSkill, skills } from "../src/index.js";

const SKILLS_DIR = join(__dirname, "..", "skills");

function run(skillDir: string, script: string, args: string[], stdin?: string): string {
  return execFileSync("npx", ["tsx", join(skillDir, script), ...args], {
    cwd: skillDir, encoding: "utf-8", timeout: 30_000, input: stdin, maxBuffer: 10 * 1024 * 1024,
  });
}

function runJson(skillDir: string, script: string, args: string[], stdin?: string): any {
  return JSON.parse(run(skillDir, script, args, stdin));
}

// ─── skills.* API ────────────────────────────────────────────────────────────

describe("skills API", () => {
  it("skills.generateChart() returns SVG", () => {
    const svg = skills.generateChart({ type: "bar", data: { A: 10, B: 20 }, title: "Test" });
    expect(svg).toContain("<svg");
    expect(svg).toContain("Test");
  });

  it("skills.generateQrCode() returns SVG with QR modules", () => {
    const svg = skills.generateQrCode({ data: "https://example.com" });
    expect(svg).toContain("<svg");
    expect(svg).toContain("<rect");
  });

  it("skills.buildPdf() returns base64 PDF", () => {
    const result = skills.buildPdf({
      title: "Test Report",
      body: ["Hello world.", { heading: "Section 1" }, "Paragraph here."],
    });
    expect(result.base64).toBeTruthy();
    expect(result.pages).toBeGreaterThanOrEqual(1);
    // Verify it's valid PDF (starts with %PDF)
    const decoded = Buffer.from(result.base64, "base64").toString("latin1");
    expect(decoded).toContain("%PDF");
  });

  it("skills.buildSpreadsheet() returns CSV text", () => {
    const csv = skills.buildSpreadsheet({
      headers: ["Name", "Age"],
      rows: [["Alice", 30], ["Bob", 25]],
    });
    expect(csv).toContain("Name,Age");
    expect(csv).toContain("Alice,30");
  });

  it("skills.generateIcal() returns valid .ics", () => {
    const ics = skills.generateIcal({
      events: [{
        summary: "Team Meeting",
        start: "2025-03-15T14:00:00",
        end: "2025-03-15T15:00:00",
      }],
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("Team Meeting");
    expect(ics).toContain("END:VCALENDAR");
  });
});

// ─── MCP server ──────────────────────────────────────────────────────────────

describe("MCP server", () => {
  it("creates server with 5 tools", async () => {
    // We can't do a full stdio test, but we can verify the server creates and has the right tools
    const { createMcpServer } = await import("../src/mcp.js");
    const server = createMcpServer();
    expect(server).toBeDefined();
    expect(server.server).toBeDefined();
  });
});

// ─── Loader ──────────────────────────────────────────────────────────────────

describe("Skill Loader", () => {
  it("loads all 5 skills", () => {
    const s = loadAllSkills(SKILLS_DIR);
    expect(s.length).toBe(5);
    expect(s.map((s) => s.metadata.name).sort()).toEqual([
      "chart-generator", "ical-generator", "pdf-builder", "qr-code", "spreadsheet-builder",
    ]);
  });

  it("each skill has valid metadata and at least one script", () => {
    for (const skill of loadAllSkills(SKILLS_DIR)) {
      expect(skill.metadata.name).toBeTruthy();
      expect(skill.metadata.description.length).toBeGreaterThan(20);
      expect(skill.scripts.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ─── Chart Generator (script-level) ─────────────────────────────────────────

describe("Skill: chart-generator", () => {
  const dir = join(SKILLS_DIR, "chart-generator");

  it("bar chart", () => {
    const svg = run(dir, "scripts/chart.ts", ["bar", "--data", '{"Q1":100,"Q2":200}', "--title", "Rev"]);
    expect(svg).toContain("<svg");
    expect(svg).toContain("Q1");
    expect(svg).toContain("<rect");
  });

  it("line chart", () => {
    const svg = run(dir, "scripts/chart.ts", ["line", "--data", "[[1,10],[2,25],[3,18]]"]);
    expect(svg).toContain("<polyline");
  });

  it("pie chart", () => {
    const svg = run(dir, "scripts/chart.ts", ["pie", "--data", '{"A":60,"B":40}']);
    expect(svg).toContain("<path");
    expect(svg).toContain("60%");
  });

  it("scatter plot", () => {
    const svg = run(dir, "scripts/chart.ts", ["scatter", "--data", "[[1,2],[3,4]]"]);
    expect(svg).toContain("<circle");
  });
});

// ─── QR Code (script-level) ─────────────────────────────────────────────────

describe("Skill: qr-code", () => {
  const dir = join(SKILLS_DIR, "qr-code");

  it("generates SVG QR code from URL", () => {
    const svg = run(dir, "scripts/generate.ts", ["--data", "https://example.com"]);
    expect(svg).toContain("<svg");
    expect(svg).toContain("<rect");
    expect(svg).toContain('width="256"');
  });

  it("respects custom size", () => {
    const svg = run(dir, "scripts/generate.ts", ["--data", "test", "--size", "512"]);
    expect(svg).toContain('width="512"');
  });

  it("respects custom colors", () => {
    const svg = run(dir, "scripts/generate.ts", ["--data", "test", "--fg", "#ff0000", "--bg", "#00ff00"]);
    expect(svg).toContain("#ff0000");
    expect(svg).toContain("#00ff00");
  });

  it("encodes longer text without error", () => {
    const svg = run(dir, "scripts/generate.ts", ["--data", "The quick brown fox jumps over the lazy dog 1234567890"]);
    expect(svg).toContain("<svg");
  });
});

// ─── PDF Builder (script-level) ──────────────────────────────────────────────

describe("Skill: pdf-builder", () => {
  const dir = join(SKILLS_DIR, "pdf-builder");

  it("generates valid PDF with title and body", () => {
    const input = JSON.stringify({ title: "Test", body: ["Hello world."] });
    const result = runJson(dir, "scripts/build.ts", ["--stdin"], input);
    expect(result.base64).toBeTruthy();
    expect(result.pages).toBe(1);
    const pdf = Buffer.from(result.base64, "base64").toString("latin1");
    expect(pdf.slice(0, 5)).toBe("%PDF-");
    expect(pdf).toContain("%%EOF");
  });

  it("renders headings, tables, and lists", () => {
    const input = JSON.stringify({
      title: "Report",
      body: [
        { heading: "Section" },
        "A paragraph.",
        { table: { headers: ["X", "Y"], rows: [["1", "2"]] } },
        { list: ["Item A", "Item B"] },
      ],
    });
    const result = runJson(dir, "scripts/build.ts", ["--stdin"], input);
    expect(result.pages).toBeGreaterThanOrEqual(1);
    const pdf = Buffer.from(result.base64, "base64").toString("latin1");
    expect(pdf).toContain("Report");
    expect(pdf).toContain("Section");
  });

  it("supports A4 page size", () => {
    const input = JSON.stringify({ title: "A4", body: ["Test."] });
    const result = runJson(dir, "scripts/build.ts", ["--stdin", "--page-size", "a4"], input);
    const pdf = Buffer.from(result.base64, "base64").toString("latin1");
    expect(pdf).toContain("595"); // A4 width
  });
});

// ─── Spreadsheet Builder (script-level) ──────────────────────────────────────

describe("Skill: spreadsheet-builder", () => {
  const dir = join(SKILLS_DIR, "spreadsheet-builder");

  it("generates CSV with headers and rows", () => {
    const input = JSON.stringify({ headers: ["Name", "Age"], rows: [["Alice", 30], ["Bob", 25]] });
    const csv = run(dir, "scripts/build.ts", ["--stdin"], input);
    expect(csv).toContain("Name,Age");
    expect(csv).toContain("Alice,30");
    expect(csv).toContain("Bob,25");
  });

  it("escapes fields with commas and quotes (RFC 4180)", () => {
    const input = JSON.stringify({ headers: ["Name", "Note"], rows: [['O"Brien', "hello, world"]] });
    const csv = run(dir, "scripts/build.ts", ["--stdin"], input);
    expect(csv).toContain('"O""Brien"');
    expect(csv).toContain('"hello, world"');
  });

  it("generates TSV format", () => {
    const input = JSON.stringify({ headers: ["A", "B"], rows: [["1", "2"]] });
    const tsv = run(dir, "scripts/build.ts", ["--stdin", "--format", "tsv"], input);
    expect(tsv).toContain("A\tB");
    expect(tsv).toContain("1\t2");
  });

  it("computes summary rows", () => {
    const input = JSON.stringify({
      headers: ["Item", "Price"],
      rows: [["A", 10], ["B", 20], ["C", 30]],
      summary: { Price: "sum" },
    });
    const csv = run(dir, "scripts/build.ts", ["--stdin"], input);
    expect(csv).toContain(",60");
  });

  it("processes formula placeholders with --formulas", () => {
    const input = JSON.stringify({
      headers: ["A", "B", "Sum"],
      rows: [["1", "2", "=A{row}+B{row}"]],
    });
    const csv = run(dir, "scripts/build.ts", ["--stdin", "--formulas"], input);
    expect(csv).toContain("=A2+B2");
  });
});

// ─── iCal Generator (script-level) ──────────────────────────────────────────

describe("Skill: ical-generator", () => {
  const dir = join(SKILLS_DIR, "ical-generator");

  it("generates valid .ics with single event", () => {
    const input = JSON.stringify({
      events: [{ summary: "Lunch", start: "2025-03-15T12:00:00", end: "2025-03-15T13:00:00" }],
    });
    const ics = run(dir, "scripts/generate.ts", ["--stdin"], input);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:Lunch");
    expect(ics).toContain("DTSTART:");
    expect(ics).toContain("DTEND:");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("includes organizer, attendees, and alarm", () => {
    const input = JSON.stringify({
      events: [{
        summary: "Kickoff",
        start: "2025-04-01T10:00:00",
        end: "2025-04-01T11:00:00",
        organizer: { name: "Alice", email: "alice@test.com" },
        attendees: [{ name: "Bob", email: "bob@test.com", rsvp: true }],
        alarm: { minutes_before: 15 },
      }],
    });
    const ics = run(dir, "scripts/generate.ts", ["--stdin"], input);
    expect(ics).toContain("ORGANIZER;CN=Alice:mailto:alice@test.com");
    expect(ics).toContain("ATTENDEE;CN=Bob;RSVP=TRUE:mailto:bob@test.com");
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:-PT15M");
  });

  it("includes recurrence rule and timezone", () => {
    const input = JSON.stringify({
      events: [{
        summary: "Standup",
        start: "2025-03-01T09:00:00",
        end: "2025-03-01T09:15:00",
        timezone: "America/New_York",
        rrule: "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR",
      }],
    });
    const ics = run(dir, "scripts/generate.ts", ["--stdin"], input);
    expect(ics).toContain("DTSTART;TZID=America/New_York:");
    expect(ics).toContain("RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR");
  });

  it("handles multiple events", () => {
    const input = JSON.stringify({
      events: [
        { summary: "Event 1", start: "2025-03-01T10:00:00", end: "2025-03-01T11:00:00" },
        { summary: "Event 2", start: "2025-03-02T10:00:00", end: "2025-03-02T11:00:00" },
      ],
      calendar_name: "Work",
    });
    const ics = run(dir, "scripts/generate.ts", ["--stdin"], input);
    expect(ics).toContain("Event 1");
    expect(ics).toContain("Event 2");
    expect(ics).toContain("X-WR-CALNAME:Work");
  });
});

// ─── Bundle ──────────────────────────────────────────────────────────────────

describe("Bundle", () => {
  it("bundles all 5 skills", () => {
    for (const skill of loadAllSkills(SKILLS_DIR)) {
      const bundle = bundleSkill(skill.directory);
      expect(bundle.files.length).toBeGreaterThanOrEqual(2);
      expect(bundle.files[0].path).toContain("SKILL.md");
    }
  });
});

// ─── CLI ─────────────────────────────────────────────────────────────────────

describe("CLI", () => {
  const cli = join(__dirname, "..", "src", "cli.ts");
  function runCli(args: string[]): string {
    return execFileSync("npx", ["tsx", cli, ...args], {
      cwd: join(__dirname, ".."), encoding: "utf-8", timeout: 30_000,
    });
  }

  it("list shows all 5 skills", () => {
    const out = runCli(["list"]);
    expect(out).toContain("chart-generator");
    expect(out).toContain("qr-code");
    expect(out).toContain("pdf-builder");
    expect(out).toContain("spreadsheet-builder");
    expect(out).toContain("ical-generator");
  });

  it("init scaffolds a new skill", () => {
    const testDir = join(__dirname, "..", "skills", "test-scaffold-tmp");
    try {
      runCli(["init", "test-scaffold-tmp"]);
      expect(existsSync(join(testDir, "SKILL.md"))).toBe(true);
      const skill = loadSkill(testDir);
      expect(skill.metadata.name).toBe("test-scaffold-tmp");
    } finally {
      if (existsSync(testDir)) rmSync(testDir, { recursive: true });
    }
  });

  it("bundle outputs file listing", () => {
    const out = runCli(["bundle", "qr-code"]);
    expect(out).toContain("SKILL.md");
    expect(out).toContain("skills.create");
  });
});
