// The easy API — one function call per skill
export { skills } from "./agent.js";

// Typed inputs/outputs
export type {
  InvoiceParserInput, InvoiceParserOutput,
  EmailComposerInput, EmailComposerOutput,
  SqlGeneratorInput, SqlGeneratorOutput, SqlCreateTableInput,
  ApiMockResponseInput, ApiMockOpenApiInput, ApiMockEndpointsInput,
  ChartInput,
} from "./agent.js";

// Low-level: loader, runner, bundler
export { loadSkill, loadAllSkills, parseFrontmatter } from "./loader.js";
export { runScript } from "./runner.js";
export { bundleSkill, generateUploadCurl, generateUsageSnippet } from "./bundle.js";
export type { Skill, SkillMetadata, ScriptResult, SkillBundle, AnthropicSkillFile } from "./types.js";
