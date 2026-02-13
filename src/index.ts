// The easy API — one function call per skill
export { skills } from "./agent.js";

// Typed inputs/outputs
export type {
  ChartInput,
  QrCodeInput,
  PdfInput, PdfOutput, PdfBlock,
  SpreadsheetInput, SpreadsheetSheet,
  IcalInput, IcalEvent, IcalAttendee,
} from "./agent.js";

// MCP server
export { createMcpServer } from "./mcp.js";

// Low-level: loader, runner, bundler
export { loadSkill, loadAllSkills, parseFrontmatter } from "./loader.js";
export { runScript } from "./runner.js";
export { bundleSkill, generateUploadCurl, generateUsageSnippet } from "./bundle.js";
export type { Skill, SkillMetadata, ScriptResult, SkillBundle, AnthropicSkillFile } from "./types.js";
