#!/usr/bin/env node

import { join, resolve } from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { loadSkill, loadAllSkills } from "./loader.js";
import { runScript } from "./runner.js";
import { bundleSkill, generateUploadCurl, generateUsageSnippet } from "./bundle.js";

const BUILT_IN_SKILLS = join(__dirname, "..", "skills");

function log(msg: string) { console.log(msg); }
function err(msg: string) { console.error(`error: ${msg}`); process.exit(1); }
function bold(s: string) { return `\x1b[1m${s}\x1b[0m`; }
function dim(s: string) { return `\x1b[2m${s}\x1b[0m`; }
function green(s: string) { return `\x1b[32m${s}\x1b[0m`; }
function cyan(s: string) { return `\x1b[36m${s}\x1b[0m`; }

function getSkillsDir(): string {
  // Check for local ./skills first, fallback to built-in
  const local = resolve("skills");
  if (existsSync(local)) return local;
  return BUILT_IN_SKILLS;
}

function findSkill(name: string): string {
  // Local first
  const local = resolve("skills", name);
  if (existsSync(join(local, "SKILL.md"))) return local;
  // Built-in
  const builtIn = join(BUILT_IN_SKILLS, name);
  if (existsSync(join(builtIn, "SKILL.md"))) return builtIn;
  err(`Skill "${name}" not found. Run "ai-skills list" to see available skills.`);
  return ""; // unreachable
}

// ─── Commands ────────────────────────────────────────────────────────────────

function cmdList() {
  const dirs = [BUILT_IN_SKILLS];
  const local = resolve("skills");
  if (existsSync(local) && local !== BUILT_IN_SKILLS) dirs.push(local);

  const seen = new Set<string>();

  for (const dir of dirs) {
    const skills = loadAllSkills(dir);
    const label = dir === BUILT_IN_SKILLS ? dim("(built-in)") : dim("(local)");

    for (const skill of skills) {
      if (seen.has(skill.metadata.name)) continue;
      seen.add(skill.metadata.name);
      log(`  ${green(skill.metadata.name.padEnd(22))} ${skill.metadata.description.slice(0, 80)} ${label}`);
    }
  }

  if (seen.size === 0) log("  No skills found.");
  log("");
  log(dim(`  ${seen.size} skills available. Use "ai-skills info <name>" for details.`));
}

function cmdInfo(name: string) {
  const dir = findSkill(name);
  const skill = loadSkill(dir);

  log(bold(skill.metadata.name));
  log(skill.metadata.description);
  log("");
  log(bold("Scripts:"));
  for (const s of skill.scripts) log(`  ${cyan(s)}`);
  if (skill.resources.length) {
    log(bold("Resources:"));
    for (const r of skill.resources) log(`  ${r}`);
  }
  log("");
  log(bold("Instructions:"));
  log(skill.instructions);
}

function cmdRun(name: string, args: string[]) {
  const dir = findSkill(name);
  const skill = loadSkill(dir);

  if (skill.scripts.length === 0) err(`Skill "${name}" has no scripts.`);

  // Use first script by default
  const script = skill.scripts[0];
  const result = runScript(skill, script, args);

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}

function cmdInit(name: string) {
  const dir = resolve("skills", name);
  if (existsSync(dir)) err(`Directory skills/${name} already exists.`);

  mkdirSync(join(dir, "scripts"), { recursive: true });

  writeFileSync(join(dir, "SKILL.md"), `---
name: ${name}
description: TODO — describe what this skill does and when Claude should use it.
---

# ${name.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")}

## Quick start

\`\`\`bash
npx tsx scripts/main.ts --help
\`\`\`

## Operations

Describe the operations this skill supports.

## Input
- \`--file <path>\` or \`--stdin\`

## Output
JSON to stdout.
`);

  writeFileSync(join(dir, "scripts", "main.ts"), `import { readFileSync } from "node:fs";

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.length === 0) {
    console.log("Usage: main.ts <operation> [options]");
    console.log("  --file <path>  Read input from file");
    console.log("  --stdin        Read input from stdin");
    process.exit(0);
  }

  // TODO: implement your skill logic here
  console.log(JSON.stringify({ ok: true, args }, null, 2));
}

main();
`);

  log(green(`Created skills/${name}/`));
  log(`  skills/${name}/SKILL.md`);
  log(`  skills/${name}/scripts/main.ts`);
  log("");
  log(`Edit SKILL.md and scripts/main.ts, then:`);
  log(`  ${cyan(`ai-skills run ${name} --help`)}`);
  log(`  ${cyan(`ai-skills bundle ${name}`)}`);
}

function cmdBundle(name: string, outDir?: string) {
  const dir = findSkill(name);
  const bundle = bundleSkill(dir);

  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    for (const file of bundle.files) {
      const dest = join(outDir, file.path);
      mkdirSync(join(dest, ".."), { recursive: true });
      writeFileSync(dest, file.content);
    }
    log(green(`Bundled ${bundle.files.length} files to ${outDir}/`));
  } else {
    log(bold(`Bundle: ${bundle.display_title}`));
    log(`Files (${bundle.files.length}):`);
    for (const f of bundle.files) {
      log(`  ${f.path} ${dim(`(${f.mime}, ${f.content.length} bytes)`)}`);
    }
  }

  log("");
  log(bold("Upload to Anthropic:"));
  log("");
  log(generateUploadCurl(bundle));
  log("");
  log(bold("Use in your code:"));
  log("");
  log(generateUsageSnippet(bundle));
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === "--help" || cmd === "-h") {
    log(bold("ai-skills") + " — ready-to-use Agent Skills for Claude API\n");
    log("Commands:");
    log(`  ${cyan("list")}                      List available skills`);
    log(`  ${cyan("info")}  ${dim("<skill>")}             Show skill details`);
    log(`  ${cyan("run")}   ${dim("<skill> [args...]")}   Run a skill script locally`);
    log(`  ${cyan("init")}  ${dim("<name>")}              Scaffold a new skill`);
    log(`  ${cyan("bundle")} ${dim("<skill> [--out dir]")} Bundle for Anthropic upload\n`);
    log("Examples:");
    log(`  ${dim("$ ai-skills list")}`);
    log(`  ${dim("$ ai-skills run csv-analytics stats --file data.csv")}`);
    log(`  ${dim("$ ai-skills init my-custom-skill")}`);
    log(`  ${dim("$ ai-skills bundle csv-analytics --out ./dist")}`);
    return;
  }

  switch (cmd) {
    case "list":
    case "ls":
      cmdList();
      break;

    case "info":
      if (!args[1]) err("Usage: ai-skills info <skill-name>");
      cmdInfo(args[1]);
      break;

    case "run":
      if (!args[1]) err("Usage: ai-skills run <skill-name> [args...]");
      cmdRun(args[1], args.slice(2));
      break;

    case "init":
    case "new":
      if (!args[1]) err("Usage: ai-skills init <skill-name>");
      cmdInit(args[1]);
      break;

    case "bundle":
      if (!args[1]) err("Usage: ai-skills bundle <skill-name> [--out dir]");
      const outIdx = args.indexOf("--out");
      cmdBundle(args[1], outIdx !== -1 ? args[outIdx + 1] : undefined);
      break;

    default:
      err(`Unknown command "${cmd}". Run "ai-skills --help" for usage.`);
  }
}

main();
