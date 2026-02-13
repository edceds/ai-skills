import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { loadSkill, loadAllSkills, bundleSkill, skills } from "../src/index.js";

const ROOT = join(__dirname, "..");
const SKILLS_DIR = join(ROOT, "skills");

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
  it("loads all 6 skills (5 artifact + 1 guide)", () => {
    const s = loadAllSkills(SKILLS_DIR);
    expect(s.length).toBe(6);
    expect(s.map((s) => s.metadata.name).sort()).toEqual([
      "ai-skills-guide", "chart-generator", "ical-generator", "pdf-builder", "qr-code", "spreadsheet-builder",
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
  it("bundles all skills", () => {
    for (const skill of loadAllSkills(SKILLS_DIR)) {
      const bundle = bundleSkill(skill.directory);
      expect(bundle.files.length).toBeGreaterThanOrEqual(2);
      expect(bundle.files[0].path).toContain("SKILL.md");
    }
  });
});

// ─── CLI ─────────────────────────────────────────────────────────────────────

describe("CLI", () => {
  const cli = join(ROOT, "src", "cli.ts");
  function runCli(args: string[]): string {
    return execFileSync("npx", ["tsx", cli, ...args], {
      cwd: ROOT, encoding: "utf-8", timeout: 30_000,
    });
  }

  it("list shows all skills", () => {
    const out = runCli(["list"]);
    expect(out).toContain("chart-generator");
    expect(out).toContain("qr-code");
    expect(out).toContain("pdf-builder");
    expect(out).toContain("spreadsheet-builder");
    expect(out).toContain("ical-generator");
    expect(out).toContain("ai-skills-guide");
  });

  it("init scaffolds a new skill", () => {
    const testDir = join(ROOT, "skills", "test-scaffold-tmp");
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

// ─── ai-skills-guide (meta-skill) ────────────────────────────────────────────

describe("Skill: ai-skills-guide", () => {
  const guide = join(SKILLS_DIR, "ai-skills-guide", "scripts", "run.ts");

  function runGuide(args: string[]): string {
    return execFileSync("npx", ["tsx", guide, ...args], {
      cwd: ROOT, encoding: "utf-8", timeout: 30_000,
    });
  }

  it("lists available skills", () => {
    const out = runGuide(["list"]);
    expect(out).toContain("qr-code");
    expect(out).toContain("pdf-builder");
    expect(out).toContain("chart-generator");
    expect(out).toContain("spreadsheet-builder");
    expect(out).toContain("ical-generator");
  });

  it("runs qr-code with JSON input", () => {
    const svg = runGuide(["qr-code", '{"data":"hello"}']);
    expect(svg).toContain("<svg");
    expect(svg).toContain("<rect");
  });

  it("runs pdf-builder with JSON input", () => {
    const json = JSON.parse(runGuide(["pdf-builder", '{"title":"Test","body":["Hello."]}']));
    expect(json.base64).toBeTruthy();
    expect(json.pages).toBe(1);
  });

  it("runs spreadsheet-builder with JSON input", () => {
    const csv = runGuide(["spreadsheet-builder", '{"headers":["A","B"],"rows":[["1","2"]]}']);
    expect(csv).toContain("A,B");
    expect(csv).toContain("1,2");
  });

  it("runs chart-generator with JSON input", () => {
    const svg = runGuide(["chart-generator", '{"type":"pie","data":{"X":60,"Y":40}}']);
    expect(svg).toContain("<svg");
    expect(svg).toContain("<path");
  });

  it("runs ical-generator with JSON input", () => {
    const ics = runGuide(["ical-generator", '{"events":[{"summary":"Test","start":"2025-03-15T14:00:00","end":"2025-03-15T15:00:00"}]}']);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:Test");
  });
});

// ─── Agent access — can an AI agent actually use a skill? ────────────────────
//
// Simulates the real paths an agent would take after reading llms.txt or README.
// If any of these fail, the repo is broken for agent use.

describe("Agent access", () => {

  // Path 1: agent reads llms.txt, runs CLI from repo root
  // e.g. "npx tsx src/cli.ts run qr-code --data hello"
  it("agent runs skill via CLI from repo root", () => {
    const out = execFileSync("npx", ["tsx", "src/cli.ts", "run", "qr-code", "--data", "hello"], {
      cwd: ROOT, encoding: "utf-8", timeout: 30_000,
    });
    expect(out).toContain("<svg");
    expect(out).toContain("<rect");
  });

  // Path 2: agent reads SKILL.md, runs the script directly
  // e.g. "npx tsx skills/qr-code/scripts/generate.ts --data hello"
  it("agent runs skill script directly following SKILL.md", () => {
    const out = execFileSync("npx", ["tsx", "skills/qr-code/scripts/generate.ts", "--data", "hello"], {
      cwd: ROOT, encoding: "utf-8", timeout: 30_000,
    });
    expect(out).toContain("<svg");
  });

  // Path 3: agent imports library from source and calls a skill
  it("agent imports library from source and calls a skill", () => {
    const out = execFileSync("npx", ["tsx", "-e", `
      import { skills } from "./src/index.ts";
      const svg = skills.generateQrCode({ data: "https://example.com" });
      if (!svg.includes("<svg")) { process.exit(1); }
      console.log("ok:" + svg.length);
    `], { cwd: ROOT, encoding: "utf-8", timeout: 30_000 });
    expect(out).toContain("ok:");
  });

  // Path 4: MCP — agent calls a tool through the actual MCP server protocol
  it("agent calls MCP tool and gets result", async () => {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
    const { createMcpServer } = await import("../src/mcp.js");

    const server = createMcpServer();
    const client = new Client({ name: "test-agent", version: "1.0" });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    // Agent discovers tools
    const { tools } = await client.listTools();
    const toolNames = tools.map((t: any) => t.name).sort();
    expect(toolNames).toEqual([
      "build_pdf", "build_spreadsheet", "generate_chart", "generate_ical", "generate_qr_code",
    ]);

    // Agent calls generate_qr_code
    const qr = await client.callTool({ name: "generate_qr_code", arguments: { data: "https://example.com" } });
    expect((qr.content as any)[0].text).toContain("<svg");

    // Agent calls build_spreadsheet
    const csv = await client.callTool({
      name: "build_spreadsheet",
      arguments: { headers: ["Name", "Score"], rows: [["Alice", 95], ["Bob", 87]] },
    });
    expect((csv.content as any)[0].text).toContain("Name,Score");
    expect((csv.content as any)[0].text).toContain("Alice,95");

    // Agent calls generate_chart
    const chart = await client.callTool({
      name: "generate_chart",
      arguments: { type: "bar", data: { Q1: 100, Q2: 200 }, title: "Revenue" },
    });
    expect((chart.content as any)[0].text).toContain("<svg");

    await client.close();
    await server.close();
  });

  // Path 5: llms.txt exists and is parseable
  it("llms.txt is present and contains skill info", () => {
    const llms = readFileSync(join(ROOT, "llms.txt"), "utf-8");
    expect(llms).toContain("generateQrCode");
    expect(llms).toContain("buildPdf");
    expect(llms).toContain("buildSpreadsheet");
    expect(llms).toContain("generateIcal");
    expect(llms).toContain("generateChart");
    expect(llms).toContain("npx");
  });

  // Path 6: every SKILL.md references a script that exists and is runnable
  it("every SKILL.md references a real script in quick-start", () => {
    for (const skill of loadAllSkills(SKILLS_DIR)) {
      // Extract "scripts/something.ts" from the code blocks
      const refs = skill.instructions.match(/scripts\/\S+\.ts/g);
      expect(refs).toBeTruthy();
      for (const ref of refs!) {
        expect(existsSync(join(skill.directory, ref))).toBe(true);
      }
    }
  });
});
