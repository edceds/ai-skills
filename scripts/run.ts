import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";

const ROOT = join(dirname(__dirname));
const SKILLS_DIR = join(ROOT, "skills");

function usage() {
  console.log(`Usage: run.ts <skill> <json-input>
       run.ts <skill> --stdin
       run.ts list

Skills:
  qr-code              Generate QR code SVG
  pdf-builder          Generate PDF document
  spreadsheet-builder  Generate CSV/TSV spreadsheet
  chart-generator      Generate SVG chart
  ical-generator       Generate iCalendar .ics file

Examples:
  run.ts qr-code '{"data":"https://example.com"}'
  run.ts pdf-builder '{"title":"Report","body":["Hello world."]}'
  run.ts spreadsheet-builder '{"headers":["Name","Age"],"rows":[["Alice",30]]}'
  run.ts chart-generator '{"type":"bar","data":{"Q1":100,"Q2":200}}'
  run.ts ical-generator '{"events":[{"summary":"Meeting","start":"2025-03-15T14:00:00","end":"2025-03-15T15:00:00"}]}'
  echo '{"data":"hello"}' | run.ts qr-code --stdin`);
  process.exit(0);
}

function listSkills() {
  const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && existsSync(join(SKILLS_DIR, d.name, "SKILL.md")));
  for (const d of dirs) {
    const md = readFileSync(join(SKILLS_DIR, d.name, "SKILL.md"), "utf-8");
    const desc = md.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "";
    console.log(`  ${d.name.padEnd(24)} ${desc.slice(0, 70)}`);
  }
}

// ─── Skill dispatch ──────────────────────────────────────────────────────────

interface SkillRoute {
  script: string;
  buildArgs: (input: any) => string[];
  stdin?: (input: any) => string | undefined;
}

const ROUTES: Record<string, SkillRoute> = {
  "qr-code": {
    script: "qr-code/scripts/generate.ts",
    buildArgs(input) {
      const args = ["--data", input.data];
      if (input.size) args.push("--size", String(input.size));
      if (input.ecl) args.push("--ecl", input.ecl);
      if (input.fg) args.push("--fg", input.fg);
      if (input.bg) args.push("--bg", input.bg);
      if (input.out) args.push("--out", input.out);
      return args;
    },
  },
  "pdf-builder": {
    script: "pdf-builder/scripts/build.ts",
    buildArgs(input) {
      const args = ["--stdin"];
      if (input.pageSize) args.push("--page-size", input.pageSize);
      if (input.out) args.push("--out", input.out);
      return args;
    },
    stdin(input) {
      const { pageSize, out, ...doc } = input;
      return JSON.stringify(doc);
    },
  },
  "spreadsheet-builder": {
    script: "spreadsheet-builder/scripts/build.ts",
    buildArgs(input) {
      const args = ["--stdin"];
      if (input.format) args.push("--format", input.format);
      if (input.formulas) args.push("--formulas");
      if (input.bom) args.push("--bom");
      if (input.out) args.push("--out", input.out);
      return args;
    },
    stdin(input) {
      const { format, formulas, bom, out, ...data } = input;
      return JSON.stringify(data);
    },
  },
  "chart-generator": {
    script: "chart-generator/scripts/chart.ts",
    buildArgs(input) {
      const args = [input.type, "--stdin"];
      if (input.title) args.push("--title", input.title);
      if (input.width) args.push("--width", String(input.width));
      if (input.height) args.push("--height", String(input.height));
      if (input.colors) args.push("--colors", input.colors.join(","));
      if (input.out) args.push("--out", input.out);
      return args;
    },
    stdin(input) {
      return JSON.stringify(input.data);
    },
  },
  "ical-generator": {
    script: "ical-generator/scripts/generate.ts",
    buildArgs(input) {
      const args = ["--stdin"];
      if (input.out) args.push("--out", input.out);
      return args;
    },
    stdin(input) {
      const { out, ...data } = input;
      return JSON.stringify(data);
    },
  },
};

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") usage();
  if (args[0] === "list") { listSkills(); return; }

  const skillName = args[0];
  const route = ROUTES[skillName];
  if (!route) {
    console.error(`Unknown skill: ${skillName}. Run with "list" to see available skills.`);
    process.exit(1);
  }

  let jsonStr: string;
  if (args[1] === "--stdin") {
    jsonStr = readFileSync(0, "utf-8");
  } else if (args[1]) {
    jsonStr = args[1];
  } else {
    console.error(`Missing JSON input. Usage: run.ts ${skillName} '<json>' or run.ts ${skillName} --stdin`);
    process.exit(1);
  }

  let input: any;
  try { input = JSON.parse(jsonStr); } catch {
    console.error("Invalid JSON input.");
    process.exit(1);
  }

  const scriptPath = join(SKILLS_DIR, route.script);
  const scriptArgs = route.buildArgs(input);
  const stdinData = route.stdin?.(input) ?? undefined;

  try {
    const out = execFileSync("npx", ["tsx", scriptPath, ...scriptArgs], {
      cwd: join(SKILLS_DIR, skillName),
      encoding: "utf-8",
      timeout: 30_000,
      input: stdinData,
      maxBuffer: 10 * 1024 * 1024,
    });
    process.stdout.write(out);
  } catch (err: any) {
    if (err.stderr) process.stderr.write(err.stderr);
    process.exit(err.status ?? 1);
  }
}

main();
