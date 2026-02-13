// ─── Skill types (existing) ──────────────────────────────────────────────────

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

// ─── Marketplace types ───────────────────────────────────────────────────────

/** A skill offered by an agent on the marketplace */
export interface AgentSkill {
  name: string;
  description: string;
  price_per_call: number; // credits
  tags: string[];
  avg_latency_ms: number;
  calls_completed: number;
}

/** An agent registered on the marketplace */
export interface Agent {
  id: string;
  name: string;
  endpoint: string | null; // webhook URL for push-based delegation, null = polling
  skills: AgentSkill[];
  credits: number;
  reputation: number; // 0-100, starts at 50
  status: "online" | "offline" | "busy";
  created_at: string;
}

export type TaskStatus = "pending" | "claimed" | "running" | "completed" | "failed" | "expired";

/** A task delegated from one agent to another */
export interface Task {
  id: string;
  from_agent: string;
  to_agent: string | null; // null = auto-discover best agent
  skill: string;
  input: any;
  status: TaskStatus;
  result: any | null;
  error: string | null;
  cost: number; // credits charged
  platform_fee: number; // credits taken by platform
  created_at: string;
  claimed_at: string | null;
  completed_at: string | null;
}

/** A usage/billing record */
export interface UsageRecord {
  id: string;
  agent_id: string;
  task_id: string;
  skill: string;
  credits: number;
  type: "charge" | "earning" | "fee" | "deposit";
  timestamp: string;
}

/** A step in a workflow */
export interface WorkflowStep {
  id: string;
  skill: string;
  agent: string | null; // specific agent or auto
  input_map: Record<string, string>; // "param" -> "$prev.field" or "$input.field"
}

/** A defined multi-agent workflow */
export interface Workflow {
  id: string;
  name: string;
  owner: string;
  steps: WorkflowStep[];
  created_at: string;
}

export type WorkflowRunStatus = "pending" | "running" | "completed" | "failed";

/** Status of a single step within a running workflow */
export interface WorkflowStepRun {
  step_id: string;
  task_id: string | null;
  status: WorkflowRunStatus;
  output: any | null;
}

/** A running instance of a workflow */
export interface WorkflowRun {
  id: string;
  workflow_id: string;
  status: WorkflowRunStatus;
  input: any;
  output: any | null;
  steps: WorkflowStepRun[];
  created_at: string;
  completed_at: string | null;
}

/** Discovery result */
export interface DiscoveryResult {
  agent: Agent;
  skill: AgentSkill;
  score: number; // relevance 0-1
}
