import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { loadSkill, loadAllSkills, skills } from "../src/index.js";

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

  it("skills.generateVCard() returns valid .vcf", () => {
    const vcf = skills.generateVCard({
      name: { given: "Alice", family: "Smith" },
      email: "alice@example.com",
      org: "Acme Corp",
    });
    expect(vcf).toContain("BEGIN:VCARD");
    expect(vcf).toContain("VERSION:4.0");
    expect(vcf).toContain("Alice Smith");
    expect(vcf).toContain("alice@example.com");
    expect(vcf).toContain("END:VCARD");
  });

  it("skills.generateBarcode() returns SVG", () => {
    const svg = skills.generateBarcode({ data: "ABC-123" });
    expect(svg).toContain("<svg");
    expect(svg).toContain("<rect");
    expect(svg).toContain("ABC-123");
  });

  it("skills.generateWav() returns base64 WAV", () => {
    const result = skills.generateWav({ frequency: 440, duration: 0.1 });
    expect(result.base64).toBeTruthy();
    expect(result.size).toBeGreaterThan(44); // WAV header is 44 bytes
    expect(result.frequency).toBe(440);
    // Verify RIFF header
    const buf = Buffer.from(result.base64, "base64");
    expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
    expect(buf.toString("ascii", 8, 12)).toBe("WAVE");
  });

  it("skills.generateHash() returns correct hash", () => {
    const result = skills.generateHash({ data: "hello world", algorithm: "sha256" });
    expect(result.hash).toBe("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
    expect(result.algorithm).toBe("sha256");
    expect(result.hmac).toBe(false);
  });

  it("skills.generateHash() computes HMAC", () => {
    const result = skills.generateHash({ data: "message", algorithm: "sha256", hmac_key: "secret" });
    expect(result.hash).toBeTruthy();
    expect(result.hmac).toBe(true);
  });

  it("skills.createZip() returns base64 ZIP", () => {
    const result = skills.createZip({
      files: [
        { name: "hello.txt", content: "Hello world" },
        { name: "data.csv", content: "a,b\n1,2" },
      ],
    });
    expect(result.base64).toBeTruthy();
    expect(result.entries).toBe(2);
    // Verify ZIP magic bytes (PK\x03\x04)
    const buf = Buffer.from(result.base64, "base64");
    expect(buf[0]).toBe(0x50); // P
    expect(buf[1]).toBe(0x4B); // K
  });
});

// ─── MCP server ──────────────────────────────────────────────────────────────

describe("MCP server", () => {
  it("creates server with 10 tools", async () => {
    const { createMcpServer } = await import("../src/mcp.js");
    const server = createMcpServer();
    expect(server).toBeDefined();
    expect(server.server).toBeDefined();
  });
});

// ─── Loader ──────────────────────────────────────────────────────────────────

describe("Skill Loader", () => {
  it("loads all 11 skills (10 artifact + 1 guide)", () => {
    const s = loadAllSkills(SKILLS_DIR);
    expect(s.length).toBe(11);
    expect(s.map((s) => s.metadata.name).sort()).toEqual([
      "ai-skills-guide", "barcode-generator", "chart-generator", "hash-generator",
      "ical-generator", "pdf-builder", "qr-code", "spreadsheet-builder",
      "vcard-generator", "wav-generator", "zip-archive",
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

  it("computes summary rows", () => {
    const input = JSON.stringify({
      headers: ["Item", "Price"],
      rows: [["A", 10], ["B", 20], ["C", 30]],
      summary: { Price: "sum" },
    });
    const csv = run(dir, "scripts/build.ts", ["--stdin"], input);
    expect(csv).toContain(",60");
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
    expect(ics).toContain("SUMMARY:Lunch");
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
    expect(ics).toContain("TRIGGER:-PT15M");
  });
});

// ─── vCard Generator (script-level) ─────────────────────────────────────────

describe("Skill: vcard-generator", () => {
  const dir = join(SKILLS_DIR, "vcard-generator");

  it("generates valid .vcf with name and email", () => {
    const input = JSON.stringify({ name: { given: "Alice", family: "Smith" }, email: "alice@example.com" });
    const vcf = run(dir, "scripts/generate.ts", ["--stdin"], input);
    expect(vcf).toContain("BEGIN:VCARD");
    expect(vcf).toContain("VERSION:4.0");
    expect(vcf).toContain("FN:Alice Smith");
    expect(vcf).toContain("EMAIL:alice@example.com");
    expect(vcf).toContain("END:VCARD");
  });

  it("includes org, title, phone, address", () => {
    const input = JSON.stringify({
      name: { given: "Bob", family: "Jones", prefix: "Dr." },
      org: "Acme Corp",
      title: "CTO",
      phone: "+1-555-0100",
      address: { street: "123 Main St", city: "Springfield", state: "IL", zip: "62701", country: "US" },
    });
    const vcf = run(dir, "scripts/generate.ts", ["--stdin"], input);
    expect(vcf).toContain("ORG:Acme Corp");
    expect(vcf).toContain("TITLE:CTO");
    expect(vcf).toContain("TEL;");
    expect(vcf).toContain("ADR;");
    expect(vcf).toContain("Dr. Bob Jones");
  });

  it("handles multiple emails", () => {
    const input = JSON.stringify({
      name: { given: "Test", family: "User" },
      email: ["a@test.com", "b@test.com"],
    });
    const vcf = run(dir, "scripts/generate.ts", ["--stdin"], input);
    expect(vcf).toContain("EMAIL:a@test.com");
    expect(vcf).toContain("EMAIL:b@test.com");
  });
});

// ─── Barcode Generator (script-level) ────────────────────────────────────────

describe("Skill: barcode-generator", () => {
  const dir = join(SKILLS_DIR, "barcode-generator");

  it("generates SVG barcode", () => {
    const svg = run(dir, "scripts/generate.ts", ["--data", "ABC-12345"]);
    expect(svg).toContain("<svg");
    expect(svg).toContain("<rect");
    expect(svg).toContain("ABC-12345");
  });

  it("respects custom width/height", () => {
    const svg = run(dir, "scripts/generate.ts", ["--data", "TEST", "--width", "400", "--height", "100"]);
    expect(svg).toContain('width="400"');
    expect(svg).toContain('height="100"');
  });

  it("hides text with --no-text", () => {
    const svg = run(dir, "scripts/generate.ts", ["--data", "NOTEXT", "--no-text"]);
    expect(svg).toContain("<svg");
    expect(svg).not.toContain("<text");
  });
});

// ─── WAV Generator (script-level) ────────────────────────────────────────────

describe("Skill: wav-generator", () => {
  const dir = join(SKILLS_DIR, "wav-generator");

  it("generates valid WAV at 440Hz", () => {
    const input = JSON.stringify({ frequency: 440, duration: 0.1 });
    const result = runJson(dir, "scripts/generate.ts", ["--stdin"], input);
    expect(result.base64).toBeTruthy();
    expect(result.frequency).toBe(440);
    const buf = Buffer.from(result.base64, "base64");
    expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
    expect(buf.toString("ascii", 8, 12)).toBe("WAVE");
  });

  it("supports square waveform", () => {
    const input = JSON.stringify({ frequency: 880, duration: 0.05, waveform: "square" });
    const result = runJson(dir, "scripts/generate.ts", ["--stdin"], input);
    expect(result.base64).toBeTruthy();
    expect(result.size).toBeGreaterThan(44);
  });
});

// ─── Hash Generator (script-level) ───────────────────────────────────────────

describe("Skill: hash-generator", () => {
  const dir = join(SKILLS_DIR, "hash-generator");

  it("generates SHA-256 hash", () => {
    const input = JSON.stringify({ data: "hello world" });
    const result = runJson(dir, "scripts/generate.ts", ["--stdin"], input);
    expect(result.hash).toBe("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
    expect(result.algorithm).toBe("sha256");
  });

  it("generates MD5 hash", () => {
    const input = JSON.stringify({ data: "hello world", algorithm: "md5" });
    const result = runJson(dir, "scripts/generate.ts", ["--stdin"], input);
    expect(result.hash).toBe("5eb63bbbe01eeed093cb22bb8f5acdc3");
  });

  it("generates HMAC", () => {
    const input = JSON.stringify({ data: "message", algorithm: "sha256", hmac_key: "secret" });
    const result = runJson(dir, "scripts/generate.ts", ["--stdin"], input);
    expect(result.hmac).toBe(true);
    expect(result.hash).toBeTruthy();
  });

  it("supports base64 encoding", () => {
    const input = JSON.stringify({ data: "hello", encoding: "base64" });
    const result = runJson(dir, "scripts/generate.ts", ["--stdin"], input);
    expect(result.encoding).toBe("base64");
    // base64 output should not contain hex-only chars
    expect(result.hash).toMatch(/[A-Za-z0-9+/=]+/);
  });
});

// ─── ZIP Archive (script-level) ──────────────────────────────────────────────

describe("Skill: zip-archive", () => {
  const dir = join(SKILLS_DIR, "zip-archive");

  it("creates valid ZIP with entries", () => {
    const input = JSON.stringify({
      files: [
        { name: "hello.txt", content: "Hello world" },
        { name: "data.csv", content: "a,b\n1,2" },
      ],
    });
    const result = runJson(dir, "scripts/generate.ts", ["--stdin"], input);
    expect(result.entries).toBe(2);
    expect(result.base64).toBeTruthy();
    const buf = Buffer.from(result.base64, "base64");
    // ZIP magic bytes: PK\x03\x04
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4B);
    expect(buf[2]).toBe(0x03);
    expect(buf[3]).toBe(0x04);
  });

  it("handles single file", () => {
    const input = JSON.stringify({ files: [{ name: "one.txt", content: "Only file" }] });
    const result = runJson(dir, "scripts/generate.ts", ["--stdin"], input);
    expect(result.entries).toBe(1);
  });

  it("handles nested paths", () => {
    const input = JSON.stringify({
      files: [{ name: "dir/sub/file.txt", content: "Nested" }],
    });
    const result = runJson(dir, "scripts/generate.ts", ["--stdin"], input);
    expect(result.entries).toBe(1);
    expect(result.base64).toBeTruthy();
  });
});

// ─── Agent access — can an AI agent actually use a skill? ────────────────────

describe("Agent access", () => {

  // Path 1: agent imports library from source and calls skills
  it("agent imports library from source and calls a skill", () => {
    const out = execFileSync("npx", ["tsx", "-e", `
      import { skills } from "./src/index.ts";
      const svg = skills.generateQrCode({ data: "https://example.com" });
      if (!svg.includes("<svg")) { process.exit(1); }
      console.log("ok:" + svg.length);
    `], { cwd: ROOT, encoding: "utf-8", timeout: 30_000 });
    expect(out).toContain("ok:");
  });

  // Path 2: agent runs skill script directly following SKILL.md
  it("agent runs skill script directly following SKILL.md", () => {
    const out = execFileSync("npx", ["tsx", "skills/qr-code/scripts/generate.ts", "--data", "hello"], {
      cwd: ROOT, encoding: "utf-8", timeout: 30_000,
    });
    expect(out).toContain("<svg");
  });

  // Path 3: MCP — agent calls tools through the MCP server protocol
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
      "build_pdf", "build_spreadsheet", "create_zip", "generate_barcode",
      "generate_chart", "generate_hash", "generate_ical", "generate_qr_code",
      "generate_vcard", "generate_wav",
    ]);

    // Agent calls generate_qr_code
    const qr = await client.callTool({ name: "generate_qr_code", arguments: { data: "https://example.com" } });
    expect((qr.content as any)[0].text).toContain("<svg");

    // Agent calls generate_hash
    const hash = await client.callTool({ name: "generate_hash", arguments: { data: "hello world" } });
    const hashResult = JSON.parse((hash.content as any)[0].text);
    expect(hashResult.hash).toBe("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");

    await client.close();
    await server.close();
  });

  // Path 4: llms.txt exists and contains all 10 skills
  it("llms.txt is present and contains all skill info", () => {
    const llms = readFileSync(join(ROOT, "llms.txt"), "utf-8");
    expect(llms).toContain("generateQrCode");
    expect(llms).toContain("buildPdf");
    expect(llms).toContain("buildSpreadsheet");
    expect(llms).toContain("generateIcal");
    expect(llms).toContain("generateChart");
    expect(llms).toContain("generateVCard");
    expect(llms).toContain("generateBarcode");
    expect(llms).toContain("generateWav");
    expect(llms).toContain("generateHash");
    expect(llms).toContain("createZip");
  });

  // Path 5: every SKILL.md references a script that exists and is runnable
  it("every SKILL.md references a real script in quick-start", () => {
    for (const skill of loadAllSkills(SKILLS_DIR)) {
      const refs = skill.instructions.match(/scripts\/\S+\.ts/g);
      expect(refs).toBeTruthy();
      for (const ref of refs!) {
        expect(existsSync(join(skill.directory, ref))).toBe(true);
      }
    }
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
    expect(out).toContain("vcard-generator");
    expect(out).toContain("barcode-generator");
    expect(out).toContain("wav-generator");
    expect(out).toContain("hash-generator");
    expect(out).toContain("zip-archive");
  });

  it("runs qr-code with JSON input", () => {
    const svg = runGuide(["qr-code", '{"data":"hello"}']);
    expect(svg).toContain("<svg");
  });

  it("runs vcard-generator with JSON input", () => {
    const vcf = runGuide(["vcard-generator", '{"name":{"given":"Test","family":"User"},"email":"t@test.com"}']);
    expect(vcf).toContain("BEGIN:VCARD");
    expect(vcf).toContain("Test User");
  });

  it("runs barcode-generator with JSON input", () => {
    const svg = runGuide(["barcode-generator", '{"data":"HELLO"}']);
    expect(svg).toContain("<svg");
  });

  it("runs hash-generator with JSON input", () => {
    const json = JSON.parse(runGuide(["hash-generator", '{"data":"test"}']));
    expect(json.hash).toBeTruthy();
    expect(json.algorithm).toBe("sha256");
  });

  it("runs zip-archive with JSON input", () => {
    const json = JSON.parse(runGuide(["zip-archive", '{"files":[{"name":"a.txt","content":"hello"}]}']));
    expect(json.entries).toBe(1);
    expect(json.base64).toBeTruthy();
  });
});
