/** YAML frontmatter from SKILL.md */
export interface SkillMetadata {
  name: string;
  description: string;
}

/** A loaded skill: metadata + instructions + file paths */
export interface Skill {
  metadata: SkillMetadata;
  instructions: string;
  directory: string;
  scripts: string[];
  resources: string[];
}

/** Result from running a skill script */
export interface ScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Anthropic API skill format for upload */
export interface AnthropicSkillFile {
  path: string;
  content: string;
  mime: string;
}

/** Bundle ready for Anthropic API upload */
export interface SkillBundle {
  display_title: string;
  files: AnthropicSkillFile[];
}
